import type { LocalDatabase, SpikeItem } from '@/db/client';
import type { SpikeShapeSyncHandle } from '@/db/spike';

import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Effect, Fiber } from "effect";

import { describeError } from "@/db/errors";
import {
  localDatabaseRuntime, runLocalDatabase,
} from "@/db/client";

import {
  startSpikeShapeSync,
  stopSpikeShapeSync,
  listRecentItems,
  readLeaderState,
  insertItem,
  countItems,
  seedItems,
} from "@/db/spike";

export const Route = createFileRoute("/spike")({
  component: SpikeComponent,
});

function SpikeComponent() {
  const [items, setItems] = useState<SpikeItem[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("Opening local database...");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [timing, setTiming] = useState<string>();
  const shapeHandleRef = useRef<SpikeShapeSyncHandle | undefined>(undefined);

  const refreshData = useCallback(
    () =>
      Effect.all([listRecentItems, countItems]).pipe(
        Effect.tap(([rows, total]) =>
          Effect.sync(() => {
            setItems(rows);
            setCount(total);
          }),
        ),
        Effect.asVoid,
      ),
    [],
  );

  const refresh = useCallback(() => runLocalDatabase(refreshData()), [refreshData]);

  const run = async <A, E>(
    label: string,
    effect: Effect.Effect<A, E, LocalDatabase>,
  ): Promise<A | undefined> => {
    setBusy(true);
    setError(undefined);
    const startedAt = performance.now();
    try {
      const result = await runLocalDatabase(effect);
      setTiming(`${label}: ${Math.round(performance.now() - startedAt)}ms`);
      return result;
    } catch (cause) {
      setError(describeError(cause));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const setLeader = (leader: boolean) => {
      if (!cancelled) {
        setIsLeader(leader);
      }
    };

    const leaderLoop = Effect.gen(function* () {
      while (!cancelled) {
        const leader = yield* readLeaderState;
        yield* Effect.sync(() => setLeader(leader));
        yield* Effect.sleep("500 millis");
      }
    });

    const leaderFiber = localDatabaseRuntime.runFork(leaderLoop);

    const boot = refreshData().pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          if (!cancelled) {
            setStatus("Local database ready.");
          }
        }),
      ),
      Effect.catch((cause) =>
        Effect.sync(() => {
          if (!cancelled) {
            setError(cause.message);
            setStatus("Local database failed to open.");
          }
        }),
      ),
    );

    runLocalDatabase(boot);

    return () => {
      cancelled = true;
      localDatabaseRuntime.runPromise(Fiber.interrupt(leaderFiber));
      shapeHandleRef.current?.unsubscribe();
      shapeHandleRef.current = undefined;
    };
  }, [refreshData]);

  const addItem = () =>
    run(
      "Insert",
      Effect.gen(function* () {
        yield* insertItem(`item-${new Date().toISOString()}`);
        yield* refreshData();
        yield* Effect.sync(() => setStatus("Inserted one row."));
      }),
    );

  const seedTenThousand = () =>
    run(
      "Insert 10k + count",
      Effect.gen(function* () {
        yield* seedItems(10_000);
        yield* refreshData();
        yield* Effect.sync(() => setStatus("Seeded 10k rows."));
      }),
    );

  const queryTenThousand = () =>
    run(
      "Query 10k",
      Effect.gen(function* () {
        const total = yield* countItems;
        yield* Effect.sync(() => setStatus(`Queried ${total} rows.`));
      }),
    );

  const startShapeSync = () =>
    run(
      "Start shape sync",
      Effect.gen(function* () {
        yield* Effect.sync(() => setStatus("Shape sync running."));

        const handle = yield* startSpikeShapeSync({
          onInitialSync: () => {
            setStatus("Shape sync caught up.");
            refresh().catch((cause: unknown) => setError(describeError(cause)));
          },
          onError: (cause) => setError(describeError(cause)),
        });

        shapeHandleRef.current?.unsubscribe();
        shapeHandleRef.current = handle;
      }),
    );

  const stopShapeSync = () => {
    const handle = shapeHandleRef.current;
    shapeHandleRef.current = undefined;
    if (handle) {
      runLocalDatabase(stopSpikeShapeSync(handle)).catch((cause: unknown) =>
        setError(describeError(cause)),
      );
    }
    setStatus("Shape sync stopped.");
  };

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold">PGlite Worker Spike</h1>
        <p className="text-muted-foreground text-sm">
          Persistent IndexedDB PostgreSQL in a worker, wrapped with Drizzle.
        </p>
      </div>

      <section className="grid gap-3 rounded-lg border p-4 text-sm">
        <div className="flex flex-wrap gap-4">
          <span>
            Status: <strong>{status}</strong>
          </span>
          <span>
            Rows: <strong>{count}</strong>
          </span>
          <span>
            Leader tab: <strong>{isLeader ? "yes" : "no"}</strong>
          </span>
        </div>
        {timing ? <div>Last operation: {timing}</div> : null}
        {error ? <div className="text-red-600">Error: {error}</div> : null}
      </section>

      <section className="flex flex-wrap gap-2">
        <button
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={addItem}
          type="button"
        >
          Insert one
        </button>
        <button
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={seedTenThousand}
          type="button"
        >
          Seed 10k
        </button>
        <button
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={queryTenThousand}
          type="button"
        >
          Query count
        </button>
        <button
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={() => refresh()}
          type="button"
        >
          Refresh
        </button>
        <button
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={startShapeSync}
          type="button"
        >
          Start Electric sync
        </button>
        <button
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={stopShapeSync}
          type="button"
        >
          Stop Electric sync
        </button>
      </section>

      <section className="rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="border-b">
            <tr>
              <th className="p-3 font-medium">ID</th>
              <th className="p-3 font-medium">Label</th>
              <th className="p-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-b last:border-0" key={item.id}>
                <td className="p-3 font-mono text-xs">{item.id}</td>
                <td className="p-3">{item.label}</td>
                <td className="p-3">{item.createdAt.toISOString()}</td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={3}>
                  No rows yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
