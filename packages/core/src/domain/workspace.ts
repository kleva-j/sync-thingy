/** @effect-diagnostics unstableApiUsage:off */

import { Schema } from "effect";
import { Model } from "effect/schema";

import { ClientId, SnapshotId, WorkspaceId } from "./ids.ts";

export class Workspace extends Model.Class<Workspace>("Workspace")({
  snapshotId: Model.GeneratedByApp(SnapshotId),
  workspaceId: Model.GeneratedByApp(WorkspaceId),
  ownerClientId: Model.Field(ClientId),
  lastModifiedByClientId: Model.Field(ClientId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}

export class WorkspaceNotFound extends Schema.TaggedError<
  WorkspaceNotFound,
  { readonly brand: unique symbol }
>()("WorkspaceNotFound", { id: WorkspaceId }, { httpApiStatus: 404 }) {}

export class ConflictError extends Schema.TaggedError<
  ConflictError,
  { readonly brand: unique symbol }
>()(
  "ConflictError",
  {
    workspaceId: WorkspaceId,
    expectedVersion: Schema.Int,
    actualVersion: Schema.Int,
  },
  { httpApiStatus: 409 },
) {}
