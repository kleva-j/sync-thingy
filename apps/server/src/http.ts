/** @effect-diagnostics unstableApiUsage:off */
import { HttpApiBuilder } from "effect/http-api";
import { Effect } from "effect";

import { Api } from "sync-engine";

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
        store.apply(payload.changes).pipe(Effect.map((results) => ({ results }))),
    });
  }),
);
