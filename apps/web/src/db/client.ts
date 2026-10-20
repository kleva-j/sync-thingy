import type { PGlite, PGliteInterfaceExtensions } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";

import { PGliteWorker } from "@electric-sql/pglite/worker";
import { electricSync } from "@electric-sql/pglite-sync";
import * as schema from "@sync-disc/db/client-schema";
import { drizzle } from "drizzle-orm/pglite";
import { Context, Effect, Layer, ManagedRuntime } from "effect";

import { clientDatabaseError } from "./errors";

import PGliteWorkerCtor from "./pglite.worker?worker";

const DATA_DIR = "idb://sync-disc";

export type ClientSchema = typeof schema;

export type ClientPg = PGliteWorker &
  PGliteInterfaceExtensions<{ electric: ReturnType<typeof electricSync> }>;

export type ClientDrizzle = PgliteDatabase<ClientSchema>;

export class ClientDatabase extends Context.Service<
  ClientDatabase,
  {
    readonly pg: ClientPg;
    readonly db: ClientDrizzle;
  }
>()("@sync-disc/web/ClientDatabase") {}

const openClientDatabase = Effect.gen(function* () {
  const worker = yield* Effect.acquireRelease(
    Effect.sync(() => new PGliteWorkerCtor({ name: "pglite" })),
    (worker) => Effect.sync(() => worker.terminate()),
  );

  const pg = yield* Effect.tryPromise({
    try: () =>
      PGliteWorker.create(worker, {
        dataDir: DATA_DIR,
        extensions: {
          electric: electricSync(),
        },
      }),
    catch: (cause) => clientDatabaseError("open client database", cause),
  });

  yield* Effect.tryPromise({
    try: () => pg.waitReady,
    catch: (cause) => clientDatabaseError("wait for client database", cause),
  });

  const db = drizzle(pg as unknown as PGlite, { schema });

  return { pg, db };
});

export const ClientDatabaseLive = Layer.effect(ClientDatabase, openClientDatabase);

export const clientDatabaseRuntime = ManagedRuntime.make(ClientDatabaseLive);

export const runClientDatabase = <A, E>(effect: Effect.Effect<A, E, ClientDatabase>): Promise<A> =>
  clientDatabaseRuntime.runPromise(effect);
