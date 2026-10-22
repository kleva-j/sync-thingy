import { expect, test } from "vite-plus/test";
import { PGlite } from "@electric-sql/pglite";
import { newUuid7 } from "core";

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
test("blocks when an applied migration is no longer shipped", async () => {
  const pg = new PGlite();

  try {
    await applyClientMigrations(pg, clientMigrations);

    await expect(
      applyClientMigrations(
        pg,
        clientMigrations.filter((migration) => migration.id !== 0),
      ),
    ).rejects.toThrow(/is applied but not shipped/i);
  } finally {
    await pg.close();
  }
});

test("adds and backfills outbox status on an existing database", async () => {
  const pg = new PGlite();

  try {
    const [initial] = clientMigrations;
    if (!initial) throw new Error("Expected an initial client migration");

    await applyClientMigrations(pg, [initial]);

    const syncedOutboxId = newUuid7();
    const pendingOutboxId = newUuid7();
    const clientId = newUuid7();

    await pg.query(
      `INSERT INTO outbox (id, client_id, entity, entity_id, operation, payload, synced_at)
       VALUES ($1, $2, 'workspace', $3, 'upsert', '{}'::jsonb, now()),
              ($4, $2, 'workspace', $5, 'upsert', '{}'::jsonb, NULL)`,
      [syncedOutboxId, clientId, newUuid7(), pendingOutboxId, newUuid7()],
    );

    await applyClientMigrations(pg, clientMigrations);

    const result = await pg.query<{
      column_name: string;
      column_default: string | null;
      is_nullable: string;
    }>(`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'outbox'
        AND column_name = 'status'
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.is_nullable).toBe("NO");
    expect(result.rows[0]?.column_default).toContain("pending");

    const statuses = await pg.query<{ id: string; status: string }>(
      `SELECT id::text AS id, status
       FROM outbox
       WHERE id IN ($1, $2)`,
      [syncedOutboxId, pendingOutboxId],
    );

    expect(Object.fromEntries(statuses.rows.map((row) => [row.id, row.status]))).toEqual({
      [syncedOutboxId]: "synced",
      [pendingOutboxId]: "pending",
    });
  } finally {
    await pg.close();
  }
});
