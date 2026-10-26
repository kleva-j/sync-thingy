/** @effect-diagnostics unstableApiUsage:off */
import type { HttpApiClient } from "effect/http-api";

import { HttpApiMiddleware, HttpApiTest } from "effect/http-api";
import { Effect, Layer } from "effect";
import { Api, SessionAuth, makeSessionAuthClient } from "sync-engine";
import { HttpServer } from "effect/http";

import { SyncApiHandlers, SystemApiHandlers } from "../../src/http.ts";
import { SessionAuthLive, SessionLookup } from "../../src/auth/session.ts";
import { SyncStore } from "../../src/sync/store.ts";
import { userA, userB } from "./changes.ts";

export const NOW = new Date("2026-01-01T00:00:00.000Z");

const makeClient = HttpApiTest.groups(Api, ["system", "sync"]);

const TestSessionLookup = Layer.succeed(SessionLookup, {
  getUserId: async (headers) => {
    const cookie = headers.get("cookie");
    if (!cookie?.startsWith("better-auth.session_token=")) return null;
    const userId = cookie.slice("better-auth.session_token=".length);
    return userId === userA || userId === userB ? userId : null;
  },
});

export const makeSessionClient = (userId: string = userA) =>
  makeSessionAuthClient(`better-auth.session_token=${userId}`);

export const makeTestHandlers = (store: Layer.Layer<SyncStore>) =>
  Layer.mergeAll(
    SystemApiHandlers,
    SyncApiHandlers.pipe(
      Layer.provide(store),
      Layer.provideMerge(SessionAuthLive.pipe(Layer.provide(TestSessionLookup))),
    ),
    HttpServer.layerServices,
  );

export const runWithClient = <A, E>(
  store: Layer.Layer<SyncStore>,
  auth: Layer.Layer<HttpApiMiddleware.ForClient<SessionAuth>>,
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
