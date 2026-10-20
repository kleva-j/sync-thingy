import type { PGlite, PGliteInterfaceExtensions } from "@electric-sql/pglite";
import type { PgliteDatabase } from "drizzle-orm/pglite";

import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { electricSync } from "@electric-sql/pglite-sync";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@sync-disc/db/local-schema";

import { localDatabaseError } from "./errors";
import { runMigrations } from "./migrations";

import PGliteWorkerCtor from "./pglite.worker?worker";

const DATA_DIR = "idb://sync-disc";

export type LocalSchema = typeof schema;

export type LocalPg = PGliteWorker &
  PGliteInterfaceExtensions<{ electric: ReturnType<typeof electricSync> }>;

export type LocalDrizzle = PgliteDatabase<LocalSchema>;

export class LocalDatabase extends Context.Service<
  LocalDatabase,
  {
    readonly pg: LocalPg;
    readonly db: LocalDrizzle;
  }
>()("@sync-disc/web/LocalDatabase") {}

const openLocalDatabase = Effect.gen(function* () {
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
    catch: (cause) => localDatabaseError("open local database", cause),
  });

  yield* Effect.tryPromise({
    try: () => pg.waitReady,
    catch: (cause) => localDatabaseError("wait for local database", cause),
  });

  yield* runMigrations(pg);

  const db = drizzle(pg as unknown as PGlite, { schema });

  return { pg, db };
});

export const LocalDatabaseLive = Layer.effect(LocalDatabase, openLocalDatabase);

export const localDatabaseRuntime = ManagedRuntime.make(LocalDatabaseLive);

export const runLocalDatabase = <A, E>(effect: Effect.Effect<A, E, LocalDatabase>): Promise<A> =>
  localDatabaseRuntime.runPromise(effect);
