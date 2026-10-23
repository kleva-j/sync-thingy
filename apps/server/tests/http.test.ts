/** @effect-diagnostics unstableApiUsage:off */
import type { HttpApiClient } from "effect/http-api";

import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import { DateTime, Effect, Layer, Option, Redacted } from "effect";
import { HttpApiMiddleware, HttpApiTest } from "effect/http-api";
import { HttpServer } from "effect/http";

import { Api, DevAuth, makeDevAuthClient } from "sync-engine";

import { makeDeleteChange, makeUpsertChange, workspaceId } from "./support/changes.ts";
import { SyncApiHandlers, SystemApiHandlers } from "../src/http.ts";
import { makeSyncStore, SyncStore } from "../src/sync/store.ts";
import { makeTestDatabase } from "./support/database.ts";
import { DevAuthLayer } from "../src/auth/dev-token.ts";

const TOKEN = "test-token";
const NOW = new Date("2026-01-01T00:00:00.000Z");
const makeClient = HttpApiTest.groups(Api, ["system", "sync"]);

let testDb: Awaited<ReturnType<typeof makeTestDatabase>>;

beforeEach(async () => {
  testDb = await makeTestDatabase();
});

afterEach(async () => {
  await testDb.client.close();
});

const testHandlers = () =>
  Layer.mergeAll(
    SystemApiHandlers,
    SyncApiHandlers.pipe(
      Layer.provide(
        Layer.succeed(
          SyncStore,
          makeSyncStore(testDb.db, () => NOW),
        ),
      ),
      Layer.provideMerge(DevAuthLayer(Option.some(Redacted.make(TOKEN)))),
    ),
    HttpServer.layerServices,
  );

const runWithClient = <A, E>(
  auth: Layer.Layer<HttpApiMiddleware.ForClient<DevAuth>>,
  effect: (client: HttpApiClient.ForApi<typeof Api>) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient;
        return yield* effect(client);
      }).pipe(Effect.provide(Layer.merge(testHandlers(), auth))),
    ),
  );

test("serves health without auth", async () => {
  await runWithClient(
    HttpApiMiddleware.layerClient(DevAuth, ({ next, request }) => next(request)),
    (client) => client.health(),
  );
});

test("rejects a sync request without a token", async () => {
  const error = await runWithClient(
    HttpApiMiddleware.layerClient(DevAuth, ({ next, request }) => next(request)),
    (client) => client.sync.syncChanges({ payload: { changes: [] } }).pipe(Effect.flip),
  );

  expect(error._tag).toBe("Unauthorized");
});

test("rejects a sync request with a wrong token", async () => {
  const error = await runWithClient(makeDevAuthClient("wrong-token"), (client) =>
    client.sync.syncChanges({ payload: { changes: [] } }).pipe(Effect.flip),
  );

  expect(error._tag).toBe("Unauthorized");
});

test("rejects a sync request with an empty token", async () => {
  const error = await runWithClient(makeDevAuthClient(""), (client) =>
    client.sync.syncChanges({ payload: { changes: [] } }).pipe(Effect.flip),
  );

  expect(error._tag).toBe("Unauthorized");
});

test("applies a workspace upsert through the API", async () => {
  const change = makeUpsertChange();
  const response = await runWithClient(makeDevAuthClient(TOKEN), (client) =>
    client.sync.syncChanges({ payload: { changes: [change] } }),
  );

  expect(response.results[0]).toMatchObject({
    status: "applied",
    workspaceId,
    version: 1,
  });
});

test("returns duplicate on a repeated change", async () => {
  const change = makeUpsertChange();
  const response = await runWithClient(makeDevAuthClient(TOKEN), (client) =>
    client.sync.syncChanges({ payload: { changes: [change] } }),
  );
  expect(response.results[0]?.status).toBe("applied");

  const retry = await runWithClient(makeDevAuthClient(TOKEN), (client) =>
    client.sync.syncChanges({ payload: { changes: [change] } }),
  );
  const duplicate = retry.results[0];
  expect(duplicate).toMatchObject({ status: "duplicate", version: 1 });
  if (duplicate?.status === "duplicate") {
    expect(DateTime.toEpochMillis(duplicate.updatedAt)).toBe(NOW.getTime());
  }
});

test("returns a conflict result for a stale update", async () => {
  await runWithClient(makeDevAuthClient(TOKEN), (client) =>
    client.sync.syncChanges({ payload: { changes: [makeUpsertChange()] } }),
  );

  const response = await runWithClient(makeDevAuthClient(TOKEN), (client) =>
    client.sync.syncChanges({
      payload: {
        changes: [makeUpsertChange({ baseVersion: 0 })],
      },
    }),
  );

  const conflict = response.results[0];
  expect(conflict?.status).toBe("conflict");
  if (conflict?.status === "conflict") {
    expect(conflict.error.actualVersion).toBe(1);
  }
});

test("applies a soft delete through the API", async () => {
  await runWithClient(makeDevAuthClient(TOKEN), (client) =>
    client.sync.syncChanges({ payload: { changes: [makeUpsertChange()] } }),
  );

  const response = await runWithClient(makeDevAuthClient(TOKEN), (client) =>
    client.sync.syncChanges({
      payload: { changes: [makeDeleteChange({ baseVersion: 1 })] },
    }),
  );

  expect(response.results[0]).toMatchObject({
    status: "applied",
    version: 2,
  });
});
