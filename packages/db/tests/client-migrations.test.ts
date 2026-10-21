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

test("blocks when an applied migration hash changes", async () => {
  const pg = new PGlite();

  try {
    await applyClientMigrations(pg, clientMigrations);
    await pg.query(`UPDATE local_migrations SET hash = 'tampered' WHERE id = 0`);

    await expect(applyClientMigrations(pg, clientMigrations)).rejects.toThrow(
      /migration hash mismatch.*0000_chunky_gressill/i,
    );
  } finally {
    await pg.close();
  }
});

test("blocks when an applied migration name changes", async () => {
  const pg = new PGlite();

  try {
    await applyClientMigrations(pg, clientMigrations);
    await pg.query(`UPDATE local_migrations SET name = 'renamed' WHERE id = 0`);

    await expect(applyClientMigrations(pg, clientMigrations)).rejects.toThrow(
      /migration name mismatch.*0000_chunky_gressill/i,
    );
  } finally {
    await pg.close();
  }
});
