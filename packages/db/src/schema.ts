import { index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const workspaces = pgTable(
  "workspaces",
  {
    workspaceId: uuid("workspace_id").primaryKey(),
    snapshotId: uuid("snapshot_id").notNull(),
    ownerClientId: uuid("owner_client_id")
      .notNull()
      .references(() => clients.id),
    lastModifiedByClientId: uuid("last_modified_by_client_id")
      .notNull()
      .references(() => clients.id),
    ownerUserId: uuid("owner_user_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("workspaces_owner_client_id_idx").on(table.ownerClientId),
    index("workspaces_owner_user_id_idx")
      .on(table.ownerUserId)
      .where(sql`${table.ownerUserId} is not null`),
    index("workspaces_updated_at_idx").on(table.updatedAt),
  ],
);
