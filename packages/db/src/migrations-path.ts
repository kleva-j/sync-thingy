import { fileURLToPath } from "node:url";

export const serverMigrationsPath = fileURLToPath(new URL("../drizzle/server", import.meta.url));
