/** @effect-diagnostics unstableApiUsage:off */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { HttpApiBuilder } from "effect/http-api";
import { createServer } from "node:http";
import { HttpRouter } from "effect/http";
import { Effect, Layer } from "effect";

import { Api } from "sync-engine";

import { SyncApiHandlers, SystemApiHandlers } from "./http.ts";
import { ServerConfig, ServerConfigLive } from "./config.ts";
import { DevAuthLayer } from "./auth/dev-token.ts";
import { SyncStoreLive } from "./sync/store.ts";
import { DatabaseLive } from "./db/database.ts";

const Main = Layer.unwrap(
  Effect.gen(function* () {
    const { syncDevToken, port } = yield* ServerConfig;

    const SyncHandlers = SyncApiHandlers.pipe(Layer.provide(DevAuthLayer(syncDevToken)));

    const AppLayer = Layer.mergeAll(SystemApiHandlers, SyncHandlers).pipe(
      Layer.provide(SyncStoreLive),
      Layer.provide(DatabaseLive),
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
