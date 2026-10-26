import type { BootState } from "@/boot";
import type { ReactNode } from "react";
import type { UserId } from "core";

import { Button } from "@sync-disc/ui/components/button";
import { useEffect, useState } from "react";

import { resetLocalData, startClientApp } from "@/boot";

import Loader from "./loader";

type BootStatus = BootState | { readonly status: "loading" };

export function BootGate({
  children,
  userId,
}: {
  readonly children: ReactNode;
  readonly userId: UserId;
}) {
  const [state, setState] = useState<BootStatus>({ status: "loading" });
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | undefined>();

  useEffect(() => {
    let mounted = true;

    startClientApp(userId)
      .then((next) => {
        if (mounted) setState(next);
      })
      .catch((cause: unknown) => {
        if (mounted) {
          setState({
            status: "error",
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });

    return () => {
      mounted = false;
      void import("@/db/bootstrap").then(({ disposeClientApp }) =>
        disposeClientApp().catch((cause: unknown) => {
          console.error("Failed to close the local workspace database", cause);
        }),
      );
    };
  }, [userId]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Loader />
        <p className="text-sm text-muted-foreground">Preparing your local workspace...</p>
      </div>
    );
  }

  if (state.status === "error") {
    const reset = () => {
      if (!window.confirm("Delete the local workspace and start over?")) {
        return;
      }

      setResetting(true);
      setResetError(undefined);

      resetLocalData(userId)
        .then(() => window.location.reload())
        .catch((cause: unknown) => {
          setResetting(false);
          setResetError(cause instanceof Error ? cause.message : String(cause));
        });
    };

    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4 border border-border bg-background p-6">
          <h1 className="text-lg font-semibold">Local database unavailable</h1>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {state.message}
          </p>
          {resetError ? (
            <p className="whitespace-pre-wrap break-words text-sm text-destructive">{resetError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={resetting}
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
            <Button type="button" variant="destructive" disabled={resetting} onClick={reset}>
              {resetting ? "Resetting..." : "Reset local data"}
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return children;
}
