import { expect, test } from "vite-plus/test";
import { UserId } from "core";
import { Schema } from "effect";

import { type BootLockManager, startClientApp, withBootLock } from "./boot.ts";

const userId = Schema.decodeSync(UserId)(
  "00000000-0000-4000-8000-000000000001",
);

test("runs boot work under the cross-tab lock", async () => {
  let lockName = "";
  const locks: BootLockManager = {
    request: (name, _options, run) => {
      lockName = name;
      return run();
    },
  };

  await expect(withBootLock(async () => 42, locks)).resolves.toBe(42);
  expect(lockName).toBe("sync-disc-client-boot");
});

test("falls back when Web Locks are unavailable", async () => {
  await expect(withBootLock(async () => 7, null)).resolves.toBe(7);
});

test("returns ready after boot work succeeds", async () => {
  let calls = 0;
  const result = await startClientApp(
    userId,
    async () => {
      calls += 1;
    },
    undefined,
  );

  expect(result).toEqual({ status: "ready" });
  expect(calls).toBe(1);
});

test("returns a useful error when boot work fails", async () => {
  const result = await startClientApp(
    userId,
    async () => {
      throw new Error("migration exploded");
    },
    undefined,
  );

  expect(result).toEqual({ status: "error", message: "migration exploded" });
});

test("times out stuck boot work", async () => {
  const result = await startClientApp(
    userId,
    () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    null,
    10,
  );

  expect(result).toEqual({
    status: "error",
    message: "Client database boot timed out after 10ms",
  });
});

test("keeps the cross-tab lock after boot times out", async () => {
  let released = false;
  let finish!: () => void;
  const locks: BootLockManager = {
    request: async (_name, _options, run) => {
      try {
        return await run();
      } finally {
        released = true;
      }
    },
  };

  const result = await startClientApp(
    userId,
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    locks,
    10,
  );

  expect(result.status).toBe("error");
  expect(released).toBe(false);

  finish();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(released).toBe(true);
});
