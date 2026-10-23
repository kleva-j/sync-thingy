import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "@sync-disc/db/server-schema";
import { serverMigrationsPath } from "@sync-disc/db/postgres";

export async function makeTestDatabase() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: serverMigrationsPath });

  return { client, db };
}
