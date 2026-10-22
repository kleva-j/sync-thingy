import { afterAll, beforeAll, beforeEach, expect, test } from "vite-plus/test";
import { createTestDatabase, resetTestDatabase } from "@sync-disc/db/testing";
import { newUuid7 } from "core";
import { Effect } from "effect";

import * as schema from "@sync-disc/db/client-schema";

import { SETTING_KEY, ensureCurrentClient } from "./current-client.ts";

let database: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
  database = await createTestDatabase("migrated");
});

beforeEach(async () => {
  await resetTestDatabase(database.pg);
});

afterAll(async () => {
  await database.pg.close();
});

test("creates one current client and reuses it", async () => {
  const { db } = database;

  const first = await Effect.runPromise(ensureCurrentClient(db));
  const second = await Effect.runPromise(ensureCurrentClient(db));

  expect(second).toBe(first);
  expect(await db.select().from(schema.clients)).toHaveLength(1);
  expect(await db.select().from(schema.localSettings)).toEqual([
    { key: SETTING_KEY, value: { clientId: first } },
  ]);
});

test("concurrent initialization returns one client ID", async () => {
  const { db } = database;

  const [first, second] = await Promise.all([
    Effect.runPromise(ensureCurrentClient(db)),
    Effect.runPromise(ensureCurrentClient(db)),
  ]);

  expect(second).toBe(first);
  expect(await db.select().from(schema.clients)).toHaveLength(1);
});

test("repairs a persisted client ID that has no clients row", async () => {
  const { db } = database;
  const clientId = newUuid7();

  await db.insert(schema.localSettings).values({
    key: SETTING_KEY,
    value: { clientId },
  });

  await expect(Effect.runPromise(ensureCurrentClient(db))).resolves.toBe(clientId);
  expect(await db.select().from(schema.clients)).toEqual([
    expect.objectContaining({ id: clientId }),
  ]);
});

test("rejects a corrupt persisted client setting", async () => {
  const { db } = database;

  await db.insert(schema.localSettings).values({
    key: SETTING_KEY,
    value: { clientId: "not-a-uuid" },
  });

  await expect(Effect.runPromise(ensureCurrentClient(db))).rejects.toMatchObject({
    _tag: "ClientDatabaseError",
    operation: "ensure current client",
  });
  expect(await db.select().from(schema.clients)).toHaveLength(0);
});
