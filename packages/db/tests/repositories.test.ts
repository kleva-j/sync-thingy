import { ClientId, SnapshotId, WorkspaceId, newUuid7 } from "core";
import { afterAll, beforeAll, beforeEach, expect, test } from "vite-plus/test";
import { Schema } from "effect";

import { createTestDatabase, resetTestDatabase } from "@sync-disc/db/testing";

import { createWorkspaceRepository } from "../src/repositories/workspace-repository.ts";
import { createClientRepository } from "../src/repositories/client-repository.ts";
import { createOutboxRepository } from "../src/repositories/outbox-repository.ts";

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

test("ensures a client once and finds it by ID", async () => {
  const { db } = database;
  const clientId = Schema.decodeSync(ClientId)(newUuid7());

  const repository = createClientRepository(db);
  const first = await repository.ensure(clientId);
  const second = await repository.ensure(clientId);

  expect(second).toEqual(first);
  expect(await repository.findById(clientId)).toEqual(first);
});

test("creates, lists, updates, and soft-deletes active workspaces", async () => {
  const { db } = database;
  const clientId = Schema.decodeSync(ClientId)(newUuid7());
  const workspaceId = Schema.decodeSync(WorkspaceId)(newUuid7());
  const snapshotId = Schema.decodeSync(SnapshotId)(newUuid7());
  const nextSnapshotId = Schema.decodeSync(SnapshotId)(newUuid7());
  const now = new Date("2026-10-21T12:00:00.000Z");

  await createClientRepository(db).ensure(clientId);
  const repository = createWorkspaceRepository(db);

  const created = await repository.insert({
    workspaceId,
    snapshotId,
    ownerClientId: clientId,
    lastModifiedByClientId: clientId,
    createdAt: now,
    updatedAt: now,
  });

  expect(created.version).toBe(1);
  expect(await repository.listActive(clientId)).toEqual([created]);

  const edited = await repository.updateSnapshot(workspaceId, {
    snapshotId: nextSnapshotId,
    lastModifiedByClientId: clientId,
    updatedAt: new Date("2026-10-21T12:01:00.000Z"),
  });

  expect(edited).toMatchObject({ snapshotId: nextSnapshotId, version: 1 });

  const deleted = await repository.softDelete(workspaceId, {
    lastModifiedByClientId: clientId,
    updatedAt: new Date("2026-10-21T12:02:00.000Z"),
    deletedAt: new Date("2026-10-21T12:02:00.000Z"),
  });

  expect(deleted?.deletedAt).not.toBeNull();
  expect(await repository.listActive(clientId)).toEqual([]);
  expect(await repository.findActiveById(workspaceId)).toBeUndefined();
});

test("inserts a pending outbox row", async () => {
  const { db } = database;
  const clientId = Schema.decodeSync(ClientId)(newUuid7());
  const workspaceId = Schema.decodeSync(WorkspaceId)(newUuid7());
  const outboxId = newUuid7();
  const now = new Date("2026-10-21T12:00:00.000Z");

  await createClientRepository(db).ensure(clientId);

  const row = await createOutboxRepository(db).insertPending({
    id: outboxId,
    clientId,
    userId: null,
    entity: "workspace",
    entityId: workspaceId,
    operation: "upsert",
    payload: { workspaceId },
    baseVersion: null,
    createdAt: now,
  });

  expect(row).toMatchObject({
    id: outboxId,
    status: "pending",
    attempts: 0,
    operation: "upsert",
  });
});
