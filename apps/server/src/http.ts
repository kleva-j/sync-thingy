/** @effect-diagnostics unstableApiUsage:off */
import { HttpApiBuilder } from "effect/http-api";
import { Effect } from "effect";

import { Api, AuthenticatedUser } from "sync-engine";

import { SyncStore } from "./sync/store.ts";

export const SystemApiHandlers = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers.handleAll({
    health: () => Effect.void,
  }),
);

export const SyncApiHandlers = HttpApiBuilder.group(
  Api,
  "sync",
  Effect.fn(function* (handlers) {
    const store = yield* SyncStore;

    return handlers.handleAll({
      syncChanges: ({ payload }) =>
        Effect.gen(function* () {
          const { userId } = yield* AuthenticatedUser;
          const results = yield* store.apply(userId, payload.changes);
          return { results };
        }),
    });
  }),
);
