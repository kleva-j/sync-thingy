export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly hash: string;
  readonly sql: string;
}

export interface MigrationTransaction {
  query<Row extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Row[] }>;
  exec(sql: string): Promise<unknown>;
}

export interface MigrationExecutor {
  transaction<A>(run: (tx: MigrationTransaction) => Promise<A>): Promise<A>;
}

const MIGRATION_LOCK_ID = 728_401;

export async function applyClientMigrations(
  executor: MigrationExecutor,
  migrations: readonly Migration[],
): Promise<void> {
  await executor.transaction(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock($1)`, [MIGRATION_LOCK_ID]);

    const ledger = await tx.query<{ name: string | null }>(
      `SELECT to_regclass('public.local_migrations') AS name`,
    );

    const appliedById = new Map<number, { id: number; name: string; hash: string }>();
    if (ledger.rows[0]?.name != null) {
      const applied = await tx.query<{ id: number; name: string; hash: string }>(
        `SELECT id, name, hash FROM local_migrations`,
      );
      for (const row of applied.rows) {
        appliedById.set(row.id, row);
      }
    }

    const shippedIds = new Set(migrations.map((migration) => migration.id));

    for (const applied of appliedById.values()) {
      if (!shippedIds.has(applied.id)) {
        throw new Error(`Migration ${applied.name} (${applied.id}) is applied but not shipped`);
      }
    }

    for (const migration of migrations) {
      const applied = appliedById.get(migration.id);

      if (applied && applied.name !== migration.name) {
        throw new Error(
          `Migration name mismatch for ${migration.name}: applied ${applied.name}, shipped ${migration.name}`,
        );
      }

      if (applied && applied.hash !== migration.hash) {
        throw new Error(
          `Migration hash mismatch for ${migration.name}: applied ${applied.hash}, shipped ${migration.hash}`,
        );
      }
    }

    for (const migration of migrations) {
      if (appliedById.has(migration.id)) {
        continue;
      }

      await tx.exec(migration.sql);
      await tx.query(`INSERT INTO local_migrations (id, name, hash) VALUES ($1, $2, $3)`, [
        migration.id,
        migration.name,
        migration.hash,
      ]);
    }
  });
}
