import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

export * from "./schema.ts";

export const processedChanges = pgTable("processed_changes", {
  changeId: uuid("change_id").primaryKey(),
  clientId: uuid("client_id").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
