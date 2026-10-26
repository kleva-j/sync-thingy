/** @effect-diagnostics unstableApiUsage:off */
import { HttpApiMiddleware } from "effect/http-api";
import { expect, test } from "vite-plus/test";
import { Effect, Layer } from "effect";

import { SessionAuth } from "sync-engine";

import { makeSessionClient, runWithClient } from "./support/http.ts";
import { SyncStore } from "../src/sync/store.ts";

const UnusedSyncStore = Layer.succeed(SyncStore, {
  apply: () => Effect.die("SyncStore.apply must not run in auth tests"),
});

const bypassAuth = HttpApiMiddleware.layerClient(
  SessionAuth,
  ({ next, request }) => next(request),
);

test("serves health without auth", async () => {
  await runWithClient(UnusedSyncStore, bypassAuth, (client) => client.health());
});

test("rejects a sync request without a token", async () => {
  const error = await runWithClient(UnusedSyncStore, bypassAuth, (client) =>
    client.sync.syncChanges({ payload: { changes: [] } }).pipe(Effect.flip),
  );

  expect(error._tag).toBe("Unauthorized");
});

test("rejects a sync request with an invalid session cookie", async () => {
  const error = await runWithClient(
    UnusedSyncStore,
    makeSessionClient("00000000-0000-4000-8000-000000000003"),
    (client) =>
      client.sync.syncChanges({ payload: { changes: [] } }).pipe(Effect.flip),
  );

  expect(error._tag).toBe("Unauthorized");
});

test("rejects a sync request without a session cookie", async () => {
  const error = await runWithClient(UnusedSyncStore, bypassAuth, (client) =>
    client.sync.syncChanges({ payload: { changes: [] } }).pipe(Effect.flip),
  );

  expect(error._tag).toBe("Unauthorized");
});
