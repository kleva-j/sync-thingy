import type { PgliteDatabase } from "drizzle-orm/pglite";

import type { outbox, workspaces, clients } from "./client-schema.ts";

export type ClientSchema = typeof import("./client-schema.ts");
export type ClientDrizzle = PgliteDatabase<ClientSchema>;
export type ClientTransaction = Parameters<Parameters<ClientDrizzle["transaction"]>[0]>[0];
export type ClientExecutor = ClientDrizzle | ClientTransaction;

export type ClientRow = typeof clients.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
