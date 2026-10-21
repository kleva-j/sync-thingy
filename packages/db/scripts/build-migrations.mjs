import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [migrationsDirArg, outputFileArg, exportName] = process.argv.slice(2);

if (!migrationsDirArg || !outputFileArg || !exportName) {
  throw new Error("Usage: build-migrations.mjs <migrations-dir> <output-file> <export-name>");
}

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const migrationsDir = resolve(packageRoot, migrationsDirArg);
const outputFile = resolve(packageRoot, outputFileArg);

const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const migrations = [];

for (const file of files) {
  const sql = await readFile(resolve(migrationsDir, file), "utf8");
  const id = Number.parseInt(file.split("_")[0] ?? "", 10);
  if (!Number.isInteger(id)) {
    throw new Error(`Migration file is missing a numeric prefix: ${file}`);
  }
  migrations.push({
    id,
    name: file,
    hash: createHash("sha256").update(sql).digest("hex"),
    sql,
  });
}

const output = `export const ${exportName} = ${JSON.stringify(migrations, null, 2)} as const;\n`;
await writeFile(outputFile, output);

console.log(`Wrote ${migrations.length} migration(s) to ${outputFile}`);
