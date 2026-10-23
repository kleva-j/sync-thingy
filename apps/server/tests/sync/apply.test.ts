import { ClientId, SnapshotId, WorkspaceId, newUuid7 } from "core";
import { DateTime, Schema } from "effect";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { clients, processedChanges, workspaces } from "../../src/db/schema.ts";
import { applyChange, applyChanges, classifyExistingWorkspace } from "../../src/sync/apply.ts";
import { makeTestDatabase } from "../support/database.ts";
import {
  clientA,
  clientB,
  makeDeleteChange,
  makeUpsertChange,
  newChangeId,
  snapshotA,
  snapshotB,
  workspaceId,
} from "../support/changes.ts";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const LATER = new Date("2026-01-01T00:01:00.000Z");

let testDb: Awaited<ReturnType<typeof makeTestDatabase>>;

beforeEach(async () => {
  testDb = await makeTestDatabase();
});

afterEach(async () => {
  await testDb.client.close();
});

test("creates a workspace and records the applied change", async () => {
  const change = makeUpsertChange();
  const result = await applyChange(testDb.db, change, NOW);

  expect(result).toMatchObject({
    status: "applied",
    changeId: change.changeId,
    workspaceId,
    version: 1,
  });
  if (result.status === "applied") {
    expect(DateTime.toEpochMillis(result.updatedAt)).toBe(NOW.getTime());
  }

  const rows = await testDb.db.select().from(workspaces);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    workspaceId,
    snapshotId: snapshotA,
    ownerClientId: clientA,
    lastModifiedByClientId: clientA,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  });

  const processed = await testDb.db.select().from(processedChanges);
  expect(processed).toHaveLength(1);
  expect(processed[0]?.changeId).toBe(change.changeId);
  expect(processed[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
});

test("returns the stored outcome for the same change id and does not bump version", async () => {
  const change = makeUpsertChange();
  await applyChange(testDb.db, change, NOW);

  const result = await applyChange(testDb.db, change, LATER);

  expect(result).toMatchObject({
    status: "duplicate",
    changeId: change.changeId,
    workspaceId,
    version: 1,
  });
  if (result.status === "duplicate") {
    expect(DateTime.toEpochMillis(result.updatedAt)).toBe(NOW.getTime());
  }

  const [row] = await testDb.db.select().from(workspaces);
  expect(row?.version).toBe(1);
  expect(row?.updatedAt).toEqual(NOW);

  const processed = await testDb.db.select().from(processedChanges);
  expect(processed).toHaveLength(1);
});

test("treats a retry with reordered properties as the same change", async () => {
  const change = makeUpsertChange();
  if (change.operation !== "upsert") {
    throw new Error("Expected an upsert change");
  }

  await applyChange(testDb.db, change, NOW);

  const reorderedChange = {
    payload: {
      workspace: {
        lastModifiedByClientId: change.payload.workspace.lastModifiedByClientId,
        ownerClientId: change.payload.workspace.ownerClientId,
        snapshotId: change.payload.workspace.snapshotId,
        workspaceId: change.payload.workspace.workspaceId,
      },
    },
    baseVersion: change.baseVersion,
    operation: change.operation,
    entityId: change.entityId,
    entity: change.entity,
    clientId: change.clientId,
    changeId: change.changeId,
  };

  const result = await applyChange(testDb.db, reorderedChange, LATER);

  expect(result).toMatchObject({ status: "duplicate", version: 1 });
});

test("returns the original outcome when a duplicate is retried after later writes", async () => {
  const change = makeUpsertChange();
  await applyChange(testDb.db, change, NOW);

  await applyChange(testDb.db, makeUpsertChange({ baseVersion: 1, snapshotId: snapshotB }), LATER);

  const result = await applyChange(testDb.db, change, LATER);

  expect(result).toMatchObject({ status: "duplicate", version: 1 });
  if (result.status === "duplicate") {
    expect(DateTime.toEpochMillis(result.updatedAt)).toBe(NOW.getTime());
  }

  const [row] = await testDb.db.select().from(workspaces);
  expect(row?.version).toBe(2);
  expect(row?.updatedAt).toEqual(LATER);
});

