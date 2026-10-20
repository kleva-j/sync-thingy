/** @effect-diagnostics unstableApiUsage:off */

import { Context, Schema } from "effect";
import { Model } from "effect/schema";

import { ClientId } from "./client.ts";

export const WorkspaceId = Schema.Finite.pipe(Schema.brand("WorkspaceId"));
export type WorkspaceId = typeof WorkspaceId.Type;

export const SnapshotId = Schema.String.pipe(Schema.brand("SnapshotId"));
export type SnapshotId = typeof SnapshotId.Type;

export class Workspace extends Model.Class<Workspace>("Workspace")({
  snapshotId: Model.UuidV4Insert(SnapshotId),
  workspaceId: Model.GeneratedByApp(WorkspaceId),
  ownerClientId: Model.Field(ClientId),
  clientId: Model.Field(ClientId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}

export class CurrentWorkspace extends Context.Service<CurrentWorkspace, Workspace>()(
  "Domain/Workspace/CurrentWorkspace",
) {}

export class WorkspaceNotFound extends Schema.TaggedError<
  WorkspaceNotFound,
  { readonly brand: unique symbol }
>()("WorkspaceNotFound", { id: WorkspaceId }, { httpApiStatus: 404 }) {}
