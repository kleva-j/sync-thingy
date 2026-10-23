import { Effect, Layer, Option, Redacted } from "effect";

import { DevAuth, Unauthorized } from "sync-engine";

export const DevAuthLayer = (expected: Option.Option<Redacted.Redacted<string>>) =>
  Layer.effect(
    DevAuth,
    Effect.succeed(
      DevAuth.of({
        bearer: Effect.fn(function* (httpEffect, { credential }) {
          const matches = Option.match(expected, {
            onNone: () => false,
            onSome: (token) => Redacted.value(token) === Redacted.value(credential),
          });

          if (!matches) {
            return yield* new Unauthorized({
              message: "Missing or invalid bearer token",
            });
          }

          return yield* httpEffect;
        }),
      }),
    ),
  );
