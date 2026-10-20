import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "vite-plus/test";

import { localMigrations } from "../src/migrations.generated.ts";

test("applies every local migration to a fresh PGlite database", async () => {
  const pg = new PGlite();

  try {
    for (const migration of localMigrations) {
      await pg.exec(migration.sql);
    }

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
