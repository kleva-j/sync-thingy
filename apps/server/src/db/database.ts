import { Context, Effect, Layer } from "effect";

import { makePostgresDatabase, type ServerNodeDatabase } from "@sync-disc/db/postgres";

import { ServerConfig } from "../config.ts";

export class Database extends Context.Service<Database, { readonly db: ServerNodeDatabase }>()(
  "server/Database",
) {}

export const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const { db } = yield* Effect.acquireRelease(
      Effect.sync(() => makePostgresDatabase(config.databaseUrl)),
      ({ pool }) => Effect.promise(() => pool.end()),
    );

    return Database.of({ db });
  }),
);
