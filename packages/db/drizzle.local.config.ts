import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/local-schema.ts",
  out: "./drizzle/local",
  strict: true,
  verbose: true,
});
