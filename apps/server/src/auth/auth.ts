import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { Context, Effect, Layer, Redacted } from "effect";

import * as authSchema from "@sync-disc/db/server-schema";

import { ServerConfig } from "../config.ts";
import { Database } from "../db/database.ts";
import { makeEmailSender } from "./email.ts";

export const makeAuth = (
  db: Parameters<typeof drizzleAdapter>[0],
  config: {
    readonly secret: string;
    readonly baseURL: string;
    readonly trustedOrigins: ReadonlyArray<string>;
    readonly production: boolean;
  },
  sendEmail: ReturnType<typeof makeEmailSender>,
) =>
  betterAuth({
    appName: "Sync Disc",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authSchema.user,
        session: authSchema.session,
        account: authSchema.account,
        verification: authSchema.verification,
      },
    }),
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: [...config.trustedOrigins],
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: config.production,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail.send({
          to: user.email,
          subject: "Reset your Sync Disc password",
          text: `Reset your password using this link: ${url}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail.send({
          to: user.email,
          subject: "Verify your Sync Disc email",
          text: `Verify your email using this link: ${url}`,
        });
      },
    },
  });

export type AuthInstance = ReturnType<typeof makeAuth>;

export class ServerAuth extends Context.Service<
  ServerAuth,
  { readonly auth: AuthInstance }
>()("server/ServerAuth") {}

export const ServerAuthLive = Layer.effect(
  ServerAuth,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const config = yield* ServerConfig;

    const auth = makeAuth(
      db,
      {
        secret: Redacted.value(config.authSecret),
        baseURL: config.authUrl,
        trustedOrigins: config.trustedOrigins,
        production: config.nodeEnv === "production",
      },
      makeEmailSender(config.smtp),
    );

    return ServerAuth.of({ auth });
  }),
);

export const ServerAuthForTest = (auth: AuthInstance) =>
  Layer.succeed(ServerAuth, ServerAuth.of({ auth }));
