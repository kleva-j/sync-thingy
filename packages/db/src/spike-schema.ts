import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const spikeItems = pgTable("spike_items", {
  id: uuid("id").primaryKey(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
