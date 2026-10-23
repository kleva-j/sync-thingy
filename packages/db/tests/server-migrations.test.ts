import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, test } from "vite-plus/test";

const readMigration = (name: string) =>
  readFile(new URL(`../drizzle/server/${name}`, import.meta.url), "utf8");

const execMigration = (pg: PGlite, sql: string) =>
  pg.exec(sql.replaceAll("--> statement-breakpoint", ""));

test("clears legacy processed changes before adding fingerprint columns", async () => {
  const pg = new PGlite();

  try {
    await execMigration(pg, await readMigration("0000_bumpy_sunfire.sql"));
    await execMigration(pg, await readMigration("0001_faithful_may_parker.sql"));
    await pg.exec(`
      INSERT INTO processed_changes (change_id, client_id)
      VALUES (
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002'
      )
    `);

    await execMigration(pg, await readMigration("0002_processed_change_fingerprint.sql"));

    const { rows } = await pg.query("SELECT * FROM processed_changes");
    expect(rows).toHaveLength(0);
  } finally {
    await pg.close();
  }
});
