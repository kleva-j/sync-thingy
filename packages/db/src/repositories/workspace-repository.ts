import type { ClientId, SnapshotId, WorkspaceId } from "core";

import type { ClientExecutor, WorkspaceRow } from "../client-db.ts";

import { and, asc, eq, isNull } from "drizzle-orm";

import { workspaces } from "../client-schema.ts";

export interface NewWorkspace {
  readonly workspaceId: WorkspaceId;
  readonly snapshotId: SnapshotId;
  readonly ownerClientId: ClientId;
  readonly lastModifiedByClientId: ClientId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UpdateWorkspaceSnapshot {
  readonly snapshotId: SnapshotId;
  readonly lastModifiedByClientId: ClientId;
  readonly updatedAt: Date;
}

export interface SoftDeleteWorkspace {
  readonly lastModifiedByClientId: ClientId;
  readonly updatedAt: Date;
  readonly deletedAt: Date;
}

export interface WorkspaceRepository {
  listActive(ownerClientId: ClientId): Promise<WorkspaceRow[]>;
  findActiveById(id: WorkspaceId): Promise<WorkspaceRow | undefined>;
  insert(input: NewWorkspace): Promise<WorkspaceRow>;
  updateSnapshot(
    id: WorkspaceId,
    input: UpdateWorkspaceSnapshot,
  ): Promise<WorkspaceRow | undefined>;
  softDelete(id: WorkspaceId, input: SoftDeleteWorkspace): Promise<WorkspaceRow | undefined>;
}

const activeWorkspace = (id: WorkspaceId) =>
  and(eq(workspaces.workspaceId, id), isNull(workspaces.deletedAt));

export function createWorkspaceRepository(executor: ClientExecutor): WorkspaceRepository {
  return {
    listActive: (ownerClientId) =>
      executor
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.ownerClientId, ownerClientId), isNull(workspaces.deletedAt)))
        .orderBy(asc(workspaces.createdAt)),

    findActiveById: async (id) => {
      const [row] = await executor.select().from(workspaces).where(activeWorkspace(id)).limit(1);
      return row;
    },

    insert: async (input) => {
      const [row] = await executor.insert(workspaces).values(input).returning();
      if (!row) {
        throw new Error("Workspace insert returned no row");
      }
      return row;
    },

    updateSnapshot: async (id, input) => {
      const [row] = await executor
        .update(workspaces)
        .set(input)
        .where(activeWorkspace(id))
        .returning();
      return row;
    },

    softDelete: async (id, input) => {
      const [row] = await executor
        .update(workspaces)
        .set(input)
        .where(activeWorkspace(id))
        .returning();
      return row;
    },
  };
}
