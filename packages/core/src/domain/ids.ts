import { Schema } from "effect";
import { uuidv7 } from "uuidv7";

const Uuid7 = Schema.String.check(Schema.isUUID(7));

export const ClientId = Uuid7.pipe(Schema.brand("ClientId"));
export type ClientId = typeof ClientId.Type;

export const WorkspaceId = Uuid7.pipe(Schema.brand("WorkspaceId"));
export type WorkspaceId = typeof WorkspaceId.Type;

export const SnapshotId = Uuid7.pipe(Schema.brand("SnapshotId"));
export type SnapshotId = typeof SnapshotId.Type;

export function newUuid7(): string {
  return uuidv7();
}