test("rejects a second create without leaving a processed or client row", async () => {
  await applyChange(testDb.db, makeUpsertChange(), NOW);

  const result = await applyChange(
    testDb.db,
    makeUpsertChange({
      changeId: newChangeId(),
      clientId: clientB,
      snapshotId: snapshotB,
    }),
    LATER,
  );

  expect(result).toMatchObject({
    status: "rejected",
    reason: "already_exists",
  });

  const processed = await testDb.db.select().from(processedChanges);
  expect(processed).toHaveLength(1);

  const clientRows = await testDb.db.select().from(clients);
  expect(clientRows.map((row) => row.id)).toEqual([clientA]);
});

test("updates a workspace at the expected version", async () => {
  const create = makeUpsertChange();
  await applyChange(testDb.db, create, NOW);

  const update = makeUpsertChange({
    baseVersion: 1,
    snapshotId: snapshotB,
  });
  const result = await applyChange(testDb.db, update, LATER);

  expect(result).toMatchObject({ status: "applied", version: 2 });
  const [row] = await testDb.db.select().from(workspaces);
  expect(row?.snapshotId).toBe(snapshotB);
  expect(row?.version).toBe(2);
  expect(row?.updatedAt).toEqual(LATER);
});

test("returns conflict for a stale base version and records nothing", async () => {
  await applyChange(testDb.db, makeUpsertChange(), NOW);
  const conflictingId = newChangeId();

  const result = await applyChange(
    testDb.db,
    makeUpsertChange({ changeId: conflictingId, baseVersion: 0 }),
    LATER,
  );

  expect(result.status).toBe("conflict");
  if (result.status === "conflict") {
    expect(result.error.expectedVersion).toBe(0);
    expect(result.error.actualVersion).toBe(1);
  }

  const [row] = await testDb.db.select().from(workspaces);
  expect(row?.version).toBe(1);

  const processed = await testDb.db.select().from(processedChanges);
  expect(processed).toHaveLength(1);

  const retry = await applyChange(
    testDb.db,
    makeUpsertChange({ changeId: conflictingId, baseVersion: 0 }),
    LATER,
  );
  expect(retry.status).toBe("conflict");
});

test("rejects ownership and registers no processed row", async () => {
  await applyChange(testDb.db, makeUpsertChange(), NOW);
  const rejectedId = newChangeId();

  const result = await applyChange(
    testDb.db,
    makeUpsertChange({
      changeId: rejectedId,
      clientId: clientB,
      baseVersion: 1,
    }),
    LATER,
  );

  expect(result).toMatchObject({
    status: "rejected",
    reason: "ownership",
  });

  const [row] = await testDb.db.select().from(workspaces);
  expect(row?.version).toBe(1);

  const processed = await testDb.db.select().from(processedChanges);
  expect(processed).toHaveLength(1);

  const clientRows = await testDb.db.select().from(clients);
  expect(clientRows.map((row) => row.id)).toEqual([clientA]);
});

test("rejects invalid payloads and foreign or missing deletes", async () => {
  const otherWorkspaceId = Schema.decodeSync(WorkspaceId)(newUuid7());

  const invalid = await applyChange(
    testDb.db,
    makeUpsertChange({ workspaceId: otherWorkspaceId }),
    NOW,
  );
  expect(invalid).toMatchObject({
    status: "rejected",
    reason: "invalid_payload",
  });

  await applyChange(testDb.db, makeUpsertChange(), NOW);

  const foreign = await applyChange(testDb.db, makeDeleteChange({ clientId: clientB }), LATER);
  expect(foreign).toMatchObject({
    status: "rejected",
    reason: "ownership",
  });

  const missing = await applyChange(
    testDb.db,
    makeDeleteChange({
      entityId: otherWorkspaceId,
      workspaceId: otherWorkspaceId,
    }),
    LATER,
  );
  expect(missing).toMatchObject({
    status: "rejected",
    reason: "not_found",
  });

  const processed = await testDb.db.select().from(processedChanges);
  expect(processed).toHaveLength(1);
});

test("returns conflict for a stale delete", async () => {
  await applyChange(testDb.db, makeUpsertChange(), NOW);

  const result = await applyChange(testDb.db, makeDeleteChange({ baseVersion: 0 }), LATER);

  expect(result.status).toBe("conflict");
  if (result.status === "conflict") {
    expect(result.error.actualVersion).toBe(1);
  }

  const [row] = await testDb.db.select().from(workspaces);
  expect(row?.deletedAt).toBeNull();
});

