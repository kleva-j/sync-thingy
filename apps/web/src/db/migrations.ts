import type { PGliteInterface } from "@electric-sql/pglite";
import type { LocalDatabaseError } from '@/db/errors'

import { localMigrations } from "@sync-disc/db/migrations";
import { localDatabaseError } from "@/db/errors";
import { Effect } from "effect";

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
  attempt("apply local migrations", () =>
    pg.transaction(async (tx) => {
      await tx.query(`SELECT pg_advisory_xact_lock($1)`, [MIGRATION_LOCK_ID]);

      const ledger = await tx.query<{ name: string | null }>(
        `SELECT to_regclass('public.local_migrations') AS name`,
      );

      let appliedIds = new Set<number>();
      if (ledger.rows[0]?.name != null) {
        const applied = await tx.query<{ id: number }>(`SELECT id FROM local_migrations`);
        appliedIds = new Set(applied.rows.map((row) => row.id));
      }

      for (const migration of localMigrations) {
        if (appliedIds.has(migration.id)) {
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
