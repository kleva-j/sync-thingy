import type { ClientPg } from "@/db/client";

import { applyClientMigrations } from "@sync-disc/db/client-migrations";
import { createClientRepository } from "@sync-disc/db/repositories";
import { clientMigrations } from "@sync-disc/db/migrations";
import { ClientId, WorkspaceId, newUuid7 } from "core";
import { Effect, Layer, Schema } from "effect";
import { expect, test } from "vite-plus/test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { Workspaces, WorkspacesLive } from "@/db/workspaces";
import { CurrentClient } from "@/db/current-client";
import { ClientDatabase } from "@/db/client";

import * as schema from "@sync-disc/db/client-schema";

const createHarness = async () => {
  const pg = new PGlite();
  await applyClientMigrations(pg, clientMigrations);

  const db = drizzle(pg, { schema });
  const clientId = Schema.decodeSync(ClientId)(newUuid7());

  const database = Layer.succeed(ClientDatabase, {
    pg: pg as unknown as ClientPg,
    db,
  });
  const currentClient = Layer.succeed(CurrentClient, { id: clientId });
  const layer = WorkspacesLive.pipe(Layer.provide(Layer.merge(database, currentClient)));

  await createClientRepository(db).ensure(clientId);
  return { pg, db, clientId, layer };
};

test("creates and lists workspaces for the current client", async () => {
  const { pg, clientId, layer } = await createHarness();

  try {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const workspaces = yield* Workspaces;
          const first = yield* workspaces.create();
          const second = yield* workspaces.create();
          const listed = yield* workspaces.list();
          return { first, second, listed };
        }),
        layer,
      ),
    );

    expect(result.listed).toHaveLength(2);
    expect(new Set(result.listed.map((row) => row.workspaceId)).size).toBe(2);
    expect(result.listed.map((row) => row.ownerClientId)).toEqual([clientId, clientId]);
    for (const row of result.listed) {
      expect(row.workspaceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(row.snapshotId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  } finally {
    await pg.close();
  }
});

test("rotates and removes a workspace", async () => {
  const { pg, layer } = await createHarness();

  try {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const workspaces = yield* Workspaces;
          const created = yield* workspaces.create();
          const workspaceId = yield* Schema.decodeEffect(WorkspaceId)(created.workspaceId);
          const rotated = yield* workspaces.rotateSnapshot(workspaceId);
          yield* workspaces.remove(workspaceId);
          return { created, rotated, listed: yield* workspaces.list() };
        }),
        layer,
      ),
    );

    expect(result.rotated.snapshotId).not.toBe(result.created.snapshotId);
    expect(result.rotated.version).toBe(result.created.version);
    expect(result.listed).toEqual([]);
  } finally {
    await pg.close();
  }
});

test("returns WorkspaceNotFound for a missing workspace", async () => {
  const { pg, layer } = await createHarness();
  const missingId = Schema.decodeSync(WorkspaceId)(newUuid7());

  try {
    const error = await Effect.runPromise(
      Effect.provide(
        Effect.flip(
          Effect.gen(function* () {
            const workspaces = yield* Workspaces;
            return yield* workspaces.remove(missingId);
          }),
        ),
        layer,
      ),
    );

    expect(error).toMatchObject({
      _tag: "WorkspaceNotFound",
      id: missingId,
    });
  } finally {
    await pg.close();
  }
});

test("wraps database failures in RepositoryError", async () => {
  const { pg, layer } = await createHarness();

  try {
    await pg.exec("DROP TABLE workspaces CASCADE");
    const error = await Effect.runPromise(
      Effect.provide(
        Effect.flip(
          Effect.gen(function* () {
            const workspaces = yield* Workspaces;
            return yield* workspaces.list();
          }),
        ),
        layer,
      ),
    );

    expect(error).toMatchObject({
      _tag: "RepositoryError",
      operation: "list workspaces",
    });
  } finally {
    await pg.close();
  }
});
