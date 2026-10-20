import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/client-schema.ts",
  out: "./drizzle/client",
  strict: true,
  verbose: true,
});
