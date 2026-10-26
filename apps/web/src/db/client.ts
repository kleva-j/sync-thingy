import type { PGlite, PGliteInterfaceExtensions } from "@electric-sql/pglite";
import type { ClientDrizzle } from "@sync-disc/db/client-db";
import type { UserId } from "core";

import { PGliteWorker } from "@electric-sql/pglite/worker";
import { electricSync } from "@electric-sql/pglite-sync";
import { clientDatabaseError } from "@/db/errors";
import { Context, Effect, Layer } from "effect";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@sync-disc/db/client-schema";

import PGliteWorkerCtor from "./pglite.worker?worker";

export type ClientPg = PGliteWorker &
  PGliteInterfaceExtensions<{ electric: ReturnType<typeof electricSync> }>;

export class ClientDatabase extends Context.Service<
  ClientDatabase,
  {
    readonly pg: ClientPg;
    readonly db: ClientDrizzle;
  }
>()("@sync-disc/web/ClientDatabase") {}

const openClientDatabase = (userId: UserId) =>
  Effect.gen(function* () {
    const worker = yield* Effect.acquireRelease(
      Effect.sync(() => new PGliteWorkerCtor({ name: `pglite-${userId}` })),
      (worker) => Effect.sync(() => worker.terminate()),
    );

    const pg = yield* Effect.tryPromise({
      try: () =>
        PGliteWorker.create(worker, {
          dataDir: `idb://sync-disc-${userId}`,
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

export const ClientDatabaseLive = (userId: UserId) =>
  Layer.effect(ClientDatabase, openClientDatabase(userId));
