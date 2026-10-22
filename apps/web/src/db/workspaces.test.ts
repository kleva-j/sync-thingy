import type { ClientPg } from "@/db/client";

import { createClientRepository } from "@sync-disc/db/repositories";
import { createTestDatabase, resetTestDatabase } from "@sync-disc/db/testing";
import { ClientId, WorkspaceId, newUuid7 } from "core";
import { Effect, Layer, Schema } from "effect";
import { afterAll, beforeAll, beforeEach, expect, test } from "vite-plus/test";

import { Workspaces, WorkspacesLive } from "@/db/workspaces";
import { CurrentClient } from "@/db/current-client";
import { ClientDatabase } from "@/db/client";

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

const createHarness = async (testDatabase: typeof database) => {
  const clientId = Schema.decodeSync(ClientId)(newUuid7());

  const databaseLayer = Layer.succeed(ClientDatabase, {
    pg: testDatabase.pg as unknown as ClientPg,
    db: testDatabase.db,
  });
  const currentClient = Layer.succeed(CurrentClient, { id: clientId });
  const layer = WorkspacesLive.pipe(Layer.provide(Layer.merge(databaseLayer, currentClient)));

  await createClientRepository(testDatabase.db).ensure(clientId);

  return { clientId, layer };
};

test("creates and lists workspaces for the current client", async () => {
  const { clientId, layer } = await createHarness(database);

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
});

test("rotates and removes a workspace", async () => {
  const { layer } = await createHarness(database);

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
});

test("returns WorkspaceNotFound for a missing workspace", async () => {
  const { layer } = await createHarness(database);
  const missingId = Schema.decodeSync(WorkspaceId)(newUuid7());

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
});

test("wraps database failures in RepositoryError", async () => {
  await database.pg.exec("BEGIN");

  try {
    await database.pg.exec("DROP TABLE workspaces CASCADE");
    const { layer } = await createHarness(database);

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
    await database.pg.exec("ROLLBACK");
  }
});
