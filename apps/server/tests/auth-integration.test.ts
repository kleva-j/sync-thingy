import { HttpRouter, HttpServer, HttpServerResponse } from "effect/http";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import { Layer } from "effect";

import { eq } from "drizzle-orm";

import { user } from "@sync-disc/db/server-schema";

import { makeAuth, ServerAuthForTest, ServerAuthRoutes } from "../src/auth/index.ts";
import type { OutgoingEmail } from "../src/auth/email.ts";
import { makeTestDatabase } from "./support/database.ts";

const secret = "an-integration-test-secret-with-32-chars";
const origin = "http://localhost:3001";
const email = "auth-test@example.com";
const password = "a-secure-test-password";

let testDb: Awaited<ReturnType<typeof makeTestDatabase>>;
let dispose: (() => Promise<void>) | undefined;
let handler: (request: Request) => Promise<Response>;
let sentEmails: OutgoingEmail[];

beforeEach(async () => {
  testDb = await makeTestDatabase();
  sentEmails = [];
  const auth = makeAuth(
    testDb.db,
    {
      secret,
      baseURL: "http://localhost:3000",
      trustedOrigins: [origin],
      production: false,
    },
    {
      send: async (message) => {
        sentEmails.push(message);
      },
    },
  );
  const webHandler = HttpRouter.toWebHandler(
    ServerAuthRoutes.pipe(
      Layer.provide(ServerAuthForTest(auth)),
      Layer.provide(HttpServer.layerServices),
    ),
  );
  handler = webHandler.handler;
  dispose = webHandler.dispose;
});

afterEach(async () => {
  await dispose?.();
  await testDb.client.close();
});

const request = (path: string, init?: RequestInit) =>
  handler(
    new Request(`http://localhost:3000${path}`, {
      ...init,
      headers: {
        origin,
        ...(init?.headers ?? {}),
      },
    }),
  );

test("mounts the Better Auth health endpoint", async () => {
  const response = await request("/api/auth/ok");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

test("signs in with a session cookie and resolves the session through the router", async () => {
  const signUp = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Auth Test",
      email,
      password,
      callbackURL: origin,
    }),
  });

  expect(signUp.status).toBe(200);
  expect(sentEmails).toHaveLength(1);
  expect(sentEmails[0]?.to).toBe(email);
  expect(sentEmails[0]?.text).toContain("/api/auth/verify-email");

  await testDb.db.update(user).set({ emailVerified: true }).where(eq(user.email, email));

  const signIn = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  expect(signIn.status).toBe(200);
  const cookies = signIn.headers.getSetCookie();
  expect(cookies.some((cookie) => cookie.startsWith("better-auth.session_token="))).toBe(true);

  const cookieHeader = cookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
  const session = await request("/api/auth/get-session", {
    headers: { cookie: cookieHeader },
  });

  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({ user: { email } });
});

test("round-trips multiple Set-Cookie headers without combining them", async () => {
  const headers = new Headers();
  headers.append("set-cookie", "first=value; Path=/; HttpOnly");
  headers.append("set-cookie", "second=value; Path=/; Secure");
  const response = HttpServerResponse.fromWeb(new Response(null, { headers }));
  const roundTrip = HttpServerResponse.toWeb(response);

  expect(roundTrip.headers.getSetCookie()).toEqual([
    "first=value; Path=/; HttpOnly",
    "second=value; Path=/; Secure",
  ]);
});
