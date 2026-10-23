import { Cause, ConfigProvider, Effect, Exit, Layer, Option, Redacted, Result } from "effect";
import { expect, test } from "vite-plus/test";

import { ServerConfig, ServerConfigLive } from "../src/config.ts";

const readConfig = (env: Record<string, string>) =>
  Effect.runPromiseExit(
    ServerConfig.pipe(
      Effect.provide(
        ServerConfigLive.pipe(
          Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))),
        ),
      ),
    ),
  );

test("uses local development defaults", async () => {
  const exit = await readConfig({ NODE_ENV: "development" });

  expect(Exit.isSuccess(exit)).toBe(true);
  if (Exit.isSuccess(exit)) {
    expect(exit.value.port).toBe(3000);
    expect(exit.value.databaseUrl).toBe("postgres://postgres:password@localhost:54321/electric");
    expect(Option.isNone(exit.value.syncDevToken)).toBe(true);
  }
});

test("treats an empty dev token as absent", async () => {
  const exit = await readConfig({
    NODE_ENV: "development",
    SYNC_DEV_TOKEN: "",
  });

  expect(Exit.isSuccess(exit)).toBe(true);
  if (Exit.isSuccess(exit)) {
    expect(Option.isNone(exit.value.syncDevToken)).toBe(true);
  }
});

test("refuses a dev token in production", async () => {
  const exit = await readConfig({
    NODE_ENV: "production",
    SYNC_DEV_TOKEN: "secret",
  });

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Result.getOrNull(Cause.findDefect(exit.cause))).toBe(
      "SYNC_DEV_TOKEN must not be set in production",
    );
  }
});

test("allows production without a dev token", async () => {
  const exit = await readConfig({ NODE_ENV: "production" });

  expect(Exit.isSuccess(exit)).toBe(true);
  if (Exit.isSuccess(exit)) {
    expect(Option.isNone(exit.value.syncDevToken)).toBe(true);
  }
});

test("wraps a configured dev token", async () => {
  const exit = await readConfig({
    NODE_ENV: "development",
    SYNC_DEV_TOKEN: "secret",
  });

  expect(Exit.isSuccess(exit)).toBe(true);
  if (Exit.isSuccess(exit)) {
    expect(Option.isSome(exit.value.syncDevToken)).toBe(true);
    if (Option.isSome(exit.value.syncDevToken)) {
      expect(Redacted.value(exit.value.syncDevToken.value)).toBe("secret");
    }
  }
});
