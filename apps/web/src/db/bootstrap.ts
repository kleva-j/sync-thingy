import { Effect, Layer, ManagedRuntime } from "effect";
import type { UserId } from "core";

import { CurrentClient, CurrentClientLive } from "@/db/current-client";
import { ClientDatabase, ClientDatabaseLive } from "@/db/client";
import { Workspaces, WorkspacesLive } from "@/db/workspaces";
import { CurrentUserLive } from "@/db/current-user";
import { runMigrations } from "@/db/migrations";

export const bootstrapClientDatabase = Effect.gen(function* () {
  const { pg } = yield* ClientDatabase;
  yield* runMigrations(pg);
});

const ClientDatabaseBootLive = (userId: UserId) =>
  Layer.effectDiscard(bootstrapClientDatabase).pipe(
    Layer.provideMerge(ClientDatabaseLive(userId)),
  );

const ClientAppLive = (userId: UserId) => {
  const currentClientApp = CurrentClientLive.pipe(
    Layer.provideMerge(ClientDatabaseBootLive(userId)),
  );

  return WorkspacesLive.pipe(
    Layer.provideMerge(Layer.merge(currentClientApp, CurrentUserLive(userId))),
  );
};

const makeClientAppRuntime = (userId: UserId) =>
  ManagedRuntime.make(ClientAppLive(userId));
let clientAppRuntime: ReturnType<typeof makeClientAppRuntime> | undefined;
let activeUserId: UserId | undefined;

export const bootClientApp = Effect.gen(function* () {
  return (yield* CurrentClient).id;
});

export const runClientApp = <A, E>(
  effect: Effect.Effect<A, E, ClientDatabase | CurrentClient | Workspaces>,
): Promise<A> => {
  if (!clientAppRuntime) {
    throw new Error("Client app is not initialized for an authenticated user");
  }
  return clientAppRuntime.runPromise(effect);
};

export const initializeClientApp = async (userId: UserId): Promise<void> => {
  if (clientAppRuntime && activeUserId !== userId) {
    await disposeClientApp();
  }

  if (!clientAppRuntime) {
    clientAppRuntime = makeClientAppRuntime(userId);
    activeUserId = userId;
  }

  try {
    await clientAppRuntime.runPromise(bootClientApp);
  } catch (cause) {
    await disposeClientApp();
    throw cause;
  }
};

export const disposeClientApp = async (): Promise<void> => {
  const runtime = clientAppRuntime;
  clientAppRuntime = undefined;
  activeUserId = undefined;
  await runtime?.dispose();
};
