import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { Effect } from "effect";

import { ServerAuth } from "./auth.ts";

export const ServerAuthRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const { auth } = yield* ServerAuth;

    yield* router.add("*", "/api/auth/*", (incoming) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.toWeb(incoming);
        const response = yield* Effect.promise(() => auth.handler(request));
        return HttpServerResponse.fromWeb(response);
      }),
    );
  }),
);
