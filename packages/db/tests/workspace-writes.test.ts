import { ClientId, SnapshotId, WorkspaceId, newUuid7 } from "core";
import { afterAll, beforeAll, beforeEach, expect, test } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { Schema } from "effect";

import { createTestDatabase, resetTestDatabase } from "@sync-disc/db/testing";

import { createWorkspaceRepository } from "../src/repositories/workspace-repository.ts";
import { createClientRepository } from "../src/repositories/client-repository.ts";
import {
  rotateWorkspaceSnapshotWithOutbox,
  createWorkspaceWithOutbox,
  deleteWorkspaceWithOutbox,
} from "../src/repositories/workspace-writes.ts";

import * as schema from "../src/client-schema.ts";

let database: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
  database = await createTestDatabase("migrated");
});

beforeEach(async () => {
  await resetTestDatabase(database.pg);
});

afterAll(async () => {
  await database.pg.close();
});

const createIds = () => ({
  clientId: Schema.decodeSync(ClientId)(newUuid7()),
  workspaceId: Schema.decodeSync(WorkspaceId)(newUuid7()),
  snapshotId: Schema.decodeSync(SnapshotId)(newUuid7()),
  outboxId: newUuid7(),
});

test("creates a workspace and one pending upsert outbox row", async () => {
  const { db } = database;
  const now = new Date("2026-10-21T12:00:00.000Z");
  const ids = createIds();

  await createClientRepository(db).ensure(ids.clientId);
  const workspace = await createWorkspaceWithOutbox(db, { ...ids, now });
  const outboxRows = await db.select().from(schema.outbox);

  expect(await db.select().from(schema.workspaces)).toEqual([workspace]);
  expect(outboxRows).toHaveLength(1);
  expect(outboxRows[0]).toMatchObject({
    id: ids.outboxId,
    clientId: ids.clientId,
    entity: "workspace",
    entityId: ids.workspaceId,
    operation: "upsert",
    status: "pending",
    baseVersion: null,
    payload: { workspace: { workspaceId: ids.workspaceId } },
  });
});

test("rotates the snapshot without bumping the local version", async () => {
  const { db } = database;
  const ids = createIds();
  const nextSnapshotId = Schema.decodeSync(SnapshotId)(newUuid7());
  const nextOutboxId = newUuid7();

  await createClientRepository(db).ensure(ids.clientId);
  const created = await createWorkspaceWithOutbox(db, {
    ...ids,
    now: new Date("2026-10-21T12:00:00.000Z"),
  });
  const rotated = await rotateWorkspaceSnapshotWithOutbox(db, {
    clientId: ids.clientId,
    workspaceId: ids.workspaceId,
    snapshotId: nextSnapshotId,
    outboxId: nextOutboxId,
    now: new Date("2026-10-21T12:01:00.000Z"),
  });
  const outboxRow = await db.select().from(schema.outbox).where(eq(schema.outbox.id, nextOutboxId));

  expect(rotated).toMatchObject({
    workspaceId: ids.workspaceId,
    snapshotId: nextSnapshotId,
    version: created.version,
  });
  expect(outboxRow[0]).toMatchObject({
    operation: "upsert",
    baseVersion: created.version,
  });
});

test("soft-deletes the workspace and writes one delete outbox row", async () => {
  const { db } = database;
  const ids = createIds();
  const deleteOutboxId = newUuid7();

  await createClientRepository(db).ensure(ids.clientId);
  const created = await createWorkspaceWithOutbox(db, {
    ...ids,
    now: new Date("2026-10-21T12:00:00.000Z"),
  });
  const deleted = await deleteWorkspaceWithOutbox(db, {
    clientId: ids.clientId,
    workspaceId: ids.workspaceId,
    outboxId: deleteOutboxId,
    now: new Date("2026-10-21T12:02:00.000Z"),
  });
  const outboxRow = await db
    .select()
    .from(schema.outbox)
    .where(eq(schema.outbox.id, deleteOutboxId));

  expect(deleted?.deletedAt).not.toBeNull();
  expect(await createWorkspaceRepository(db).listActive(ids.clientId)).toEqual([]);
  expect(outboxRow[0]).toMatchObject({
    entityId: ids.workspaceId,
    operation: "delete",
    baseVersion: created.version,
  });
});

test("rolls back the workspace when the outbox insert fails", async () => {
  const { db } = database;
  const first = createIds();
  const second = createIds();

  await createClientRepository(db).ensure(first.clientId);
  await createWorkspaceWithOutbox(db, {
    ...first,
    now: new Date("2026-10-21T12:00:00.000Z"),
  });

  await expect(
    createWorkspaceWithOutbox(db, {
      ...second,
      clientId: first.clientId,
      outboxId: first.outboxId,
      now: new Date("2026-10-21T12:01:00.000Z"),
    }),
  ).rejects.toThrow();

  expect(await db.select().from(schema.workspaces)).toHaveLength(1);
  expect(await db.select().from(schema.outbox)).toHaveLength(1);
});

test("returns undefined and writes no outbox row for a missing workspace", async () => {
  const { db } = database;
  const ids = createIds();
  const missingId = Schema.decodeSync(WorkspaceId)(newUuid7());

  await createClientRepository(db).ensure(ids.clientId);
  const before = await db.select().from(schema.outbox);

  await expect(
    rotateWorkspaceSnapshotWithOutbox(db, {
      clientId: ids.clientId,
      workspaceId: missingId,
      snapshotId: ids.snapshotId,
      outboxId: newUuid7(),
      now: new Date(),
    }),
  ).resolves.toBeUndefined();
  await expect(
    deleteWorkspaceWithOutbox(db, {
      clientId: ids.clientId,
      workspaceId: missingId,
      outboxId: newUuid7(),
      now: new Date(),
    }),
  ).resolves.toBeUndefined();

  expect(await db.select().from(schema.outbox)).toEqual(before);
});
