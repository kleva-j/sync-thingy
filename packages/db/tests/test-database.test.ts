import { expect, test } from "vite-plus/test";
import { newUuid7 } from "core";

import { createTestDatabase, resetTestDatabase } from "../src/testing/pglite.ts";

import * as schema from "../src/client-schema.ts";

test("loads a migrated template and resets data", async () => {
  const { pg, db } = await createTestDatabase("migrated");

  try {
    await db.insert(schema.clients).values({ id: newUuid7() });
    expect(await db.select().from(schema.clients)).toHaveLength(1);

    await resetTestDatabase(pg);
    expect(await db.select().from(schema.clients)).toEqual([]);
  } finally {
    await pg.close();
  }
});

test("loads the initial template without later migrations", async () => {
  const { pg } = await createTestDatabase("initial");

  try {
    const result = await pg.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'outbox'
        AND column_name = 'status'
    `);

    expect(result.rows).toEqual([]);
  } finally {
    await pg.close();
  }
});

test("loads two databases from one template without sharing rows", async () => {
  const first = await createTestDatabase("migrated");
  const second = await createTestDatabase("migrated");

  try {
    await first.db.insert(schema.clients).values({ id: newUuid7() });
    expect(await first.db.select().from(schema.clients)).toHaveLength(1);
    expect(await second.db.select().from(schema.clients)).toEqual([]);
  } finally {
    await first.pg.close();
    await second.pg.close();
  }
});
