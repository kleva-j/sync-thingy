import type { QueryClient, UseQueryResult } from "@tanstack/react-query";
import type { WorkspaceRow } from "@sync-disc/db/client-db";
import type { WorkspacesShape } from "@/db/workspaces";
import type { RepositoryError } from "@/db/errors";
import type { WorkspaceId } from "core";

import { Effect } from "effect";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";

export const workspaceKeys = {
  all: ["workspaces"] as const,
  list: () => [...workspaceKeys.all, "list"] as const,
};

export const invalidateWorkspaces = (client: QueryClient): Promise<void> =>
  client.invalidateQueries({ queryKey: workspaceKeys.all });

const runWorkspaceEffect = async <A, E>(
  run: (workspaces: WorkspacesShape) => Effect.Effect<A, E>,
): Promise<A> => {
  const [{ runClientApp }, { Workspaces }] = await Promise.all([
    import("@/db/bootstrap"),
    import("@/db/workspaces"),
  ]);

  return runClientApp(Effect.flatMap(Workspaces, run));
};

export function useWorkspaces(): UseQueryResult<WorkspaceRow[], RepositoryError> {
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: () => runWorkspaceEffect((workspaces) => workspaces.list()),
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => runWorkspaceEffect((workspaces) => workspaces.create()),
    onSuccess: () => invalidateWorkspaces(queryClient),
  });
}

export function useRotateWorkspaceSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: WorkspaceId) =>
      runWorkspaceEffect((workspaces) => workspaces.rotateSnapshot(id)),
    onSuccess: () => invalidateWorkspaces(queryClient),
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: WorkspaceId) => runWorkspaceEffect((workspaces) => workspaces.remove(id)),
    onSuccess: () => invalidateWorkspaces(queryClient),
  });
}
