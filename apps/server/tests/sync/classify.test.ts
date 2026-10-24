import { expect, test } from "vite-plus/test";

import { workspaces } from "../../src/db/schema.ts";
import { classifyExistingWorkspace } from "../../src/sync/apply.ts";
import { clientA, clientB, makeUpsertChange, snapshotA, workspaceId } from "../support/changes.ts";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const LATER = new Date("2026-01-01T00:01:00.000Z");

const row = (
  overrides: Partial<typeof workspaces.$inferSelect> = {},
): typeof workspaces.$inferSelect => ({
  workspaceId,
  snapshotId: snapshotA,
  ownerClientId: clientA,
  lastModifiedByClientId: clientA,
  ownerUserId: null,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  ...overrides,
});

test("classifies a missing workspace as not_found", () => {
  expect(classifyExistingWorkspace(makeUpsertChange(), undefined)).toMatchObject({
    status: "rejected",
    reason: "not_found",
  });
});

test("classifies a deleted foreign workspace as already_deleted", () => {
  const change = makeUpsertChange({ clientId: clientB });
  const existing = row({ deletedAt: LATER, ownerClientId: clientB });

  expect(classifyExistingWorkspace(change, existing)).toMatchObject({
    status: "rejected",
    reason: "already_deleted",
  });
});

test("classifies an active foreign workspace as ownership", () => {
  expect(classifyExistingWorkspace(makeUpsertChange({ clientId: clientB }), row())).toMatchObject({
    status: "rejected",
    reason: "ownership",
  });
});

test("classifies an active owned workspace as conflict", () => {
  const result = classifyExistingWorkspace(makeUpsertChange({ baseVersion: 0 }), row());

  expect(result).toMatchObject({ status: "conflict" });
  if (result.status === "conflict") {
    expect(result.error.actualVersion).toBe(1);
  }
});
