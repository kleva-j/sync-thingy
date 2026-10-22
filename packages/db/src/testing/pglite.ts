import type { PgliteDatabase } from "drizzle-orm/pglite";

import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { applyClientMigrations } from "../client-migrations.ts";
import { clientMigrations } from "../migrations.generated.ts";

import * as clientSchema from "../client-schema.ts";

export type TestTemplate = "empty" | "initial" | "migrated";

export interface TestDatabase {
  readonly pg: PGlite;
  readonly db: PgliteDatabase<typeof clientSchema>;
}

const TEMPLATE_FORMAT_VERSION = 1;

const findRepoRoot = (): string => {
  let current = process.cwd();

  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("Could not find repository root");
    current = parent;
  }
};

const repoRoot = findRepoRoot();
const cacheDir = resolve(repoRoot, "node_modules/.cache/sync-disc/pglite");
const migrationKey = createHash("sha256")
  .update(clientMigrations.map(({ id, name, hash }) => `${id}:${name}:${hash}`).join("\n"))
  .digest("hex")
  .slice(0, 16);

const templates = new Map<Exclude<TestTemplate, "empty">, Promise<Blob>>();

const pathFor = (template: Exclude<TestTemplate, "empty">): string =>
  resolve(cacheDir, `${TEMPLATE_FORMAT_VERSION}-${migrationKey}-${template}.tar`);

const buildTemplate = async (template: Exclude<TestTemplate, "empty">): Promise<Blob> => {
  const [initial] = clientMigrations;
  if (!initial) throw new Error("Expected at least one client migration");

  const pg = new PGlite({ relaxedDurability: true });
  await applyClientMigrations(pg, template === "initial" ? [initial] : clientMigrations);
  const dump = await pg.dumpDataDir("none");
  await pg.close();
  return dump;
};

const ensureTemplateFile = async (template: Exclude<TestTemplate, "empty">): Promise<string> => {
  const path = pathFor(template);

  try {
    await access(path);
    return path;
  } catch {
    const dump = await buildTemplate(template);
    await mkdir(dirname(path), { recursive: true });

    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, new Uint8Array(await dump.arrayBuffer()));
    await rename(temp, path);

    return path;
  }
};

export const prepareTestTemplates = async (): Promise<void> => {
  await ensureTemplateFile("migrated");
  await ensureTemplateFile("initial");
};

const getTemplate = async (template: Exclude<TestTemplate, "empty">): Promise<Blob> => {
  const cached = templates.get(template);
  if (cached) return cached;

  const path = await ensureTemplateFile(template);
  const bytes = await readFile(path);
  const pending = Promise.resolve(new Blob([new Uint8Array(bytes)]));
  templates.set(template, pending);

  return pending;
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
