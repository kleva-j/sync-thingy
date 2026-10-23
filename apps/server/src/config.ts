import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

export type NodeEnv = "development" | "production" | "test";

export class ServerConfig extends Context.Service<
  ServerConfig,
  {
    readonly port: number;
    readonly databaseUrl: string;
    readonly syncDevToken: Option.Option<Redacted.Redacted<string>>;
    readonly nodeEnv: NodeEnv;
  }
>()("server/ServerConfig") {}

export const ServerConfigLive = Layer.effect(
  ServerConfig,
  Effect.gen(function* () {
    const port = yield* Config.Int("PORT").pipe(Config.withDefault(3000));
    const databaseUrl = yield* Config.String("DATABASE_URL").pipe(
      Config.withDefault("postgres://postgres:password@localhost:54321/electric"),
    );
    const nodeEnv = yield* Config.Literals(["development", "production", "test"], "NODE_ENV").pipe(
      Config.withDefault("development"),
    );
    const rawToken = yield* Config.Redacted("SYNC_DEV_TOKEN").pipe(Config.option);
    const syncDevToken = Option.filter(rawToken, (token) => Redacted.value(token) !== "");

    if (nodeEnv === "production" && Option.isSome(syncDevToken)) {
      return yield* Effect.die("SYNC_DEV_TOKEN must not be set in production");
    }

    return ServerConfig.of({
      port,
      databaseUrl,
      syncDevToken,
      nodeEnv,
    });
  }),
);
