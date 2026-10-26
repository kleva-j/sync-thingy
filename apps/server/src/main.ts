/** @effect-diagnostics unstableApiUsage:off */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { HttpApiBuilder } from "effect/http-api";
import { createServer } from "node:http";
import { HttpRouter } from "effect/http";
import { Effect, Layer } from "effect";

import { Api } from "sync-engine";

import { SyncApiHandlers, SystemApiHandlers } from "./http.ts";
import { ServerConfig, ServerConfigLive } from "./config.ts";
import { SyncStoreLive } from "./sync/store.ts";
import { DatabaseLive } from "./db/database.ts";
import {
  BetterAuthSessionLive,
  ServerAuthRoutes,
  ServerAuthLive,
} from "./auth/index.ts";

const Main = Layer.unwrap(
  Effect.gen(function* () {
    const { port } = yield* ServerConfig;
    const ServerAuthServices = ServerAuthLive.pipe(Layer.provideMerge(DatabaseLive));
    const AuthServices = BetterAuthSessionLive.pipe(Layer.provideMerge(ServerAuthServices));
    const SyncStoreServices = SyncStoreLive.pipe(Layer.provideMerge(DatabaseLive));
    const SyncHandlers = SyncApiHandlers.pipe(Layer.provideMerge(SyncStoreServices));
    const ProtectedAuthRoutes = ServerAuthRoutes.pipe(Layer.provideMerge(AuthServices));
    const AppLayer = Layer.mergeAll(SystemApiHandlers, SyncHandlers, ProtectedAuthRoutes).pipe(
      Layer.provideMerge(AuthServices),
    );

    const ApiRoutes = HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
      Layer.provide(AppLayer),
    );

    return HttpRouter.serve(ApiRoutes).pipe(
      Layer.provide(NodeHttpServer.layer(createServer, { port })),
    );
  }),
).pipe(Layer.provide(ServerConfigLive));

Layer.launch(Main).pipe(NodeRuntime.runMain);
