export type BootState =
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly message: string };

export interface BootLockManager {
  request<A>(name: string, run: () => Promise<A>): Promise<A>;
}

const BOOT_TIMEOUT_MS = 15_000;

const getBootLockManager = (): BootLockManager | undefined => {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return undefined;
  }

  return navigator.locks as unknown as BootLockManager;
};

export function withBootLock<A>(
  run: () => Promise<A>,
  locks: BootLockManager | null | undefined = getBootLockManager(),
): Promise<A> {
  return locks ? locks.request("sync-disc-client-boot", run) : run();
}

const withTimeout = <A>(run: () => Promise<A>, timeoutMs: number): Promise<A> => {
  if (timeoutMs <= 0) {
    return run();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Client database boot timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve()
      .then(run)
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (cause: unknown) => {
          clearTimeout(timer);
          reject(cause);
        },
      );
  });
};

const loadClientDatabase = async () => {
  const { bootClientApp, runClientApp } = await import("./db/bootstrap");
  await runClientApp(bootClientApp);
};

export async function startClientApp(
  load: () => Promise<void> = loadClientDatabase,
  locks: BootLockManager | null | undefined = getBootLockManager(),
  timeoutMs = BOOT_TIMEOUT_MS,
): Promise<BootState> {
  try {
    await withBootLock(() => withTimeout(load, timeoutMs), locks);
    return { status: "ready" };
  } catch (cause) {
    return {
      status: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
