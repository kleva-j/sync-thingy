import { Effect } from "effect";
import { expect, test } from "vite-plus/test";

import { makeSyncClientLayer, SyncClient } from "./client.ts";

test("constructs the typed sync client without a server", async () => {
  const client = await Effect.runPromise(
    SyncClient.pipe(
      Effect.provide(
        makeSyncClientLayer({
          baseUrl: "http://localhost:3000",
          token: "test-token",
        }),
      ),
    ),
  );

  expect(typeof client.health).toBe("function");
  expect(typeof client.sync.syncChanges).toBe("function");
});
