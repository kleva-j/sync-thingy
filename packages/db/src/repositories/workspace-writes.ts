import type { ClientDrizzle, WorkspaceRow } from "../client-db.ts";
import type { ClientId, SnapshotId, WorkspaceId } from "core";

import { createWorkspaceRepository } from "./workspace-repository";
import { createOutboxRepository } from "./outbox-repository";

export interface CreateWorkspaceCommand {
  readonly clientId: ClientId;
  readonly workspaceId: WorkspaceId;
  readonly snapshotId: SnapshotId;
  readonly outboxId: string;
  readonly now: Date;
}

export interface RotateWorkspaceSnapshotCommand {
  readonly clientId: ClientId;
  readonly workspaceId: WorkspaceId;
  readonly snapshotId: SnapshotId;
  readonly outboxId: string;
  readonly now: Date;
}

export interface DeleteWorkspaceCommand {
  readonly clientId: ClientId;
  readonly workspaceId: WorkspaceId;
  readonly outboxId: string;
  readonly now: Date;
}

export function createWorkspaceWithOutbox(
  db: ClientDrizzle,
  command: CreateWorkspaceCommand,
): Promise<WorkspaceRow> {
  return db.transaction(async (tx) => {
    const workspaces = createWorkspaceRepository(tx);
    const outbox = createOutboxRepository(tx);

    const row = await workspaces.insert({
      workspaceId: command.workspaceId,
      snapshotId: command.snapshotId,
      ownerClientId: command.clientId,
      lastModifiedByClientId: command.clientId,
      createdAt: command.now,
      updatedAt: command.now,
    });

    await outbox.insertPending({
      id: command.outboxId,
      clientId: command.clientId,
      userId: null,
      entity: "workspace",
      entityId: command.workspaceId,
      operation: "upsert",
      payload: { workspace: row },
      baseVersion: null,
      createdAt: command.now,
    });

    return row;
  });
}

export function rotateWorkspaceSnapshotWithOutbox(
  db: ClientDrizzle,
  command: RotateWorkspaceSnapshotCommand,
): Promise<WorkspaceRow | undefined> {
  return db.transaction(async (tx) => {
    const workspaces = createWorkspaceRepository(tx);
    const outbox = createOutboxRepository(tx);
    const existing = await workspaces.findActiveById(command.workspaceId);

    if (!existing) {
      return undefined;
    }

    const row = await workspaces.updateSnapshot(command.workspaceId, {
      snapshotId: command.snapshotId,
      lastModifiedByClientId: command.clientId,
      updatedAt: command.now,
    });

    if (!row) {
      return undefined;
    }

    await outbox.insertPending({
      id: command.outboxId,
      clientId: command.clientId,
      userId: null,
      entity: "workspace",
      entityId: command.workspaceId,
      operation: "upsert",
      payload: { workspace: row },
      baseVersion: existing.version,
      createdAt: command.now,
    });

    return row;
  });
}

export function deleteWorkspaceWithOutbox(
  db: ClientDrizzle,
  command: DeleteWorkspaceCommand,
): Promise<WorkspaceRow | undefined> {
  return db.transaction(async (tx) => {
    const workspaces = createWorkspaceRepository(tx);
    const outbox = createOutboxRepository(tx);
    const existing = await workspaces.findActiveById(command.workspaceId);

    if (!existing) {
      return undefined;
    }

    const row = await workspaces.softDelete(command.workspaceId, {
      lastModifiedByClientId: command.clientId,
      updatedAt: command.now,
      deletedAt: command.now,
    });

    if (!row) {
      return undefined;
    }

    await outbox.insertPending({
      id: command.outboxId,
      clientId: command.clientId,
      userId: null,
      entity: "workspace",
      entityId: command.workspaceId,
      operation: "delete",
      payload: {
        workspaceId: command.workspaceId,
        deletedAt: row.deletedAt?.toISOString(),
      },
      baseVersion: existing.version,
      createdAt: command.now,
    });

    return row;
  });
}
