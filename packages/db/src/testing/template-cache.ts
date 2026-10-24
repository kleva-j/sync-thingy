import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

const TEMPLATE_FORMAT_VERSION = 2;

const findRepoRoot = (): string => {
  let current = process.cwd();

  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("Could not find repository root");
    current = parent;
  }
};

const cacheDir = resolve(findRepoRoot(), "node_modules/.cache/sync-disc/pglite");

const pathFor = (cacheKey: string): string =>
  resolve(cacheDir, `${TEMPLATE_FORMAT_VERSION}-${cacheKey}.tar`);

const templates = new Map<string, Promise<Blob>>();

export const hashTemplateParts = (parts: ReadonlyArray<string>): string =>
  createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);

export const getCachedTemplate = (cacheKey: string, build: () => Promise<Blob>): Promise<Blob> => {
  const cached = templates.get(cacheKey);
  if (cached) return cached;

  const pending = (async (): Promise<Blob> => {
    const path = pathFor(cacheKey);

    try {
      await access(path);
      const bytes = await readFile(path);
      return new Blob([new Uint8Array(bytes)]);
    } catch {
      const template = await build();
      await mkdir(dirname(path), { recursive: true });

      const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, new Uint8Array(await template.arrayBuffer()));
      await rename(temp, path);

      return template;
    }
  })();

  templates.set(cacheKey, pending);

  return pending;
};
