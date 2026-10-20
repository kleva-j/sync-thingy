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

    let appliedIds = new Set<number>();
    if (ledger.rows[0]?.name != null) {
      const applied = await tx.query<{ id: number }>(`SELECT id FROM local_migrations`);
      appliedIds = new Set(applied.rows.map((row) => row.id));
    }

    for (const migration of migrations) {
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
  });
}
