import { ClientId, SnapshotId, WorkspaceId, newUuid7 } from "core";
import { Schema } from "effect";
import { ChangeId, type SyncChange } from "sync-engine";

export const clientA = Schema.decodeSync(ClientId)(newUuid7());
export const clientB = Schema.decodeSync(ClientId)(newUuid7());
export const workspaceId = Schema.decodeSync(WorkspaceId)(newUuid7());
export const snapshotA = Schema.decodeSync(SnapshotId)(newUuid7());
export const snapshotB = Schema.decodeSync(SnapshotId)(newUuid7());

export const newChangeId = (): ChangeId => Schema.decodeSync(ChangeId)(newUuid7());

interface UpsertOverrides {
  changeId?: ChangeId;
  clientId?: ClientId;
  entityId?: WorkspaceId;
  baseVersion?: number | null;
  workspaceId?: WorkspaceId;
  snapshotId?: SnapshotId;
  ownerClientId?: ClientId;
  lastModifiedByClientId?: ClientId;
}

export function makeUpsertChange(overrides: UpsertOverrides = {}): SyncChange {
  const entityId = overrides.entityId ?? workspaceId;
  const clientId = overrides.clientId ?? clientA;

  return {
    changeId: overrides.changeId ?? newChangeId(),
    clientId,
    entity: "workspace",
    entityId,
    operation: "upsert",
    baseVersion: overrides.baseVersion ?? null,
    payload: {
      workspace: {
        workspaceId: overrides.workspaceId ?? entityId,
        snapshotId: overrides.snapshotId ?? snapshotA,
        ownerClientId: overrides.ownerClientId ?? clientId,
        lastModifiedByClientId: overrides.lastModifiedByClientId ?? clientId,
      },
    },
  };
}

interface DeleteOverrides {
  changeId?: ChangeId;
  clientId?: ClientId;
  entityId?: WorkspaceId;
  baseVersion?: number;
  workspaceId?: WorkspaceId;
}

export function makeDeleteChange(overrides: DeleteOverrides = {}): SyncChange {
  const entityId = overrides.entityId ?? workspaceId;

  return {
    changeId: overrides.changeId ?? newChangeId(),
    clientId: overrides.clientId ?? clientA,
    entity: "workspace",
    entityId,
    operation: "delete",
    baseVersion: overrides.baseVersion ?? 1,
    payload: { workspaceId: overrides.workspaceId ?? entityId },
  };
}
