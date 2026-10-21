import { Schema } from "effect";
import { newUuid7 } from "core";
import { expect, test } from "vite-plus/test";

import { Client, ClientId, Workspace, WorkspaceId } from "../src/index.ts";

test("re-exports shared domain models and UUIDv7 IDs", () => {
  const id = newUuid7();

  expect(typeof Client).toBe("function");
  expect(typeof Workspace).toBe("function");
  expect(Schema.decodeSync(ClientId)(id)).toBe(id);
  expect(Schema.decodeSync(WorkspaceId)(id)).toBe(id);
});
