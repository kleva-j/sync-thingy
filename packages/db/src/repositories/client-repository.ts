import type { ClientExecutor, ClientRow } from "../client-db.ts";
import type { ClientId } from "core";

import { eq } from "drizzle-orm";

import { clients } from "../client-schema.ts";

export interface ClientRepository {
  findById(id: ClientId): Promise<ClientRow | undefined>;
  ensure(id: ClientId): Promise<ClientRow>;
}

export function createClientRepository(executor: ClientExecutor): ClientRepository {
  const findById = async (id: ClientId): Promise<ClientRow | undefined> => {
    const [row] = await executor.select().from(clients).where(eq(clients.id, id)).limit(1);
    return row;
  };

  return {
    findById,
    ensure: async (id) => {
      const [inserted] = await executor
        .insert(clients)
        .values({ id })
        .onConflictDoNothing()
        .returning();

      if (inserted) {
        return inserted;
      }

      const existing = await findById(id);
      if (!existing) {
        throw new Error(`Client ${id} was not found after insert`);
      }

      return existing;
    },
  };
}
