import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vite-plus/test";

import { invalidateWorkspaces, workspaceKeys } from "./workspaces.ts";

test("invalidates every workspace query", async () => {
  const queryClient = new QueryClient();
  const key = workspaceKeys.list();

  queryClient.setQueryData(key, []);
  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);

  await invalidateWorkspaces(queryClient);

  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
});
