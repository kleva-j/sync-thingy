import type { PGliteInterface } from "@electric-sql/pglite";

import { applyClientMigrations } from "@sync-disc/db/client-migrations";
import { clientMigrations } from "@sync-disc/db/migrations";
import { Effect } from "effect";

import { type ClientDatabaseError, clientDatabaseError } from "./errors";

export const runMigrations = (pg: PGliteInterface): Effect.Effect<void, ClientDatabaseError> =>
  Effect.tryPromise({
    try: () => applyClientMigrations(pg, clientMigrations),
    catch: (cause) => clientDatabaseError("apply client migrations", cause),
  });
