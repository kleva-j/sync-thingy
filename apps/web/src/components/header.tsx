import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { Button } from "@sync-disc/ui/components/button";
import { ModeToggle } from "./mode-toggle";

export function Header() {
  const session = authClient.useSession();
  const [error, setError] = useState<string>();
  const links = [{ to: "/", label: "Home" }] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {session.data?.user ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {session.data.user.email}
              </span>
              <Button
                onClick={async () => {
                  setError(undefined);
                  const result = await authClient.signOut();
                  if (result.error) setError(result.error.message);
                }}
                size="sm"
                variant="outline"
              >
                Sign out
              </Button>
            </>
          ) : null}
          <ModeToggle />
        </div>
      </div>
      {error ? <p className="px-2 pb-2 text-sm text-destructive">{error}</p> : null}
      <hr />
    </div>
  );
}
