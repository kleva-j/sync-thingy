import { Effect, Layer, ManagedRuntime } from "effect";

import { CurrentClient, CurrentClientLive } from "@/db/current-client";
import { ClientDatabase, ClientDatabaseLive } from "@/db/client";
import { runMigrations } from "@/db/migrations";

export const bootstrapClientDatabase = Effect.gen(function* () {
  const { pg } = yield* ClientDatabase;
  yield* runMigrations(pg);
});

export const ClientDatabaseBootLive = Layer.effectDiscard(bootstrapClientDatabase).pipe(
  Layer.provideMerge(ClientDatabaseLive),
);

export const ClientAppLive = CurrentClientLive.pipe(Layer.provideMerge(ClientDatabaseBootLive));

export const clientAppRuntime = ManagedRuntime.make(ClientAppLive);

export const bootClientApp = Effect.gen(function* () {
  return (yield* CurrentClient).id;
});

export const runClientApp = <A, E>(
  effect: Effect.Effect<A, E, ClientDatabase | CurrentClient>,
): Promise<A> => clientAppRuntime.runPromise(effect);
