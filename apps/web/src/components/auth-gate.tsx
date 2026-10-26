import type { ReactNode } from "react";

import { useEffect, useState } from "react";
import { Schema } from "effect";
import { UserId } from "core";

import { queryClient } from "@/query/client";
import { authClient } from "@/auth/client";

import { BootGate } from "./boot-gate";

import Loader from "./loader";

type FormMode = "sign-in" | "sign-up" | "request-reset" | "reset-password";

const initialMode = (): FormMode =>
  window.location.pathname === "/reset-password" ? "reset-password" : "sign-in";

export function AuthGate({ children }: { readonly children: ReactNode }) {
  const sessionQuery = authClient.useSession();
  const userId = sessionQuery.data?.user.id;

  useEffect(() => {
    queryClient.clear();
  }, [userId]);

  if (sessionQuery.isPending) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background">
        <Loader />
        <span className="sr-only">Checking your account...</span>
      </main>
    );
  }

  if (sessionQuery.error) {
    return (
      <main className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Could not check your account</h1>
        <p className="text-sm text-muted-foreground">
          {sessionQuery.error.message}
        </p>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => void sessionQuery.refetch()}
          type="button"
        >
          Try again
        </button>
      </main>
    );
  }

  if (!sessionQuery.data?.user) {
    return <AccountForm />;
  }

  const authenticatedUserId: UserId = Schema.decodeUnknownSync(UserId)(userId);

  return (
    <BootGate key={authenticatedUserId} userId={authenticatedUserId}>
      {children}
    </BootGate>
  );
}

function AccountForm() {
  const [mode, setMode] = useState<FormMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>(() =>
    new URLSearchParams(window.location.search).has("verified")
      ? "Email verified. Sign in to open your workspace."
      : "",
  );

  const resetToken = new URLSearchParams(window.location.search).get("token");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setNotice("");

    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: `${window.location.origin}/?verified=1`,
        });
        if (result.error) throw new Error(result.error.message);
        setMode("sign-in");
        setNotice(
          "Check your inbox for a verification link before signing in.",
        );
      } else if (mode === "sign-in") {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: window.location.origin,
        });
        if (result.error) throw new Error(result.error.message);
      } else if (mode === "request-reset") {
        const result = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (result.error) throw new Error(result.error.message);
        setNotice(
          "If an account matches that address, a password reset link is on its way.",
        );
      } else {
        if (!resetToken)
          throw new Error("This password reset link is missing its token.");
        const result = await authClient.resetPassword({
          newPassword: password,
          token: resetToken,
        });
        if (result.error) throw new Error(result.error.message);
        window.history.replaceState({}, "", "/");
        setMode("sign-in");
        setPassword("");
        setNotice("Password updated. Sign in with your new password.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const heading =
    mode === "sign-up"
      ? "Create your account"
      : mode === "request-reset"
        ? "Reset your password"
        : mode === "reset-password"
          ? "Choose a new password"
          : "Welcome back";

  return (
    <main className="grid min-h-svh bg-[#f3f5f8] text-slate-950 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden min-h-svh overflow-hidden bg-[#101a2c] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-32 -top-28 size-[34rem] rounded-full border border-white/10" />
        <div className="absolute -right-12 top-8 size-[24rem] rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3 text-sm font-semibold tracking-wide">
          <span className="grid size-9 place-items-center rounded-full border border-cyan-300/60 text-cyan-200">
            ↗
          </span>
          sync-disc
        </div>
        <div className="relative max-w-xl py-12">
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.24em] text-cyan-200">
            Your workspace, in orbit
          </p>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.04] tracking-[-0.045em] xl:text-6xl">
            Pick up the thread on any device.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-300">
            Your workspace stays on this device first, then syncs securely to
            your account.
          </p>
          <div className="mt-14 flex max-w-sm items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
            <span className="rounded-full border border-white/15 px-3 py-2">
              This device
            </span>
            <span className="h-px flex-1 bg-cyan-300/60" />
            <span className="rounded-full border border-cyan-300/40 px-3 py-2 text-cyan-100">
              Your account
            </span>
          </div>
        </div>
        <p className="relative font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
          Local by default · private to your account
        </p>
      </section>

      <section className="flex min-h-svh items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <p className="font-semibold tracking-wide">sync-disc</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your workspace, ready wherever you are.
            </p>
          </div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Account access
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">{heading}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {mode === "sign-up"
              ? "Create a private space for your conversations."
              : mode === "request-reset"
                ? "We’ll send a reset link if the address has an account."
                : mode === "reset-password"
                  ? "Use at least 12 characters for your new password."
                  : "Sign in to continue to your workspace."}
          </p>

          <form className="mt-8 space-y-5" onSubmit={submit}>
            {mode === "sign-up" && (
              <label className="block space-y-2 text-sm font-medium">
                Name
                <input
                  autoComplete="name"
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 outline-none transition focus-visible:border-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
            )}
            {mode !== "reset-password" && (
              <label className="block space-y-2 text-sm font-medium">
                Email
                <input
                  autoComplete="email"
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 outline-none transition focus-visible:border-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
            )}
            {mode !== "request-reset" && (
              <label className="block space-y-2 text-sm font-medium">
                {mode === "reset-password" ? "New password" : "Password"}
                <input
                  autoComplete={
                    mode === "reset-password"
                      ? "new-password"
                      : "current-password"
                  }
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 outline-none transition focus-visible:border-slate-950 focus-visible:ring-2 focus-visible:ring-slate-300"
                  minLength={12}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
            )}

            {error ? (
              <p
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            {notice ? (
              <p
                className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-950"
                role="status"
              >
                {notice}
              </p>
            ) : null}

            <button
              className="h-11 w-full rounded-md bg-[#17263f] px-4 text-sm font-semibold text-white transition hover:bg-[#243a5f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17263f] disabled:cursor-wait disabled:opacity-60"
              disabled={busy || (mode === "reset-password" && !resetToken)}
              type="submit"
            >
              {busy
                ? "Working..."
                : mode === "sign-up"
                  ? "Create account"
                  : mode === "request-reset"
                    ? "Send reset link"
                    : mode === "reset-password"
                      ? "Update password"
                      : "Sign in"}
            </button>
          </form>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm">
            {mode === "sign-in" ? (
              <>
                <button
                  className="text-slate-600 underline-offset-4 hover:underline"
                  onClick={() => setMode("sign-up")}
                  type="button"
                >
                  Create an account
                </button>
                <button
                  className="text-slate-600 underline-offset-4 hover:underline"
                  onClick={() => setMode("request-reset")}
                  type="button"
                >
                  Forgot password?
                </button>
              </>
            ) : (
              <button
                className="text-slate-600 underline-offset-4 hover:underline"
                onClick={() => {
                  setMode("sign-in");
                  setError(undefined);
                  window.history.replaceState({}, "", "/");
                }}
                type="button"
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
