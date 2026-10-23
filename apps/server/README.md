# @sync-disc server

## Development

```bash
vp install
pnpm --filter @sync-disc/db migrations:apply:server
```

The server reads `DATABASE_URL`, defaulting to
`postgres://postgres:password@localhost:54321/electric`.

Enable sync requests by setting `SYNC_DEV_TOKEN`:

```bash
SYNC_DEV_TOKEN=dev-token pnpm --filter server dev
```

`GET /health` does not require the token. If `SYNC_DEV_TOKEN` is unset, every
sync request is unauthorized. The server refuses to start if the token is set
while `NODE_ENV=production`.

This token is a temporary Phase 4 development gate and is replaced by Better
Auth in Phase 8.
