import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "vite-plus/test";

import { applyClientMigrations } from "../src/client-migrations.ts";
import { clientMigrations } from "../src/migrations.generated.ts";

test("applies every client migration to a fresh PGlite database", async () => {
  const pg = new PGlite();

  try {
    await applyClientMigrations(pg, clientMigrations);

    const result = await pg.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    expect(result.rows.map((row) => row.table_name)).toEqual([
      "clients",
      "local_migrations",
      "local_settings",
      "outbox",
      "workspaces",
    ]);
  } finally {
    await pg.close();
  }
});

test("does not reapply migrations that are already recorded", async () => {
  const pg = new PGlite();

  try {
    await applyClientMigrations(pg, clientMigrations);
    await applyClientMigrations(pg, clientMigrations);

    const ledger = await pg.query<{ id: number; name: string }>(
      `SELECT id, name FROM local_migrations ORDER BY id`,
    );

    expect(ledger.rows).toEqual(
      clientMigrations.map((migration) => ({ id: migration.id, name: migration.name })),
    );
  } finally {
    await pg.close();
  }
});
