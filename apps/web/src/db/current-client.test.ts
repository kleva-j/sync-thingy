import { applyClientMigrations } from "@sync-disc/db/client-migrations";
import { clientMigrations } from "@sync-disc/db/migrations";
import { expect, test } from "vite-plus/test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { newUuid7 } from "core";
import { Effect } from "effect";

import * as schema from "@sync-disc/db/client-schema";

import { CURRENT_CLIENT_SETTING_KEY, ensureCurrentClient } from "./current-client.ts";

const createDatabase = async () => {
  const pg = new PGlite();
  await applyClientMigrations(pg, clientMigrations);
  return { pg, db: drizzle(pg, { schema }) };
};

test("creates one current client and reuses it", async () => {
  const { pg, db } = await createDatabase();

  try {
    const first = await Effect.runPromise(ensureCurrentClient(db));
    const second = await Effect.runPromise(ensureCurrentClient(db));

    expect(second).toBe(first);
    expect(await db.select().from(schema.clients)).toHaveLength(1);
    expect(await db.select().from(schema.localSettings)).toEqual([
      { key: CURRENT_CLIENT_SETTING_KEY, value: { clientId: first } },
    ]);
  } finally {
    await pg.close();
  }
});

test("concurrent initialization returns one client ID", async () => {
  const { pg, db } = await createDatabase();

  try {
    const [first, second] = await Promise.all([
      Effect.runPromise(ensureCurrentClient(db)),
      Effect.runPromise(ensureCurrentClient(db)),
    ]);

    expect(second).toBe(first);
    expect(await db.select().from(schema.clients)).toHaveLength(1);
  } finally {
    await pg.close();
  }
});

test("repairs a persisted client ID that has no clients row", async () => {
  const { pg, db } = await createDatabase();
  const clientId = newUuid7();

  try {
    await db.insert(schema.localSettings).values({
      key: CURRENT_CLIENT_SETTING_KEY,
      value: { clientId },
    });

    await expect(Effect.runPromise(ensureCurrentClient(db))).resolves.toBe(clientId);
    expect(await db.select().from(schema.clients)).toEqual([
      expect.objectContaining({ id: clientId }),
    ]);
  } finally {
    await pg.close();
  }
});

test("rejects a corrupt persisted client setting", async () => {
  const { pg, db } = await createDatabase();

  try {
    await db.insert(schema.localSettings).values({
      key: CURRENT_CLIENT_SETTING_KEY,
      value: { clientId: "not-a-uuid" },
    });

    await expect(Effect.runPromise(ensureCurrentClient(db))).rejects.toMatchObject({
      _tag: "ClientDatabaseError",
      operation: "ensure current client",
    });
    expect(await db.select().from(schema.clients)).toHaveLength(0);
  } finally {
    await pg.close();
  }
});
