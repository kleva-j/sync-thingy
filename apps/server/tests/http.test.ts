import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import { DateTime, Layer } from "effect";

import { makeDeleteChange, makeUpsertChange, workspaceId } from "./support/changes.ts";
import { makeSyncStore, SyncStore } from "../src/sync/store.ts";
import { makeTestDatabase } from "./support/database.ts";
import { NOW, makeSessionClient, runWithClient } from "./support/http.ts";

let testDb: Awaited<ReturnType<typeof makeTestDatabase>>;

beforeEach(async () => {
  testDb = await makeTestDatabase();
});

afterEach(async () => {
  await testDb.client.close();
});

const testStore = () =>
  Layer.succeed(
    SyncStore,
    makeSyncStore(testDb.db, () => NOW),
  );

test("applies a workspace upsert through the API", async () => {
  const change = makeUpsertChange();
  const response = await runWithClient(testStore(), makeSessionClient(), (client) =>
    client.sync.syncChanges({ payload: { changes: [change] } }),
  );

  expect(response.results[0]).toMatchObject({
    status: "applied",
    workspaceId,
    version: 1,
  });
});

test("returns duplicate on a repeated change", async () => {
  const change = makeUpsertChange();
  const response = await runWithClient(testStore(), makeSessionClient(), (client) =>
    client.sync.syncChanges({ payload: { changes: [change] } }),
  );
  expect(response.results[0]?.status).toBe("applied");

  const retry = await runWithClient(testStore(), makeSessionClient(), (client) =>
    client.sync.syncChanges({ payload: { changes: [change] } }),
  );
  const duplicate = retry.results[0];
  expect(duplicate).toMatchObject({ status: "duplicate", version: 1 });
  if (duplicate?.status === "duplicate") {
    expect(DateTime.toEpochMillis(duplicate.updatedAt)).toBe(NOW.getTime());
  }
});

test("returns a conflict result for a stale update", async () => {
  await runWithClient(testStore(), makeSessionClient(), (client) =>
    client.sync.syncChanges({ payload: { changes: [makeUpsertChange()] } }),
  );

  const response = await runWithClient(testStore(), makeSessionClient(), (client) =>
    client.sync.syncChanges({
      payload: {
        changes: [makeUpsertChange({ baseVersion: 0 })],
      },
    }),
  );

  const conflict = response.results[0];
  expect(conflict?.status).toBe("conflict");
  if (conflict?.status === "conflict") {
    expect(conflict.error.actualVersion).toBe(1);
  }
});

test("applies a soft delete through the API", async () => {
  await runWithClient(testStore(), makeSessionClient(), (client) =>
    client.sync.syncChanges({ payload: { changes: [makeUpsertChange()] } }),
  );

  const response = await runWithClient(testStore(), makeSessionClient(), (client) =>
    client.sync.syncChanges({
      payload: {
        changes: [makeDeleteChange({ baseVersion: 1 })],
      },
    }),
  );

  expect(response.results[0]).toMatchObject({
    status: "applied",
    version: 2,
  });
});
