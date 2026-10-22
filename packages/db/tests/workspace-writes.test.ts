import { ClientId, SnapshotId, WorkspaceId, newUuid7 } from "core";
import { expect, test } from "vite-plus/test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { Schema } from "effect";

import { createWorkspaceRepository } from "../src/repositories/workspace-repository.ts";
import { createClientRepository } from "../src/repositories/client-repository.ts";
import { applyClientMigrations } from "../src/client-migrations.ts";
import { clientMigrations } from "../src/migrations.generated.ts";
import {
  rotateWorkspaceSnapshotWithOutbox,
  createWorkspaceWithOutbox,
  deleteWorkspaceWithOutbox,
} from "../src/repositories/workspace-writes.ts";

import * as schema from "../src/client-schema.ts";

const createDatabase = async () => {
  const pg = new PGlite();
  await applyClientMigrations(pg, clientMigrations);
  const db = drizzle(pg, { schema });

  return { pg, db };
};

const createIds = () => ({
  clientId: Schema.decodeSync(ClientId)(newUuid7()),
  workspaceId: Schema.decodeSync(WorkspaceId)(newUuid7()),
  snapshotId: Schema.decodeSync(SnapshotId)(newUuid7()),
  outboxId: newUuid7(),
});

test("creates a workspace and one pending upsert outbox row", async () => {
  const { pg, db } = await createDatabase();
  const now = new Date("2026-10-21T12:00:00.000Z");
  const ids = createIds();

  try {
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
  } finally {
    await pg.close();
  }
});

test("rotates the snapshot without bumping the local version", async () => {
  const { pg, db } = await createDatabase();
  const ids = createIds();
  const nextSnapshotId = Schema.decodeSync(SnapshotId)(newUuid7());
  const nextOutboxId = newUuid7();

  try {
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
    const outboxRow = await db
      .select()
      .from(schema.outbox)
      .where(eq(schema.outbox.id, nextOutboxId));

    expect(rotated).toMatchObject({
      workspaceId: ids.workspaceId,
      snapshotId: nextSnapshotId,
      version: created.version,
    });
    expect(outboxRow[0]).toMatchObject({
      operation: "upsert",
      baseVersion: created.version,
    });
  } finally {
    await pg.close();
  }
});

test("soft-deletes the workspace and writes one delete outbox row", async () => {
  const { pg, db } = await createDatabase();
  const ids = createIds();
  const deleteOutboxId = newUuid7();

  try {
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
  } finally {
    await pg.close();
  }
});

test("rolls back the workspace when the outbox insert fails", async () => {
  const { pg, db } = await createDatabase();
  const first = createIds();
  const second = createIds();

  try {
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
  } finally {
    await pg.close();
  }
});

test("returns undefined and writes no outbox row for a missing workspace", async () => {
  const { pg, db } = await createDatabase();
  const ids = createIds();
  const missingId = Schema.decodeSync(WorkspaceId)(newUuid7());

  try {
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
  } finally {
    await pg.close();
  }
});
