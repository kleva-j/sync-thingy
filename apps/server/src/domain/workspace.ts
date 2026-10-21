/** @effect-diagnostics unstableApiUsage:off */

import { Context } from "effect";
import { Workspace } from "core";

export { SnapshotId, Workspace, WorkspaceId, WorkspaceNotFound } from "core";

export class CurrentWorkspace extends Context.Service<CurrentWorkspace, Workspace>()(
  "Domain/Workspace/CurrentWorkspace",
) {}
