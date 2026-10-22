import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export * from "./schema.ts";

export const outboxStatuses = ["pending", "synced", "failed", "discarded"] as const;
export type OutboxStatus = (typeof outboxStatuses)[number];

export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey(),
    clientId: uuid("client_id").notNull(),
    userId: uuid("user_id"),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    operation: text("operation").$type<"upsert" | "delete">().notNull(),
    status: text("status").$type<OutboxStatus>().notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    baseVersion: integer("base_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    conflict: jsonb("conflict").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("outbox_user_id_synced_at_created_at_idx").on(
      table.userId,
      table.syncedAt,
      table.createdAt,
    ),
    index("outbox_synced_at_created_at_idx").on(table.syncedAt, table.createdAt),
    index("outbox_status_created_at_idx").on(table.status, table.createdAt),
  ],
);

export const localSettings = pgTable("local_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const localMigrations = pgTable("local_migrations", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  hash: text("hash").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});
