# @sync-disc server

## Development

```bash
vp install
pnpm --filter @sync-disc/db migrations:apply:server
pnpm --filter server dev
pnpm --filter web start
```

The server reads `DATABASE_URL`, defaulting to
`******localhost:54321/electric`. The web dev server proxies `/api` to port
3000, so Better Auth cookies remain same-origin in local development.

The development auth secret has a local-only fallback. In production, set
`BETTER_AUTH_SECRET` to a random value of at least 32 characters,
`BETTER_AUTH_URL` to the HTTPS server URL, and
`BETTER_AUTH_TRUSTED_ORIGINS` to a comma-separated list of explicit HTTPS
browser origins. Wildcard origins and the development fallback secret are
rejected at startup.

Verification and password-reset messages use SMTP. Set `SMTP_HOST` and
`SMTP_FROM`; set `SMTP_PORT` when it is not 587, and configure
`SMTP_USERNAME`/`SMTP_PASSWORD` together when the server requires credentials.
Production startup requires SMTP host and sender configuration. In development,
mail actions return an error when SMTP is not configured.

The browser stores PGlite data in a separate IndexedDB partition for each
authenticated account. Signing out does not delete pending changes; resetting
local data only removes the active account's partition. Existing server
workspaces without an owner remain inaccessible and are never automatically
adopted.
