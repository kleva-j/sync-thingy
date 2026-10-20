import { newUuid7, spikeItems } from "@sync-disc/db";
import { desc, sql } from "drizzle-orm";
import { Effect } from "effect";

import { LocalDatabase, type SpikeItem } from "./client";
import { type LocalDatabaseError, localDatabaseError } from "./errors";

const SHAPE_URL = "/electric/v1/shape";

const attempt = <A>(
  operation: string,
  evaluate: () => PromiseLike<A>,
): Effect.Effect<A, LocalDatabaseError> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => localDatabaseError(operation, cause),
  });

export const listRecentItems: Effect.Effect<SpikeItem[], LocalDatabaseError, LocalDatabase> =
  Effect.gen(function* () {
    const { db } = yield* LocalDatabase;

    return yield* attempt("load spike items", () =>
      db.select().from(spikeItems).orderBy(desc(spikeItems.createdAt)).limit(20),
    );
  });

export const countItems: Effect.Effect<number, LocalDatabaseError, LocalDatabase> = Effect.gen(
  function* () {
    const { db } = yield* LocalDatabase;
    const totals = yield* attempt("count spike items", () =>
      db.select({ count: sql<number>`count(*)::int` }).from(spikeItems),
    );

    return totals[0]?.count ?? 0;
  },
);

export const insertItem = (label: string): Effect.Effect<void, LocalDatabaseError, LocalDatabase> =>
  Effect.gen(function* () {
    const { db } = yield* LocalDatabase;

    yield* attempt("insert spike item", () =>
      db.insert(spikeItems).values({
        id: newUuid7(),
        label,
      }),
    );
  });

export const seedItems = (count: number): Effect.Effect<void, LocalDatabaseError, LocalDatabase> =>
  Effect.gen(function* () {
    const { pg } = yield* LocalDatabase;

    yield* attempt("seed spike items", () =>
      pg.query(
        `
          INSERT INTO spike_items (id, label)
          SELECT gen_random_uuid(), 'seed-' || value
          FROM generate_series(1, $1::int) AS value
          ON CONFLICT DO NOTHING
        `,
        [count],
      ),
    );
  });

export interface SpikeShapeSyncHandle {
  readonly unsubscribe: () => void;
}

export interface SpikeShapeSyncHandlers {
  readonly onInitialSync: () => void;
  readonly onError: (error: unknown) => void;
}

export const startSpikeShapeSync = (
  handlers: SpikeShapeSyncHandlers,
): Effect.Effect<SpikeShapeSyncHandle, LocalDatabaseError, LocalDatabase> =>
  Effect.gen(function* () {
    const { pg } = yield* LocalDatabase;

    const shape = yield* attempt("start Electric shape sync", () =>
      pg.electric.syncShapeToTable({
        shape: {
          url: new URL(SHAPE_URL, window.location.origin).toString(),
          params: { table: "spike_items" },
        },
        table: "spike_items",
        primaryKey: ["id"],
        shapeKey: "spike_items",
        onInitialSync: handlers.onInitialSync,
        onError: handlers.onError,
      }),
    );

    return { unsubscribe: shape.unsubscribe };
  });

export const stopSpikeShapeSync = (handle: SpikeShapeSyncHandle): Effect.Effect<void> =>
  Effect.sync(() => handle.unsubscribe());

export const readLeaderState: Effect.Effect<boolean, never, LocalDatabase> = Effect.gen(
  function* () {
    const { pg } = yield* LocalDatabase;
    return pg.isLeader;
  },
);
