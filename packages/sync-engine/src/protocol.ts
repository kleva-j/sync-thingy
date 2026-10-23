import { ClientId, ConflictError, SnapshotId, WorkspaceId } from "core";
import { Schema } from "effect";

export const ChangeId = Schema.String.check(Schema.isUUID(7)).pipe(Schema.brand("ChangeId"));
export type ChangeId = typeof ChangeId.Type;

export const WorkspaceUpsertChange = Schema.Struct({
  changeId: ChangeId,
  clientId: ClientId,
  entity: Schema.Literal("workspace"),
  entityId: WorkspaceId,
  operation: Schema.Literal("upsert"),
  baseVersion: Schema.NullOr(Schema.Int),
  payload: Schema.Struct({
    workspace: Schema.Struct({
      workspaceId: WorkspaceId,
      snapshotId: SnapshotId,
      ownerClientId: ClientId,
      lastModifiedByClientId: ClientId,
    }),
  }),
});
export type WorkspaceUpsertChange = typeof WorkspaceUpsertChange.Type;

export const WorkspaceDeleteChange = Schema.Struct({
  changeId: ChangeId,
  clientId: ClientId,
  entity: Schema.Literal("workspace"),
  entityId: WorkspaceId,
  operation: Schema.Literal("delete"),
  baseVersion: Schema.Int,
  payload: Schema.Struct({
    workspaceId: WorkspaceId,
    deletedAt: Schema.optional(Schema.String),
  }),
});
export type WorkspaceDeleteChange = typeof WorkspaceDeleteChange.Type;

export const SyncChange = Schema.Union([WorkspaceUpsertChange, WorkspaceDeleteChange]);
export type SyncChange = typeof SyncChange.Type;

export const SyncChangeApplied = Schema.Struct({
  status: Schema.Literal("applied"),
  changeId: ChangeId,
  workspaceId: WorkspaceId,
  version: Schema.Int,
  updatedAt: Schema.DateTimeUtcFromString,
});
export type SyncChangeApplied = typeof SyncChangeApplied.Type;

export const SyncChangeDuplicate = Schema.Struct({
  status: Schema.Literal("duplicate"),
  changeId: ChangeId,
  workspaceId: WorkspaceId,
  version: Schema.Int,
  updatedAt: Schema.DateTimeUtcFromString,
});
export type SyncChangeDuplicate = typeof SyncChangeDuplicate.Type;

export const SyncChangeConflict = Schema.Struct({
  status: Schema.Literal("conflict"),
  changeId: ChangeId,
  error: ConflictError,
});
export type SyncChangeConflict = typeof SyncChangeConflict.Type;

export const SyncChangeRejected = Schema.Struct({
  status: Schema.Literal("rejected"),
  changeId: ChangeId,
  workspaceId: WorkspaceId,
  reason: Schema.Literals([
    "ownership",
    "not_found",
    "already_exists",
    "already_deleted",
    "invalid_payload",
  ]),
  message: Schema.String,
});
export type SyncChangeRejected = typeof SyncChangeRejected.Type;

export const SyncChangeResult = Schema.Union([
  SyncChangeApplied,
  SyncChangeDuplicate,
  SyncChangeConflict,
  SyncChangeRejected,
]);
export type SyncChangeResult = typeof SyncChangeResult.Type;

export const SyncChangesRequest = Schema.Struct({
  changes: Schema.Array(SyncChange),
});
export type SyncChangesRequest = typeof SyncChangesRequest.Type;

export const SyncChangesResponse = Schema.Struct({
  results: Schema.Array(SyncChangeResult),
});
export type SyncChangesResponse = typeof SyncChangesResponse.Type;
