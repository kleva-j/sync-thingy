# Client Database Boot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boot the web app only after client migrations and current-client initialization succeed, with a blocking loading/error screen and cross-tab safety.

**Architecture:** Keep PGlite and Drizzle in a lazily imported module. `ClientDatabaseLive` opens the client database, a dedicated boot layer applies migrations, and `CurrentClientLive` creates or reads the persisted UUIDv7. `startClientApp` serializes the whole boot through the Web Locks API before React mounts the router.

**Tech Stack:** React 19, TanStack Router, Effect `4.0.5`, PGlite `0.5.10`, Drizzle `0.45.4`, Vite+ `1.1.0`.

**Spec:** `PLAN.md`, Phase 2 — Local Database and Browser Migrations.

## Current Baseline

Phase 2 is partially implemented and should not be rebuilt:

- `apps/web/src/db/pglite.worker.ts` runs PGlite in an ES module worker.
- `apps/web/src/db/client.ts` opens `idb://sync-disc` through `PGliteWorker` and creates the Drizzle client.
- `packages/db/src/migrations.generated.ts` exports `clientMigrations`.
- `packages/db/src/client-migrations.ts` applies migrations transactionally and is idempotent.
- `apps/web/src/db/bootstrap.ts` currently applies migrations but does not initialize a client.
- `apps/web/vite.config.ts` already excludes PGlite from dependency optimization and uses ES module workers.
- The app still renders the router immediately; boot is not gated.
- Offline full reload is still blocked because no app shell is cached.

This plan covers the remaining Phase 2 work: current-client persistence, an explicit boot layer, cross-tab serialization, blocking boot UI, and the offline app shell.

## Global Constraints

- Use `vp` commands; do not replace Vite+ with direct Vite or Vitest commands in committed scripts.
- Keep PGlite in a browser worker; never open it on the main thread.
- Generate IDs with `newUuid7()` from `core`; do not use `crypto.randomUUID()`.
- Persist the client ID under the exact `local_settings` key `"current-client-id"` and value shape `{ "clientId": "<uuidv7>" }`.
- Keep the persisted table names `clients`, `local_settings`, and `local_migrations` unchanged.
- Do not use `@effect/sql-pglite`.
- Do not add TanStack Query, repositories, or server code in this phase.
- Preserve the existing `ClientDatabase`/`ClientDatabaseError` names.
- `PLAN.md` is gitignored. Update it locally if useful, but never commit it.
- Commits are requested only after each task's verification passes.

## Review Focus

- Empty client database on first boot creates exactly one `clients` row and one `local_settings` row.
- A reload returns the same client ID and does not create a second client.
- Two tabs booting at once serialize; both get the same client ID and migrations are not applied twice.
- A migration failure leaves the router unmounted and shows the blocking error screen.
- A production build reloads with the network offline after the app shell has been cached.

---

## File Structure

- Create `apps/web/src/db/current-client.ts` — current-client read/create transaction plus the `CurrentClient` Effect service/layer.
- Create `apps/web/src/db/current-client.test.ts` — PGlite tests for creation, reuse, concurrency, repair, and corrupt data.
- Modify `apps/web/src/db/bootstrap.ts` — compose migration boot, current-client layer, and the app runtime.
- Modify `apps/web/src/db/client.ts` — remove the un-migrated runtime entry point.
- Create `apps/web/src/boot.ts` — Web Locks wrapper and browser boot controller.
- Create `apps/web/src/boot.test.ts` — boot controller and lock fallback tests.
- Create `apps/web/src/components/boot-gate.tsx` — blocking loading/error UI around the router.
- Modify `apps/web/src/main.tsx` — render the router inside `BootGate`.
- Create `apps/web/public/sw.js` — production app-shell cache.
- Create `apps/web/src/service-worker.ts` — production-only service worker registration.
- Modify `apps/web/package.json` — add `core` and a `test` script.
- Modify `pnpm-lock.yaml` — workspace dependency update.

---

