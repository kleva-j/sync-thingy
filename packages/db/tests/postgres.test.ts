import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, test } from "vite-plus/test";

import { makePostgresDatabase, serverMigrationsPath } from "../src/postgres.ts";

test("creates a node-postgres database and pool without connecting", async () => {
  const connectionString = "postgres://postgres:password@localhost:54321/sync_disc_test";
  const { db, pool } = makePostgresDatabase(connectionString);

  try {
    expect(db).toBeDefined();
    expect(pool.options.connectionString).toBe(connectionString);
  } finally {
    await pool.end();
  }
});

test("exposes the server migrations folder", () => {
  expect(basename(serverMigrationsPath)).toBe("server");
  expect(existsSync(join(serverMigrationsPath, "meta/_journal.json"))).toBe(true);
});
