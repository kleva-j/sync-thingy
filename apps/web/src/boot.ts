import type { UserId } from "core";

export type BootState =
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly message: string };

export interface BootLockManager {
  request<A>(
    name: string,
    options: { readonly signal?: AbortSignal },
    run: () => Promise<A>,
  ): Promise<A>;
}

const BOOT_TIMEOUT_MS = 60_000;

const getBootLockManager = (): BootLockManager | undefined => {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return undefined;
  }

  return navigator.locks as unknown as BootLockManager;
};

export function withBootLock<A>(
  run: () => Promise<A>,
  locks: BootLockManager | null | undefined = getBootLockManager(),
  signal?: AbortSignal,
): Promise<A> {
  return locks
    ? locks.request("sync-disc-client-boot", { signal }, run)
    : run();
}

const createBootTimeout = (timeoutMs: number, onTimeout: () => void) => {
  if (timeoutMs <= 0) {
    return {
      promise: new Promise<never>(() => undefined),
      cancel: () => undefined,
    };
  }

  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`Client database boot timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => clearTimeout(timer),
  };
};

const loadClientDatabase = async (userId: UserId) => {
  const { bootClientApp, initializeClientApp, runClientApp } =
    await import("./db/bootstrap");
  await initializeClientApp(userId);
  await runClientApp(bootClientApp);
};

const deleteIndexedDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to delete ${name}`));
    request.onblocked = () =>
      reject(new Error("Close other tabs and try again"));
  });

export async function resetLocalData(userId: UserId): Promise<void> {
  const bootstrap = await import("./db/bootstrap");
  await bootstrap.disposeClientApp();

  const databases = await indexedDB.databases?.();
  const partitionName = `sync-disc-${userId}`;
  const names = databases
    ? databases
        .map((database) => database.name)
        .filter(
          (name): name is string =>
            name === `/pglite/${partitionName}` || name === partitionName,
        )
    : [`/pglite/${partitionName}`, partitionName];

  await Promise.all(names.map(deleteIndexedDatabase));
}

export async function startClientApp(
  userId: UserId,
  load: (userId: UserId) => Promise<void> = loadClientDatabase,
  locks: BootLockManager | null | undefined = getBootLockManager(),
  timeoutMs = BOOT_TIMEOUT_MS,
): Promise<BootState> {
  const controller = new AbortController();
  const timeout = createBootTimeout(timeoutMs, () => controller.abort());
  const boot = withBootLock(() => load(userId), locks, controller.signal);

  try {
    await Promise.race([boot, timeout.promise]);
    return { status: "ready" };
  } catch (cause) {
    return {
      status: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    timeout.cancel();
  }
}