### Task 1: Persist and expose the current client

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/db/current-client.ts`
- Test: `apps/web/src/db/current-client.test.ts`

**Interfaces:**
- Consumes: `ClientDatabase` and `ClientDrizzle` from `./client`; `ClientDatabaseError` and `clientDatabaseError` from `./errors`; `ClientId`, `newUuid7` from `core`; `clients`, `localSettings` from `@sync-disc/db/client-schema`.
- Produces:
  - `CURRENT_CLIENT_SETTING_KEY: "current-client-id"`
  - `ensureCurrentClient(db: ClientDrizzle): Effect.Effect<ClientId, ClientDatabaseError>`
  - `class CurrentClient extends Context.Service<CurrentClient, { readonly id: ClientId }>()("@sync-disc/web/CurrentClient")`
  - `CurrentClientLive: Layer.Layer<CurrentClient, ClientDatabaseError, ClientDatabase>`

- [ ] **Step 1: Add the web dependency and test script**

Add `"core": "workspace:*"` to `apps/web/package.json` dependencies and `"test": "vp test"` to its scripts, then run:

```bash
pnpm install
```

Expected: install succeeds and `pnpm-lock.yaml` records `core` for the `web` workspace.

- [ ] **Step 2: Write the failing current-client test**

Create `apps/web/src/db/current-client.test.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { applyClientMigrations } from "@sync-disc/db/client-migrations";
import * as schema from "@sync-disc/db/client-schema";
import { clientMigrations } from "@sync-disc/db/migrations";
import { newUuid7 } from "core";
import { drizzle } from "drizzle-orm/pglite";
import { Effect } from "effect";
import { expect, test } from "vite-plus/test";

import { CURRENT_CLIENT_SETTING_KEY, ensureCurrentClient } from "./current-client.ts";

const createDatabase = async () => {
  const pg = new PGlite();
  await applyClientMigrations(pg, clientMigrations);
  return { pg, db: drizzle(pg, { schema }) };
};

test("creates one current client and reuses it", async () => {
  const { pg, db } = await createDatabase();

  try {
    const first = await Effect.runPromise(ensureCurrentClient(db));
    const second = await Effect.runPromise(ensureCurrentClient(db));

    expect(second).toBe(first);
    expect(await db.select().from(schema.clients)).toHaveLength(1);
    expect(await db.select().from(schema.localSettings)).toEqual([
      { key: CURRENT_CLIENT_SETTING_KEY, value: { clientId: first } },
    ]);
  } finally {
    await pg.close();
  }
});

test("concurrent initialization returns one client ID", async () => {
  const { pg, db } = await createDatabase();

  try {
    const [first, second] = await Promise.all([
      Effect.runPromise(ensureCurrentClient(db)),
      Effect.runPromise(ensureCurrentClient(db)),
    ]);

    expect(second).toBe(first);
    expect(await db.select().from(schema.clients)).toHaveLength(1);
  } finally {
    await pg.close();
  }
});

test("repairs a persisted client ID that has no clients row", async () => {
  const { pg, db } = await createDatabase();
  const clientId = newUuid7();

  try {
    await db.insert(schema.localSettings).values({
      key: CURRENT_CLIENT_SETTING_KEY,
      value: { clientId },
    });

    await expect(Effect.runPromise(ensureCurrentClient(db))).resolves.toBe(clientId);
    expect(await db.select().from(schema.clients)).toEqual([
      expect.objectContaining({ id: clientId }),
    ]);
  } finally {
    await pg.close();
  }
});

