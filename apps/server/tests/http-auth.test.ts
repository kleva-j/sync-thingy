/** @effect-diagnostics unstableApiUsage:off */
import { HttpApiMiddleware } from "effect/http-api";
import { expect, test } from "vite-plus/test";
import { Effect, Layer } from "effect";

import { DevAuth, makeDevAuthClient } from "sync-engine";

import { runWithClient } from "./support/http.ts";
import { SyncStore } from "../src/sync/store.ts";

const UnusedSyncStore = Layer.succeed(SyncStore, {
  apply: () => Effect.die("SyncStore.apply must not run in auth tests"),
});

const bypassAuth = HttpApiMiddleware.layerClient(DevAuth, ({ next, request }) => next(request));

test("serves health without auth", async () => {
  await runWithClient(UnusedSyncStore, bypassAuth, (client) => client.health());
});

test("rejects a sync request without a token", async () => {
  const error = await runWithClient(UnusedSyncStore, bypassAuth, (client) =>
    client.sync.syncChanges({ payload: { changes: [] } }).pipe(Effect.flip),
  );

  expect(error._tag).toBe("Unauthorized");
});

test("rejects a sync request with a wrong token", async () => {
  const error = await runWithClient(UnusedSyncStore, makeDevAuthClient("wrong-token"), (client) =>
    client.sync.syncChanges({ payload: { changes: [] } }).pipe(Effect.flip),
  );

  expect(error._tag).toBe("Unauthorized");
});

test("rejects a sync request with an empty token", async () => {
  const error = await runWithClient(UnusedSyncStore, makeDevAuthClient(""), (client) =>
    client.sync.syncChanges({ payload: { changes: [] } }).pipe(Effect.flip),
  );

  expect(error._tag).toBe("Unauthorized");
});
