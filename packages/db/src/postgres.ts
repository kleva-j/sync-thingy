import { fileURLToPath } from "node:url";

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./server-schema.ts";

export type ServerSchema = typeof schema;
export type ServerDatabase<TResult extends PgQueryResultHKT = PgQueryResultHKT> = PgDatabase<
  TResult,
  ServerSchema
>;
export type ServerNodeDatabase = NodePgDatabase<ServerSchema>;

export interface PostgresDatabase {
  readonly db: ServerNodeDatabase;
  readonly pool: Pool;
}

export const serverMigrationsPath = fileURLToPath(new URL("../drizzle/server", import.meta.url));

export function makePostgresDatabase(connectionString: string): PostgresDatabase {
  const pool = new Pool({ connectionString });
  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error", error);
  });
  const db = drizzle(pool, { schema });

  return { db, pool };
}
