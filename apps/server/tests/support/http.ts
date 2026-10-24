/** @effect-diagnostics unstableApiUsage:off */
import type { HttpApiClient } from "effect/http-api";

import { HttpApiMiddleware, HttpApiTest } from "effect/http-api";
import { Effect, Layer, Option, Redacted } from "effect";
import { Api, DevAuth } from "sync-engine";
import { HttpServer } from "effect/http";

import { SyncApiHandlers, SystemApiHandlers } from "../../src/http.ts";
import { DevAuthLayer } from "../../src/auth/dev-token.ts";
import { SyncStore } from "../../src/sync/store.ts";

export const TOKEN = "test-token";
export const NOW = new Date("2026-01-01T00:00:00.000Z");

const makeClient = HttpApiTest.groups(Api, ["system", "sync"]);

export const makeTestHandlers = (store: Layer.Layer<SyncStore>) =>
  Layer.mergeAll(
    SystemApiHandlers,
    SyncApiHandlers.pipe(
      Layer.provide(store),
      Layer.provideMerge(DevAuthLayer(Option.some(Redacted.make(TOKEN)))),
    ),
    HttpServer.layerServices,
  );

export const runWithClient = <A, E>(
  store: Layer.Layer<SyncStore>,
  auth: Layer.Layer<HttpApiMiddleware.ForClient<DevAuth>>,
  effect: (client: HttpApiClient.ForApi<typeof Api>) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient;
        return yield* effect(client);
      }).pipe(Effect.provide(Layer.merge(makeTestHandlers(store), auth))),
    ),
  );
