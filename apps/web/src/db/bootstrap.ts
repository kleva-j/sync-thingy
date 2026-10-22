import { Effect, Layer, ManagedRuntime } from "effect";

import { CurrentClient, CurrentClientLive } from "@/db/current-client";
import { ClientDatabase, ClientDatabaseLive } from "@/db/client";
import { Workspaces, WorkspacesLive } from "@/db/workspaces";
import { runMigrations } from "@/db/migrations";

export const bootstrapClientDatabase = Effect.gen(function* () {
  const { pg } = yield* ClientDatabase;
  yield* runMigrations(pg);
});

export const ClientDatabaseBootLive = Layer.effectDiscard(bootstrapClientDatabase).pipe(
  Layer.provideMerge(ClientDatabaseLive),
);

const currentClientApp = CurrentClientLive.pipe(Layer.provideMerge(ClientDatabaseBootLive));

export const ClientAppLive = WorkspacesLive.pipe(Layer.provideMerge(currentClientApp));

export const clientAppRuntime = ManagedRuntime.make(ClientAppLive);

export const bootClientApp = Effect.gen(function* () {
  return (yield* CurrentClient).id;
});

export const runClientApp = <A, E>(
  effect: Effect.Effect<A, E, ClientDatabase | CurrentClient | Workspaces>,
): Promise<A> => clientAppRuntime.runPromise(effect);

export const disposeClientApp = (): Promise<void> => clientAppRuntime.dispose();
