import { newUuid7 } from "core";
import { expect, test } from "vite-plus/test";

import * as schema from "../src/server-schema.ts";
import { createServerTestDatabase } from "../src/testing/postgres.ts";

test("loads migrated server templates without sharing rows", async () => {
  const first = await createServerTestDatabase();
  const second = await createServerTestDatabase();

  try {
    await first.db.insert(schema.clients).values({ id: newUuid7() });

    expect(await first.db.select().from(schema.clients)).toHaveLength(1);
    expect(await second.db.select().from(schema.clients)).toHaveLength(0);
  } finally {
    await first.client.close();
    await second.client.close();
  }
});

test("server templates include the fingerprint columns", async () => {
  const { client } = await createServerTestDatabase();

  try {
    const result = await client.query<{
      column_name: string;
      is_nullable: string;
    }>(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'processed_changes'
        AND column_name IN ('entity_id', 'fingerprint', 'operation')
      ORDER BY column_name
    `);

    expect(result.rows).toEqual([
      { column_name: "entity_id", is_nullable: "NO" },
      { column_name: "fingerprint", is_nullable: "NO" },
      { column_name: "operation", is_nullable: "NO" },
    ]);
  } finally {
    await client.close();
  }
});
