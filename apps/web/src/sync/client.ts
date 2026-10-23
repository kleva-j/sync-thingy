/** @effect-diagnostics unstableApiUsage:off */
import { Context, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";

import { Api, makeDevAuthClient } from "sync-engine";

export interface SyncClientConfig {
  readonly baseUrl: string;
  readonly token: string;
}

export class SyncClient extends Context.Service<SyncClient, HttpApiClient.ForApi<typeof Api>>()(
  "sync-disc/SyncClient",
) {}

export const makeSyncClientLayer = (config: SyncClientConfig): Layer.Layer<SyncClient> =>
  Layer.effect(
    SyncClient,
    HttpApiClient.make(Api, {
      baseUrl: config.baseUrl,
    }),
  ).pipe(Layer.provide(makeDevAuthClient(config.token)), Layer.provide(FetchHttpClient.layer));