test("rejects a corrupt persisted client setting", async () => {
  const { pg, db } = await createDatabase();

  try {
    await db.insert(schema.localSettings).values({
      key: CURRENT_CLIENT_SETTING_KEY,
      value: { clientId: "not-a-uuid" },
    });

    await expect(Effect.runPromise(ensureCurrentClient(db))).rejects.toMatchObject({
      _tag: "ClientDatabaseError",
      operation: "ensure current client",
    });
    expect(await db.select().from(schema.clients)).toHaveLength(0);
  } finally {
    await pg.close();
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web test src/db/current-client.test.ts`

Expected: FAIL because `./current-client.ts` does not exist.

- [ ] **Step 4: Implement `ensureCurrentClient`**

Create `apps/web/src/db/current-client.ts` with these exports and behavior:

```ts
export const CURRENT_CLIENT_SETTING_KEY = "current-client-id";

const CurrentClientSetting = Schema.Struct({ clientId: ClientId });
const decodeCurrentClientSetting = Schema.decodeSync(CurrentClientSetting);

export const ensureCurrentClient = (
  db: ClientDrizzle,
): Effect.Effect<ClientId, ClientDatabaseError> =>
  Effect.tryPromise({
    try: () => db.transaction(async (tx) => {
      // read -> parse existing -> generate and insert with onConflictDoNothing
      // -> re-read on conflict -> insert clients row with onConflictDoNothing
      // -> return the winning ClientId
    }),
    catch: (cause) => clientDatabaseError("ensure current client", cause),
  });
```

The transaction must implement this exact sequence:

1. Read `local_settings` where `key = CURRENT_CLIENT_SETTING_KEY`.
2. If present, decode `value` with `decodeCurrentClientSetting` and use its `clientId`.
3. If absent, generate `Schema.decodeSync(ClientId)(newUuid7())`.
4. Insert `{ key: CURRENT_CLIENT_SETTING_KEY, value: { clientId } }` with `onConflictDoNothing().returning()`.
5. If the insert lost a race, re-read the setting and decode the winner.
6. Insert `{ id: clientId }` into `clients` with `onConflictDoNothing()`.
7. Return the `clientId`.

Never generate a second ID after a conflict. Invalid persisted values must throw and roll back.

- [ ] **Step 5: Add the `CurrentClient` service and layer**

Append to `current-client.ts`:

```ts
export class CurrentClient extends Context.Service<
  CurrentClient,
  { readonly id: ClientId }
>()("@sync-disc/web/CurrentClient") {}

const loadCurrentClient = Effect.gen(function* () {
  const { db } = yield* ClientDatabase;
  return { id: yield* ensureCurrentClient(db) };
});

export const CurrentClientLive = Layer.effect(CurrentClient, loadCurrentClient);
```

The layer error type must be `ClientDatabaseError`; it must require `ClientDatabase` and nothing else.

- [ ] **Step 6: Run the tests and checks**

Run:

```bash
pnpm --filter web test src/db/current-client.test.ts
pnpm run check-types
pnpm exec oxlint apps/web/src/db/current-client.ts apps/web/src/db/current-client.test.ts
```

Expected: all four tests pass, typecheck passes, lint reports no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/db/current-client.ts apps/web/src/db/current-client.test.ts
git commit -m "feat(web): persist the current client"
```

---

### Task 2: Serialize boot and compose the app runtime

**Files:**
- Create: `apps/web/src/boot.ts`
- Test: `apps/web/src/boot.test.ts`
- Modify: `apps/web/src/db/bootstrap.ts`
- Modify: `apps/web/src/db/client.ts`

**Interfaces:**
- Consumes: `ClientDatabaseLive`, `ClientDatabase`; `CurrentClient`, `CurrentClientLive`; `bootstrapClientDatabase`.
- Produces:
  - `type BootState = { status: "ready" } | { status: "error"; message: string }`
  - `interface BootLockManager { request<A>(name: string, run: () => Promise<A>): Promise<A> }`
  - `withBootLock<A>(run: () => Promise<A>, locks?: BootLockManager): Promise<A>`
  - `startClientApp(load?: () => Promise<void>, locks?: BootLockManager): Promise<BootState>`
  - `ClientAppLive`, `clientAppRuntime`, `bootClientApp`, `runClientApp`

- [ ] **Step 1: Write the failing boot-controller test**

Create `apps/web/src/boot.test.ts`:

```ts
import { expect, test } from "vite-plus/test";

import { type BootLockManager, startClientApp, withBootLock } from "./boot.ts";

test("runs boot work under the cross-tab lock", async () => {
  let lockName = "";
  const locks: BootLockManager = {
    request: (name, run) => {
      lockName = name;
      return run();
    },
  };

  await expect(withBootLock(async () => 42, locks)).resolves.toBe(42);
  expect(lockName).toBe("sync-disc-client-boot");
});

test("falls back when Web Locks are unavailable", async () => {
  await expect(withBootLock(async () => 7, undefined)).resolves.toBe(7);
});

test("returns ready after boot work succeeds", async () => {
  let calls = 0;
  const result = await startClientApp(async () => {
    calls += 1;
  }, undefined);

  expect(result).toEqual({ status: "ready" });
  expect(calls).toBe(1);
});

test("returns a useful error when boot work fails", async () => {
  const result = await startClientApp(async () => {
    throw new Error("migration exploded");
  }, undefined);

  expect(result).toEqual({ status: "error", message: "migration exploded" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test src/boot.test.ts`

Expected: FAIL because `./boot.ts` does not exist.

- [ ] **Step 3: Implement `apps/web/src/boot.ts`**

Use these exact interfaces and behavior:

```ts
export type BootState =
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly message: string };

export interface BootLockManager {
  request<A>(name: string, run: () => Promise<A>): Promise<A>;
}

export function withBootLock<A>(
  run: () => Promise<A>,
  locks: BootLockManager | undefined = getBootLockManager(),
): Promise<A> {
  return locks ? locks.request("sync-disc-client-boot", run) : run();
}

const loadClientDatabase = async () => {
  const { bootClientApp, runClientApp } = await import("./db/bootstrap");
  await runClientApp(bootClientApp);
};

export async function startClientApp(
  load: () => Promise<void> = loadClientDatabase,
  locks: BootLockManager | undefined = getBootLockManager(),
): Promise<BootState> {
  try {
    await withBootLock(load, locks);
    return { status: "ready" };
  } catch (cause) {
    return {
      status: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
```

`getBootLockManager` must return `undefined` when `navigator.locks` is unavailable, otherwise cast `navigator.locks` to `BootLockManager`. The dynamic import of `./db/bootstrap` is what keeps PGlite out of the initial bundle; do not replace it with a static import.

- [ ] **Step 4: Compose the migration boot and current-client layers**

Modify `apps/web/src/db/bootstrap.ts` to export:

```ts
export const ClientDatabaseBootLive = Layer.effectDiscard(bootstrapClientDatabase).pipe(
  Layer.provideMerge(ClientDatabaseLive),
);

export const ClientAppLive = CurrentClientLive.pipe(
  Layer.provideMerge(ClientDatabaseBootLive),
);

export const clientAppRuntime = ManagedRuntime.make(ClientAppLive);

export const bootClientApp = Effect.gen(function* () {
  return (yield* CurrentClient).id;
});

export const runClientApp = <A, E>(
  effect: Effect.Effect<A, E, ClientDatabase | CurrentClient>,
): Promise<A> => clientAppRuntime.runPromise(effect);
```

The layer order is intentional: migrations complete before `CurrentClientLive` reads or writes `clients` and `local_settings`.

- [ ] **Step 5: Remove the un-gated runtime**

In `apps/web/src/db/client.ts`, remove `clientDatabaseRuntime` and `runClientDatabase` and the now-unused `ManagedRuntime` import. Keep `ClientDatabaseLive` exported so Task 2's layer can build on it.

- [ ] **Step 6: Run tests and checks**

Run:

```bash
pnpm --filter web test src/boot.test.ts
pnpm run check-types
pnpm exec oxlint apps/web/src/boot.ts apps/web/src/boot.test.ts apps/web/src/db/bootstrap.ts apps/web/src/db/client.ts
```

Expected: four boot tests pass, typecheck passes, lint reports no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/boot.ts apps/web/src/boot.test.ts apps/web/src/db/bootstrap.ts apps/web/src/db/client.ts
git commit -m "feat(web): gate startup on client database boot"
```

---

### Task 3: Add the blocking boot UI and lazy mount the router

**Files:**
- Create: `apps/web/src/components/boot-gate.tsx`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: `startClientApp`, `BootState`; `Loader`; `Button` from `@sync-disc/ui/components/button`.
- Produces: `BootGate({ children }: { readonly children: ReactNode })`.

- [ ] **Step 1: Create the boot gate**

Create `apps/web/src/components/boot-gate.tsx` with:

- A local `BootStatus` type that adds `{ status: "loading" }` to `BootState`.
- Initial state `{ status: "loading" }`.
- One `useEffect` that calls `void startClientApp().then(setState)`; guard against setting state after unmount.
- Loading UI: centered `Loader` plus the exact copy `Preparing your local workspace...`.
- Error UI: heading `Local database unavailable`, the message from `startClientApp` in a readable block, and a `Reload` button that calls `window.location.reload()`.
- Ready state: render `children` unchanged.

Do not import `./db/bootstrap`, `./db/client`, or any Drizzle/PGlite module statically from this file.

- [ ] **Step 2: Wrap the router**

Modify `apps/web/src/main.tsx` so the root render becomes:

```tsx
root.render(
  <BootGate>
    <RouterProvider router={router} />
  </BootGate>,
);
```

Keep the router creation and module registration unchanged. The router must not mount until `BootGate` reports ready.

- [ ] **Step 3: Run typecheck and lint**

Run:

```bash
pnpm run check-types
pnpm exec oxlint apps/web/src/components/boot-gate.tsx apps/web/src/main.tsx
```

Expected: typecheck passes and lint reports no errors.

- [ ] **Step 4: Verify the lazy split**

Run:

```bash
pnpm --filter web build
find apps/web/dist/assets -maxdepth 1 -type f -name '*.js' -print
```

Expected: the build succeeds and emits a separate lazy chunk for the database/boot module. The initial entry chunk must not statically include `@electric-sql/pglite`; verify with:

```bash
rg -l "PGliteWorker|@electric-sql/pglite" apps/web/dist/assets
```

Expected: matches only the lazy database chunk, not the initial `index-*.js` entry.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/boot-gate.tsx apps/web/src/main.tsx
git commit -m "feat(web): show boot progress and block on database errors"
```

---

### Task 4: Cache the production app shell

**Files:**
- Create: `apps/web/public/sw.js`
- Create: `apps/web/src/service-worker.ts`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Produces: `registerServiceWorker(): void`; service worker cache name `sync-disc-shell-v1`.
- Consumes: `import.meta.env.PROD`, `navigator.serviceWorker`.

- [ ] **Step 1: Add the service worker**

Create `apps/web/public/sw.js` with this behavior:

- Cache name: `sync-disc-shell-v1`.
- On `install`, cache `/` and call `self.skipWaiting()`.
- On `activate`, delete older `sync-disc-shell-*` caches and call `self.clients.claim()`.
- On `fetch`, only handle same-origin `GET` requests.
- For navigations, use network-first and fall back to the cached `/` shell.
- For other requests, use cache-first and update the cache from successful network responses.

The shell fallback is what makes a route reload work offline; do not match only the exact navigation URL.

- [ ] **Step 2: Add production-only registration**

Create `apps/web/src/service-worker.ts`:

```ts
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
```

Call `registerServiceWorker()` from `apps/web/src/main.tsx` after the root render. Do not register in development, because a dev-mode service worker makes HMR and module reloads misleading.

- [ ] **Step 3: Verify the build emits the worker**

Run:

```bash
pnpm --filter web build
test -f apps/web/dist/sw.js
```

Expected: both commands succeed.

- [ ] **Step 4: Verify offline reload**

Run:

```bash
pnpm --filter web serve
```

Then:

1. Open the preview URL.
2. Wait for the service worker to activate.
3. Reload once while online so hashed assets enter the cache.
4. In DevTools, set Network to Offline.
5. Reload.

Expected: the app shell loads from cache, `BootGate` reaches ready, and the router appears using the persisted client database.

- [ ] **Step 5: Run checks**

```bash
pnpm run check-types
pnpm exec oxlint
```

Expected: typecheck and lint pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/sw.js apps/web/src/service-worker.ts apps/web/src/main.tsx
git commit -m "feat(web): cache the app shell for offline reloads"
```

---

## Final Verification

- [ ] Run `pnpm --filter web test`.
- [ ] Run `pnpm run check-types`.
- [ ] Run `pnpm exec oxlint`.
- [ ] Run `pnpm --filter web build`.
- [ ] Start `pnpm dev:web`, clear site data, and load the app in one tab. Expected: boot screen appears, then the router renders.
- [ ] Reload once. Expected: router renders without a visible error and the same client row is reused. The unit test covers the persisted ID; the manual check covers browser IndexedDB.
- [ ] Open a second tab while the first is running. Expected: both tabs render; neither shows `Local database unavailable` and no migration error appears.
- [ ] Temporarily break a migration SQL in memory, reload, and confirm the app stays on the error screen with the migration message; revert the change afterward. Do not commit the broken migration.
- [ ] Repeat the Task 4 offline reload check against the production preview.
- [ ] Update `PLAN.md` Phase 2 checkboxes and progress notes locally. Do not commit `PLAN.md`; it is gitignored.

## Intentional Deferrals

- No TanStack Query or repository factories; Phase 3 owns those.
- No `last_seen_at` updates; Phase 3 owns client activity writes.
- No migration down/rollback support; migrations remain forward-only.
- No browser E2E harness; the current repo has no Playwright setup, so multi-tab and IndexedDB reload checks remain manual for this phase.
