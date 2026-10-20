import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const migrationsDir = new URL("../drizzle/spike/", import.meta.url);
const outputFile = new URL("../src/spike-migrations.generated.ts", import.meta.url);

const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

const migrations = [];

for (const file of files) {
  const sql = await readFile(new URL(file, migrationsDir), "utf8");
  const id = file.split("_")[0];
  if (!id) {
    throw new Error(`Migration file is missing a numeric prefix: ${file}`);
  }
  migrations.push({
    id,
    name: file,
    hash: createHash("sha256").update(sql).digest("hex"),
    sql,
  });
}

const output = `export const spikeMigrations = ${JSON.stringify(migrations, null, 2)} as const;\n`;
await writeFile(outputFile, output);

console.log(`Wrote ${migrations.length} migration(s) to ${fileURLToPath(outputFile)}`);