test("soft deletes and rejects later updates", async () => {
  await applyChange(testDb.db, makeUpsertChange(), NOW);

  const deleted = await applyChange(testDb.db, makeDeleteChange({ baseVersion: 1 }), LATER);
  expect(deleted).toMatchObject({ status: "applied", version: 2 });

  const [row] = await testDb.db.select().from(workspaces);
  expect(row?.deletedAt).toEqual(LATER);
  expect(row?.version).toBe(2);

  const update = await applyChange(
    testDb.db,
    makeUpsertChange({ baseVersion: 2, snapshotId: snapshotB }),
    LATER,
  );
  expect(update).toMatchObject({
    status: "rejected",
    reason: "already_deleted",
  });
});

test("preserves batch order and continues after a rejection", async () => {
  const create = makeUpsertChange();
  const stale = makeUpsertChange({ baseVersion: 0 });
  const otherWorkspaceId = Schema.decodeSync(WorkspaceId)(newUuid7());
  const second = makeUpsertChange({
    entityId: otherWorkspaceId,
    workspaceId: otherWorkspaceId,
    clientId: Schema.decodeSync(ClientId)(newUuid7()),
    snapshotId: Schema.decodeSync(SnapshotId)(newUuid7()),
  });

  const results = await applyChanges(testDb.db, [create, stale, second], NOW);

  expect(results.map((result) => result.status)).toEqual(["applied", "conflict", "applied"]);
});

test("classifies a missed conditional update by current workspace state", async () => {
  await applyChange(testDb.db, makeUpsertChange(), NOW);
  const [active] = await testDb.db.select().from(workspaces);

  const conflict = classifyExistingWorkspace(makeUpsertChange({ baseVersion: 0 }), active);
  expect(conflict).toMatchObject({ status: "conflict" });
  if (conflict.status === "conflict") {
    expect(conflict.error.actualVersion).toBe(1);
  }

  const foreign = classifyExistingWorkspace(
    makeUpsertChange({ clientId: clientB, baseVersion: 0 }),
    active,
  );
  expect(foreign).toMatchObject({ status: "rejected", reason: "ownership" });

  const missing = classifyExistingWorkspace(makeUpsertChange(), undefined);
  expect(missing).toMatchObject({ status: "rejected", reason: "not_found" });

  await applyChange(testDb.db, makeDeleteChange({ baseVersion: 1 }), LATER);
  const [deleted] = await testDb.db.select().from(workspaces);
  const alreadyDeleted = classifyExistingWorkspace(makeUpsertChange({ baseVersion: 2 }), deleted);
  expect(alreadyDeleted).toMatchObject({
    status: "rejected",
    reason: "already_deleted",
  });
});

test("rejects a reused change id when the fingerprint differs", async () => {
  const change = makeUpsertChange();
  await applyChange(testDb.db, change, NOW);

  const changedBaseVersion = makeUpsertChange({
    changeId: change.changeId,
    baseVersion: 1,
  });
  const changedPayload = makeUpsertChange({
    changeId: change.changeId,
    snapshotId: snapshotB,
  });
  const otherWorkspaceId = Schema.decodeSync(WorkspaceId)(newUuid7());
  const wrongEntity = makeUpsertChange({
    changeId: change.changeId,
    entityId: otherWorkspaceId,
    workspaceId: otherWorkspaceId,
    baseVersion: 1,
  });
  const wrongClient = makeUpsertChange({
    changeId: change.changeId,
    clientId: clientB,
    baseVersion: 1,
  });
  const wrongOperation = makeDeleteChange({
    changeId: change.changeId,
    baseVersion: 1,
  });

  for (const candidate of [
    changedBaseVersion,
    changedPayload,
    wrongEntity,
    wrongClient,
    wrongOperation,
  ]) {
    const result = await applyChange(testDb.db, candidate, LATER);
    expect(result).toMatchObject({
      status: "rejected",
      reason: "invalid_payload",
    });
  }

  const [row] = await testDb.db.select().from(workspaces);
  expect(row?.version).toBe(1);
  expect(row?.deletedAt).toBeNull();

  const processed = await testDb.db.select().from(processedChanges);
  expect(processed).toHaveLength(1);
  expect(processed[0]).toMatchObject({
    changeId: change.changeId,
    entityId: workspaceId,
    operation: "upsert",
  });

  const clientRows = await testDb.db.select().from(clients);
  expect(clientRows.map((client) => client.id)).toEqual([clientA]);
});
