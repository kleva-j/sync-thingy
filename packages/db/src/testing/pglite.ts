import type { PgliteDatabase } from "drizzle-orm/pglite";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { getCachedTemplate, hashTemplateParts } from "./template-cache.ts";
import { applyClientMigrations } from "../client-migrations.ts";
import { clientMigrations } from "../migrations.generated.ts";

import * as clientSchema from "../client-schema.ts";

export type TestTemplate = "empty" | "initial" | "migrated";

export interface TestDatabase {
  readonly pg: PGlite;
  readonly db: PgliteDatabase<typeof clientSchema>;
}

const migrationKey = hashTemplateParts(
  clientMigrations.map(({ id, name, hash }) => `${id}:${name}:${hash}`),
);

const templateKey = (template: Exclude<TestTemplate, "empty">): string =>
  `client-${migrationKey}-${template}`;

const buildTemplate = async (template: Exclude<TestTemplate, "empty">): Promise<Blob> => {
  const [initial] = clientMigrations;
  if (!initial) throw new Error("Expected at least one client migration");

  const pg = new PGlite({ relaxedDurability: true });
  await applyClientMigrations(pg, template === "initial" ? [initial] : clientMigrations);
  const dump = await pg.dumpDataDir("none");
  await pg.close();
  return dump;
};

const getTemplate = (template: Exclude<TestTemplate, "empty">): Promise<Blob> =>
  getCachedTemplate(templateKey(template), () => buildTemplate(template));

export const prepareTestTemplates = async (): Promise<void> => {
  await getTemplate("migrated");
  await getTemplate("initial");
};

export const createTestDatabase = async (
  template: TestTemplate = "migrated",
): Promise<TestDatabase> => {
  if (template === "empty") {
    const pg = new PGlite({ relaxedDurability: true });
    await pg.waitReady;
    return { pg, db: drizzle(pg, { schema: clientSchema }) };
  }

  const pg = new PGlite({
    loadDataDir: await getTemplate(template),
    relaxedDurability: true,
  });

  await pg.waitReady;

  return { pg, db: drizzle(pg, { schema: clientSchema }) };
};

export const resetTestDatabase = async (pg: PGlite): Promise<void> => {
  await pg.exec(
    'TRUNCATE TABLE "outbox", "workspaces", "clients", "local_settings" RESTART IDENTITY CASCADE',
  );
};
