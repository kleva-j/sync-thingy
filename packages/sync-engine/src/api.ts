/** @effect-diagnostics unstableApiUsage:off */
import type { UserId } from "core";

import { HttpClientRequest } from "effect/http";
import { Context, Schema } from "effect";
import {
  HttpApiMiddleware,
  HttpApiEndpoint,
  HttpApiSecurity,
  HttpApiSchema,
  HttpApiGroup,
  HttpApi,
  OpenApi,
} from "effect/http-api";

import { SyncChangesRequest, SyncChangesResponse } from "./protocol.ts";

export class Unauthorized extends Schema.TaggedError<
  Unauthorized,
  { readonly brand: unique symbol }
>()("Unauthorized", { message: Schema.String }, { httpApiStatus: 401 }) {}

export class AuthenticatedUser extends Context.Service<
  AuthenticatedUser,
  { readonly userId: UserId }
>()("sync-disc/AuthenticatedUser") {}

export class SessionAuth extends HttpApiMiddleware.Service<
  SessionAuth,
  { readonly provides: AuthenticatedUser }
>()("sync-disc/SessionAuth", {
  security: {
    session: HttpApiSecurity.apiKey({
      key: "better-auth.session_token",
      in: "cookie",
    }),
  },
  error: Unauthorized,
  requiredForClient: false,
}) {}

export const makeSessionAuthClient = (cookie: string) =>
  HttpApiMiddleware.layerClient(SessionAuth, ({ next, request }) =>
    next(HttpClientRequest.setHeader(request, "cookie", cookie)),
  );

export class SystemApi extends HttpApiGroup.make("system", {
  topLevel: true,
}).add(
  HttpApiEndpoint.get("health", "/health", {
    success: HttpApiSchema.NoContent,
  }),
) {}

export class SyncApi extends HttpApiGroup.make("sync")
  .add(
    HttpApiEndpoint.post("syncChanges", "/sync/changes", {
      payload: SyncChangesRequest,
      success: SyncChangesResponse,
    }),
  )
  .middleware(SessionAuth) {}

export class Api extends HttpApi.make("sync-disc-api")
  .add(SystemApi)
  .add(SyncApi)
  .annotateMerge(OpenApi.annotations({ title: "Sync Disc API" })) {}
