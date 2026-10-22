import type { WorkspaceRow } from "@sync-disc/db/client-db";

import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@sync-disc/ui/components/button";
import { WorkspaceId } from "core";
import { Schema } from "effect";

import {
  useRotateWorkspaceSnapshot,
  useCreateWorkspace,
  useDeleteWorkspace,
  useWorkspaces,
} from "@/query/workspaces";

import Loader from "../components/loader";

export const Route = createFileRoute("/")({
  component: function HomeComponent() {
    return (
      <main className="container mx-auto w-full max-w-4xl px-4 py-8">
        <WorkspacesSection />
      </main>
    );
  },
});

const formatTimestamp = (value: Date): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);

const decodeWorkspaceId = (workspace: WorkspaceRow): WorkspaceId =>
  Schema.decodeSync(WorkspaceId)(workspace.workspaceId);

function WorkspacesSection() {
  const workspaces = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const rotateSnapshot = useRotateWorkspaceSnapshot();
  const deleteWorkspace = useDeleteWorkspace();

  const mutationError = createWorkspace.error ?? rotateSnapshot.error ?? deleteWorkspace.error;
  const mutationPending =
    createWorkspace.isPending || rotateSnapshot.isPending || deleteWorkspace.isPending;

  const clearMutationErrors = () => {
    createWorkspace.reset();
    rotateSnapshot.reset();
    deleteWorkspace.reset();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Workspaces</h1>
          <p className="text-sm text-muted-foreground">
            Stored locally in this browser. Changes sync when the network is available.
          </p>
        </div>
        <Button
          type="button"
          disabled={mutationPending}
          onClick={() => {
            clearMutationErrors();
            createWorkspace.mutate();
          }}
        >
          {createWorkspace.isPending ? "Creating..." : "Create workspace"}
        </Button>
      </div>

      {workspaces.isPending ? (
        <div className="flex items-center gap-3 border border-border p-6">
          <Loader />
          <p className="text-sm text-muted-foreground">Loading workspaces...</p>
        </div>
      ) : workspaces.isError ? (
        <p className="border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load workspaces: {workspaces.error.message}
        </p>
      ) : workspaces.data.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center">
          <p className="font-medium">No workspaces yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a workspace to start tracking local changes.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {workspaces.data.map((workspace) => {
            const workspaceId = decodeWorkspaceId(workspace);
            const rotating = rotateSnapshot.isPending && rotateSnapshot.variables === workspaceId;
            const deleting = deleteWorkspace.isPending && deleteWorkspace.variables === workspaceId;

            return (
              <li key={workspace.workspaceId} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <dl className="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Workspace</dt>
                      <dd className="break-all font-mono">{workspace.workspaceId}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Snapshot</dt>
                      <dd className="break-all font-mono">{workspace.snapshotId}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Version</dt>
                      <dd className="font-mono">{workspace.version}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Updated</dt>
                      <dd>
                        <time dateTime={workspace.updatedAt.toISOString()}>
                          {formatTimestamp(workspace.updatedAt)}
                        </time>
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={mutationPending}
                      onClick={() => {
                        clearMutationErrors();
                        rotateSnapshot.mutate(workspaceId);
                      }}
                    >
                      {rotating ? "Creating snapshot..." : "New snapshot"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={mutationPending}
                      onClick={() => {
                        if (window.confirm("Delete this workspace?")) {
                          clearMutationErrors();
                          deleteWorkspace.mutate(workspaceId);
                        }
                      }}
                    >
                      {deleting ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mutationError ? (
        <p className="border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {mutationError.message}
        </p>
      ) : null}
    </section>
  );
}
