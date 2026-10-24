import type { PgliteDatabase } from "drizzle-orm/pglite";

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { getCachedTemplate, hashTemplateParts } from "./template-cache.ts";
import { serverMigrationsPath } from "../migrations-path.ts";

import * as serverSchema from "../server-schema.ts";

export interface ServerTestDatabase {
  readonly client: PGlite;
  readonly db: PgliteDatabase<typeof serverSchema>;
}

const buildServerTemplate = async (): Promise<Blob> => {
  const client = new PGlite({ relaxedDurability: true });

  try {
    const db = drizzle(client, { schema: serverSchema });
    await migrate(db, { migrationsFolder: serverMigrationsPath });
    return await client.dumpDataDir("none");
  } finally {
    await client.close();
  }
};

const readServerTemplateKey = async (): Promise<string> => {
  const migrations = (await readdir(serverMigrationsPath))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const parts = await Promise.all(
    migrations.map(
      async (name) => `${name}\n${await readFile(resolve(serverMigrationsPath, name), "utf8")}`,
    ),
  );
  parts.push(
    `meta/_journal.json\n${await readFile(resolve(serverMigrationsPath, "meta/_journal.json"), "utf8")}`,
  );

  return `server-${hashTemplateParts(parts)}`;
};

let serverTemplate: Promise<Blob> | undefined;

const getServerTemplate = (): Promise<Blob> => {
  serverTemplate ??= (async () => {
    const cacheKey = await readServerTemplateKey();
    return getCachedTemplate(cacheKey, buildServerTemplate);
  })();

  return serverTemplate;
};

export const createServerTestDatabase = async (): Promise<ServerTestDatabase> => {
  const client = new PGlite({
    loadDataDir: await getServerTemplate(),
    relaxedDurability: true,
  });
  await client.waitReady;

  return { client, db: drizzle(client, { schema: serverSchema }) };
};
