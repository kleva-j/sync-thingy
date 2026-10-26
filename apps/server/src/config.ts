import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

export type NodeEnv = "development" | "production" | "test";

const DEVELOPMENT_AUTH_SECRET = "sync-disc-development-only-secret-change-me";

const parseHttpUrl = (value: string): URL | undefined => {
  try {
    const url = new URL(value);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === ""
    ) {
      return url;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const isHttpsOrigin = (value: string): boolean => {
  const url = parseHttpUrl(value);
  return url?.protocol === "https:" && url.origin === value && !value.includes("*");
};

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: Redacted.Redacted<string>;
  readonly from: string;
}

export class ServerConfig extends Context.Service<
  ServerConfig,
  {
    readonly port: number;
    readonly databaseUrl: string;
    readonly nodeEnv: NodeEnv;
    readonly authSecret: Redacted.Redacted<string>;
    readonly authUrl: string;
    readonly trustedOrigins: ReadonlyArray<string>;
    readonly smtp: Option.Option<SmtpConfig>;
  }
>()("server/ServerConfig") {}

export const ServerConfigLive = Layer.effect(
  ServerConfig,
  Effect.gen(function* () {
    const port = yield* Config.Int("PORT").pipe(Config.withDefault(3000));
    const databaseUrl = yield* Config.String("DATABASE_URL").pipe(
      Config.withDefault("******localhost:54321/electric"),
    );
    const nodeEnv = yield* Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
      Config.withDefault("development"),
    );
    const configuredSecret = yield* Config.Redacted("BETTER_AUTH_SECRET").pipe(Config.option);
    const authSecret = Option.getOrElse(configuredSecret, () =>
      Redacted.make(DEVELOPMENT_AUTH_SECRET),
    );
    const authUrl = yield* Config.String("BETTER_AUTH_URL").pipe(
      Config.withDefault("http://localhost:3000"),
    );
    const rawOrigins = yield* Config.String("BETTER_AUTH_TRUSTED_ORIGINS").pipe(
      Config.withDefault(nodeEnv === "production" ? "" : "http://localhost:3001"),
    );
    const trustedOrigins = rawOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    const smtpHost = yield* Config.String("SMTP_HOST").pipe(Config.option);
    const smtpPort = yield* Config.Int("SMTP_PORT").pipe(Config.option);
    const smtpUsername = yield* Config.String("SMTP_USERNAME").pipe(Config.option);
    const smtpPassword = yield* Config.Redacted("SMTP_PASSWORD").pipe(Config.option);
    const smtpFrom = yield* Config.String("SMTP_FROM").pipe(Config.option);

    if (Redacted.value(authSecret).length < 32) {
      return yield* Effect.die("BETTER_AUTH_SECRET must contain at least 32 characters");
    }
    const parsedAuthUrl = parseHttpUrl(authUrl);
    if (parsedAuthUrl === undefined) {
      return yield* Effect.die("BETTER_AUTH_URL must be an absolute HTTP(S) URL");
    }

    if (nodeEnv === "production") {
      if (
        Option.isNone(configuredSecret) ||
        Redacted.value(authSecret) === DEVELOPMENT_AUTH_SECRET
      ) {
        return yield* Effect.die("BETTER_AUTH_SECRET must be set in production");
      }
      if (parsedAuthUrl.protocol !== "https:") {
        return yield* Effect.die("BETTER_AUTH_URL must use HTTPS in production");
      }
      if (trustedOrigins.length === 0 || trustedOrigins.some((origin) => !isHttpsOrigin(origin))) {
        return yield* Effect.die(
          "BETTER_AUTH_TRUSTED_ORIGINS must contain explicit HTTPS origins in production",
        );
      }
      if (Option.isNone(smtpHost) || Option.isNone(smtpFrom)) {
        return yield* Effect.die("SMTP_HOST and SMTP_FROM must be set in production");
      }
    }

    const hasSmtpSettings =
      Option.isSome(smtpHost) ||
      Option.isSome(smtpPort) ||
      Option.isSome(smtpUsername) ||
      Option.isSome(smtpPassword) ||
      Option.isSome(smtpFrom);
    const smtp = Option.match(smtpHost, {
      onNone: () => Option.none(),
      onSome: (host) => {
        if (
          Option.isNone(smtpFrom) ||
          host.trim() === "" ||
          smtpFrom.value.trim() === "" ||
          (Option.isSome(smtpPort) && (smtpPort.value < 1 || smtpPort.value > 65535)) ||
          Option.isSome(smtpUsername) !== Option.isSome(smtpPassword)
        ) {
          return Option.none();
        }
        if (Option.isSome(smtpUsername) && smtpUsername.value.trim() === "") {
          return Option.none();
        }
        if (Option.isSome(smtpPassword) && Redacted.value(smtpPassword.value) === "") {
          return Option.none();
        }

        return Option.some({
          host: host.trim(),
          port: Option.getOrElse(smtpPort, () => 587),
          from: smtpFrom.value.trim(),
          ...(Option.isSome(smtpUsername) ? { username: smtpUsername.value.trim() } : {}),
          ...(Option.isSome(smtpPassword) ? { password: smtpPassword.value } : {}),
        });
      },
    });

    if (hasSmtpSettings && Option.isNone(smtp)) {
      return yield* Effect.die("SMTP settings must include host, from, and paired credentials");
    }

    return ServerConfig.of({
      port,
      databaseUrl,
      nodeEnv,
      authSecret,
      authUrl,
      trustedOrigins,
      smtp,
    });
  }),
);
