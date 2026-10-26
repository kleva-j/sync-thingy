import type { SyncChangeResult, SyncChange } from "sync-engine";
import type { ServerDatabase } from "@sync-disc/db/postgres";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { UserId } from "core";

import { Context, Effect, Layer } from "effect";

import { Database } from "../db/database.ts";
import { applyChanges } from "./apply.ts";

export interface SyncStoreShape {
  readonly apply: (
    userId: UserId,
    changes: ReadonlyArray<SyncChange>,
  ) => Effect.Effect<ReadonlyArray<SyncChangeResult>>;
}

export class SyncStore extends Context.Service<SyncStore, SyncStoreShape>()("server/SyncStore") {}

export function makeSyncStore<TResult extends PgQueryResultHKT>(
  db: ServerDatabase<TResult>,
  now: () => Date = () => new Date(),
): SyncStoreShape {
  return {
    apply: (userId, changes) => Effect.promise(() => applyChanges(db, userId, changes, now())),
  };
}

export const SyncStoreLive = Layer.effect(
  SyncStore,
  Effect.gen(function* () {
    const { db } = yield* Database;
    return makeSyncStore(db);
  }),
);
