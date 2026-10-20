import type { PGliteInterface } from "@electric-sql/pglite";

import { spikeMigrations } from "@sync-disc/db/migrations";
import { Effect } from "effect";

import { type LocalDatabaseError, localDatabaseError } from "./errors";

const MIGRATION_LOCK_ID = 728_401;

const attempt = <A>(
  operation: string,
  evaluate: () => Promise<A>,
): Effect.Effect<A, LocalDatabaseError> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => localDatabaseError(operation, cause),
  });

export const runMigrations = (pg: PGliteInterface): Effect.Effect<void, LocalDatabaseError> =>
  Effect.gen(function* () {
    yield* attempt("create local_migrations", () =>
      pg.exec(`
        CREATE TABLE IF NOT EXISTS local_migrations (
          id text PRIMARY KEY NOT NULL,
          name text NOT NULL,
          hash text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
      `),
    );

    yield* attempt("apply local migrations", () =>
      pg.transaction(async (tx) => {
        await tx.query(`SELECT pg_advisory_xact_lock($1)`, [MIGRATION_LOCK_ID]);

        for (const migration of spikeMigrations) {
          const applied = await tx.query<{ id: string }>(
            `SELECT id FROM local_migrations WHERE id = $1`,
            [migration.id],
          );
          if (applied.rows.length > 0) {
            continue;
          }

          await tx.exec(migration.sql);
          await tx.query(`INSERT INTO local_migrations (id, name, hash) VALUES ($1, $2, $3)`, [
            migration.id,
            migration.name,
            migration.hash,
          ]);
        }
      }),
    );
  });
