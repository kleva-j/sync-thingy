import type { BootState } from "@/boot";
import type { ReactNode } from "react";

import { Button } from "@sync-disc/ui/components/button";
import { useEffect, useState } from "react";

import { startClientApp } from "@/boot";

import Loader from "./loader";

type BootStatus = BootState | { readonly status: "loading" };

export function BootGate({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<BootStatus>({ status: "loading" });

  useEffect(() => {
    let mounted = true;

    startClientApp()
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
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Loader />
        <p className="text-sm text-muted-foreground">Preparing your local workspace...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4 border border-border bg-background p-6">
          <h1 className="text-lg font-semibold">Local database unavailable</h1>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {state.message}
          </p>
          <Button type="button" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </main>
    );
  }

  return children;
}
