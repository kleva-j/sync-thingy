import { ClientId, ConflictError, SnapshotId, WorkspaceId, newUuid7 } from "core";
import { expect, test } from "vite-plus/test";
import { DateTime, Schema } from "effect";

import { ChangeId, SyncChangesRequest, SyncChangesResponse } from "../src/index.ts";

const clientId = Schema.decodeSync(ClientId)(newUuid7());
const workspaceId = Schema.decodeSync(WorkspaceId)(newUuid7());
const snapshotId = Schema.decodeSync(SnapshotId)(newUuid7());
const changeId = Schema.decodeSync(ChangeId)(newUuid7());

const upsert = {
  changeId,
  clientId,
  entity: "workspace",
  entityId: workspaceId,
  operation: "upsert",
  baseVersion: null,
  payload: {
    workspace: {
      workspaceId,
      snapshotId,
      ownerClientId: clientId,
      lastModifiedByClientId: clientId,
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      unexpected: true,
    },
  },
} as const;

test("decodes an upsert and ignores extra workspace fields", () => {
  const request = Schema.decodeSync(SyncChangesRequest)({
    changes: [upsert],
  });

  const change = request.changes[0];

  expect(change?.operation).toBe("upsert");
  if (change?.operation === "upsert") {
    expect("unexpected" in change.payload.workspace).toBe(false);
  }
});

test("rejects a delete without a base version", () => {
  expect(() =>
    Schema.decodeUnknownSync(SyncChangesRequest)({
      changes: [
        {
          ...upsert,
          operation: "delete",
          baseVersion: null,
          payload: { workspaceId },
        },
      ],
    }),
  ).toThrow();
});

test("encodes a conflict result with shared conflict fields", () => {
  const encoded = Schema.encodeSync(SyncChangesResponse)({
    results: [
      {
        status: "conflict",
        changeId,
        error: new ConflictError({
          workspaceId,
          expectedVersion: 0,
          actualVersion: 1,
        }),
      },
    ],
  });

  expect(encoded.results[0]).toMatchObject({
    status: "conflict",
    error: { _tag: "ConflictError", actualVersion: 1 },
  });
});

test("encodes a duplicate result with its stored outcome", () => {
  const encoded = Schema.encodeSync(SyncChangesResponse)({
    results: [
      {
        status: "duplicate",
        changeId,
        workspaceId,
        version: 1,
        updatedAt: DateTime.fromDateUnsafe(new Date("2026-01-01T00:00:00.000Z")),
      },
    ],
  });

  expect(encoded.results[0]).toMatchObject({
    status: "duplicate",
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
});
