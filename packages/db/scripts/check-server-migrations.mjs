import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:password@localhost:54321/electric";

const result = spawnSync(
  "pnpm",
  ["exec", "drizzle-kit", "migrate", "--config=drizzle.server.config.ts"],
  {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const { rows } = await client.query(`
    SELECT relname, relreplident::text AS replica_identity
    FROM pg_class
    WHERE relname IN ('clients', 'workspaces')
    ORDER BY relname
  `);

  const identities = Object.fromEntries(rows.map((row) => [row.relname, row.replica_identity]));

  if (identities.clients !== "f" || identities.workspaces !== "f") {
    throw new Error(
      `Expected REPLICA IDENTITY FULL for synced tables, got ${JSON.stringify(identities)}`,
    );
  }

  console.log("Server migrations applied and synced tables use REPLICA IDENTITY FULL.");
} finally {
  await client.end();
}
