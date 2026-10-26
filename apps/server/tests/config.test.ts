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

const productionEnv = {
  NODE_ENV: "production",
  BETTER_AUTH_SECRET: "correct-horse-battery-staple-is-long",
  BETTER_AUTH_URL: "https://sync.example.com",
  BETTER_AUTH_TRUSTED_ORIGINS: "https://sync.example.com",
  SMTP_HOST: "smtp.example.com",
  SMTP_FROM: "noreply@example.com",
};

test("uses local development defaults", async () => {
  const exit = await readConfig({ NODE_ENV: "development" });

  expect(Exit.isSuccess(exit)).toBe(true);
  if (Exit.isSuccess(exit)) {
    expect(exit.value.port).toBe(3000);
    expect(exit.value.databaseUrl).toBe("******localhost:54321/electric");
    expect(Redacted.value(exit.value.authSecret)).toHaveLength(43);
    expect(exit.value.authUrl).toBe("http://localhost:3000");
    expect(exit.value.trustedOrigins).toEqual(["http://localhost:3001"]);
    expect(Option.isNone(exit.value.smtp)).toBe(true);
  }
});

test("rejects a weak auth secret", async () => {
  const exit = await readConfig({
    NODE_ENV: "development",
    BETTER_AUTH_SECRET: "too-short",
  });

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Result.getOrNull(Cause.findDefect(exit.cause))).toBe(
      "BETTER_AUTH_SECRET must contain at least 32 characters",
    );
  }
});

test("requires explicit secure auth settings and mail delivery in production", async () => {
  const exit = await readConfig({ NODE_ENV: "production" });

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Result.getOrNull(Cause.findDefect(exit.cause))).toBe(
      "BETTER_AUTH_SECRET must be set in production",
    );
  }
});

test("rejects wildcard production origins", async () => {
  const exit = await readConfig({
    ...productionEnv,
    BETTER_AUTH_TRUSTED_ORIGINS: "https://*.example.com",
  });

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Result.getOrNull(Cause.findDefect(exit.cause))).toBe(
      "BETTER_AUTH_TRUSTED_ORIGINS must contain explicit HTTPS origins in production",
    );
  }
});

test("rejects production origins that are not bare HTTPS origins", async () => {
  const exit = await readConfig({
    ...productionEnv,
    BETTER_AUTH_TRUSTED_ORIGINS: "https://sync.example.com/path",
  });

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Result.getOrNull(Cause.findDefect(exit.cause))).toBe(
      "BETTER_AUTH_TRUSTED_ORIGINS must contain explicit HTTPS origins in production",
    );
  }
});

test("rejects non-HTTP auth URLs", async () => {
  const exit = await readConfig({
    ...productionEnv,
    BETTER_AUTH_URL: "javascript:alert(1)",
  });

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Result.getOrNull(Cause.findDefect(exit.cause))).toBe(
      "BETTER_AUTH_URL must be an absolute HTTP(S) URL",
    );
  }
});

test("accepts explicit production auth and SMTP configuration", async () => {
  const exit = await readConfig(productionEnv);

  expect(Exit.isSuccess(exit)).toBe(true);
  if (Exit.isSuccess(exit)) {
    expect(exit.value.trustedOrigins).toEqual(["https://sync.example.com"]);
    expect(Option.isSome(exit.value.smtp)).toBe(true);
  }
});

test("rejects incomplete SMTP credentials", async () => {
  const exit = await readConfig({
    NODE_ENV: "development",
    SMTP_HOST: "smtp.example.com",
    SMTP_USERNAME: "mailer",
  });

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Result.getOrNull(Cause.findDefect(exit.cause))).toBe(
      "SMTP settings must include host, from, and paired credentials",
    );
  }
});

test("rejects an invalid SMTP port", async () => {
  const exit = await readConfig({
    NODE_ENV: "development",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "70000",
    SMTP_FROM: "noreply@example.com",
  });

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Result.getOrNull(Cause.findDefect(exit.cause))).toBe(
      "SMTP settings must include host, from, and paired credentials",
    );
  }
});
