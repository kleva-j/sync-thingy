import type { ClientExecutor, OutboxRow } from "../client-db.ts";
import type { ClientId, WorkspaceId } from "core";

import { outbox } from "../client-schema.ts";

export interface NewOutboxChange {
  readonly id: string;
  readonly clientId: ClientId;
  readonly userId: string | null;
  readonly entity: "workspace";
  readonly entityId: WorkspaceId;
  readonly operation: "upsert" | "delete";
  readonly payload: Record<string, unknown>;
  readonly baseVersion: number | null;
  readonly createdAt: Date;
}

export interface OutboxRepository {
  insertPending(input: NewOutboxChange): Promise<OutboxRow>;
}

export function createOutboxRepository(executor: ClientExecutor): OutboxRepository {
  return {
    insertPending: async (input) => {
      const [row] = await executor
        .insert(outbox)
        .values({ ...input, status: "pending" })
        .returning();

      if (!row) {
        throw new Error("Outbox insert returned no row");
      }

      return row;
    },
  };
}
