import { Schema } from "effect";
import { expect, test } from "vite-plus/test";

import {
  ClientId,
  ClientNotFound,
  SnapshotId,
  WorkspaceId,
  WorkspaceNotFound,
  newUuid7,
} from "../src/index.ts";

const uuidV4 = "550e8400-e29b-41d4-a716-446655440000";

test("generates UUIDv7 strings accepted by domain ID schemas", () => {
  const id = newUuid7();

  expect(Schema.decodeSync(ClientId)(id)).toBe(id);
  expect(Schema.decodeSync(WorkspaceId)(id)).toBe(id);
  expect(Schema.decodeSync(SnapshotId)(id)).toBe(id);
});

test("rejects non-UUIDv7 IDs", () => {
  expect(() => Schema.decodeSync(ClientId)(uuidV4)).toThrow();
  expect(() => Schema.decodeSync(WorkspaceId)(uuidV4)).toThrow();
  expect(() => Schema.decodeSync(SnapshotId)(uuidV4)).toThrow();
});

test("domain errors expose a 404 HTTP status", () => {
  expect(ClientNotFound.ast.annotations?.httpApiStatus).toBe(404);
  expect(WorkspaceNotFound.ast.annotations?.httpApiStatus).toBe(404);
});
