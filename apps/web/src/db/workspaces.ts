/** @effect-diagnostics lazyEffect:off */
import type { WorkspaceRow } from "@sync-disc/db/client-db";
import type { RepositoryError } from "@/db/errors";

import { SnapshotId, WorkspaceId, WorkspaceNotFound, newUuid7 } from "core";
import { Context, Effect, Layer, Schema } from "effect";
import {
  rotateWorkspaceSnapshotWithOutbox,
  createWorkspaceRepository,
  createWorkspaceWithOutbox,
  deleteWorkspaceWithOutbox,
} from "@sync-disc/db/repositories";

import { CurrentClient } from "@/db/current-client";
import { repositoryError } from "@/db/errors";
import { ClientDatabase } from "@/db/client";

export interface WorkspacesShape {
  readonly list: () => Effect.Effect<WorkspaceRow[], RepositoryError>;
  readonly create: () => Effect.Effect<WorkspaceRow, RepositoryError>;
  readonly rotateSnapshot: (
    id: WorkspaceId,
  ) => Effect.Effect<WorkspaceRow, WorkspaceNotFound | RepositoryError>;
  readonly remove: (id: WorkspaceId) => Effect.Effect<void, WorkspaceNotFound | RepositoryError>;
}

export class Workspaces extends Context.Service<Workspaces, WorkspacesShape>()(
  "@sync-disc/web/Workspaces",
) { }

const run = <A>(
  operation: string,
  tryPromise: () => Promise<A>,
): Effect.Effect<A, RepositoryError> =>
  Effect.tryPromise({
    try: tryPromise,
    catch: (cause) => repositoryError(operation, cause),
  });

export const WorkspacesLive: Layer.Layer<Workspaces, never, ClientDatabase | CurrentClient> =
  Layer.effect(
    Workspaces,
    Effect.gen(function* () {
      const { db } = yield* ClientDatabase;
      const { id: clientId } = yield* CurrentClient;
      const workspaces = createWorkspaceRepository(db);

      return {
        list: () => run("list workspaces", () => workspaces.listActive(clientId)),

        create: () => {
          const workspaceId = Schema.decodeSync(WorkspaceId)(newUuid7());
          const snapshotId = Schema.decodeSync(SnapshotId)(newUuid7());

          return run("create workspace", () =>
            createWorkspaceWithOutbox(db, {
              clientId,
              workspaceId,
              snapshotId,
              outboxId: newUuid7(),
              now: new Date(),
            }),
          );
        },

        rotateSnapshot: (id) =>
          run("rotate workspace snapshot", () =>
            rotateWorkspaceSnapshotWithOutbox(db, {
              clientId,
              workspaceId: id,
              snapshotId: Schema.decodeSync(SnapshotId)(newUuid7()),
              outboxId: newUuid7(),
              now: new Date(),
            }),
          ).pipe(
            Effect.filterOrFail(
              (row): row is WorkspaceRow => row !== undefined,
              () => new WorkspaceNotFound({ id }),
            ),
          ),

        remove: (id) =>
          run("remove workspace", () =>
            deleteWorkspaceWithOutbox(db, {
              clientId,
              workspaceId: id,
              outboxId: newUuid7(),
              now: new Date(),
            }),
          ).pipe(
            Effect.filterOrFail(
              (row): row is WorkspaceRow => row !== undefined,
              () => new WorkspaceNotFound({ id }),
            ),
            Effect.asVoid,
          ),
      };
    }),
  );
