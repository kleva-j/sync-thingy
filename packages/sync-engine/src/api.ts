/** @effect-diagnostics unstableApiUsage:off */
import { HttpClientRequest } from "effect/http";
import { Schema } from "effect";
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

export class DevAuth extends HttpApiMiddleware.Service<DevAuth>()("sync-disc/DevAuth", {
  security: { bearer: HttpApiSecurity.bearer },
  error: Unauthorized,
  requiredForClient: true,
}) {}

export const makeDevAuthClient = (token: string) =>
  HttpApiMiddleware.layerClient(DevAuth, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
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
  .middleware(DevAuth) {}

export class Api extends HttpApi.make("sync-disc-api")
  .add(SystemApi)
  .add(SyncApi)
  .annotateMerge(OpenApi.annotations({ title: "Sync Disc API" })) {}
