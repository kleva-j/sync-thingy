import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export * from "./schema.ts";

export const processedChanges = pgTable("processed_changes", {
  changeId: uuid("change_id").primaryKey(),
  clientId: uuid("client_id").notNull(),
  entityId: uuid("entity_id").notNull(),
  operation: text("operation").$type<"upsert" | "delete">().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  fingerprint: text("fingerprint").notNull(),
});
