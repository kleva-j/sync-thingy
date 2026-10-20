import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server-schema.ts",
  out: "./drizzle/server",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:password@localhost:54321/electric",
  },
  strict: true,
  verbose: true,
});
