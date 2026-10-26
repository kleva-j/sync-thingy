import { AuthenticatedUser, SessionAuth, Unauthorized } from "sync-engine";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpServerRequest } from "effect/http";
import { UserId } from "core";

import { ServerAuth } from "./auth.ts";

export class SessionLookup extends Context.Service<
  SessionLookup,
  {
    readonly getUserId: (headers: Headers) => Promise<string | null>;
  }
>()("server/SessionLookup") {}

export const SessionLookupLive = Layer.effect(
  SessionLookup,
  Effect.gen(function* () {
    const { auth } = yield* ServerAuth;

    return SessionLookup.of({
      getUserId: async (headers) => {
        const session = await auth.api.getSession({ headers });
        return session?.user.id ?? null;
      },
    });
  }),
);

export const SessionAuthLive = Layer.effect(
  SessionAuth,
  Effect.gen(function* () {
    const lookup = yield* SessionLookup;

    return SessionAuth.of({
      session: Effect.fn(function* (httpEffect) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const userId = yield* Effect.promise(() => lookup.getUserId(new Headers(request.headers)));

        if (!userId) {
          return yield* new Unauthorized({ message: "A valid session is required" });
        }

        return yield* Effect.provideService(
          httpEffect,
          AuthenticatedUser,
          AuthenticatedUser.of({ userId: Schema.decodeSync(UserId)(userId) }),
        );
      }),
    });
  }),
);

export const BetterAuthSessionLive = SessionAuthLive.pipe(Layer.provide(SessionLookupLive));
