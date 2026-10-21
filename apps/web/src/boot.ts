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
  return locks ? locks.request("sync-disc-client-boot", { signal }, run) : run();
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

const loadClientDatabase = async () => {
  const { bootClientApp, runClientApp } = await import("./db/bootstrap");
  await runClientApp(bootClientApp);
};

const deleteIndexedDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed to delete ${name}`));
    request.onblocked = () => reject(new Error("Close other tabs and try again"));
  });

export async function resetLocalData(): Promise<void> {
  const bootstrap = await import("./db/bootstrap").catch(() => undefined);
  await bootstrap?.disposeClientApp();

  const databases = await indexedDB.databases?.();
  const names = databases
    ? databases
      .map((database) => database.name)
      .filter((name): name is string => Boolean(name?.includes("sync-disc")))
    : ["/pglite/sync-disc", "sync-disc"];

  await Promise.all(names.map(deleteIndexedDatabase));

  if (navigator.onLine && "caches" in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith("sync-disc-shell-")).map((key) => caches.delete(key)),
    );
  }
}

export async function startClientApp(
  load: () => Promise<void> = loadClientDatabase,
  locks: BootLockManager | null | undefined = getBootLockManager(),
  timeoutMs = BOOT_TIMEOUT_MS,
): Promise<BootState> {
  const controller = new AbortController();
  const timeout = createBootTimeout(timeoutMs, () => controller.abort());
  const boot = withBootLock(load, locks, controller.signal);

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
