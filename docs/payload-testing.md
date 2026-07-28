# Payload E2E testing

## Local

```bash
cp .env.example .env.local   # PAYLOAD_SECRET required
pnpm payload migrate
pnpm migrate:velite:dry
pnpm test:e2e
# or
pnpm test:e2e:ui
```

`playwright.config.ts` starts `NEXTJS_ENV=test pnpm dev` so AI tests use a deterministic expand stub.

## Accounts

Set `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` optionally. Defaults live in `e2e/helpers/auth.ts` for local/CI only — never use them in production.

## CSRF and the Origin header

Payload only honours the auth cookie when a request carries `Origin` (matching
`serverURL`) or `Sec-Fetch-Site`; anything else is treated as a non-browser
client and authenticates as nobody — a silent 403 on every write, not an auth
error. Browsers always send one of the two, `APIRequestContext` sends neither,
so `playwright.config.ts` sets `Origin` explicitly. Request contexts built by
hand (`request.newContext()`) do **not** inherit it — use the helpers in
`e2e/helpers/members.ts`.

This means `PLAYWRIGHT_BASE_URL` must match the target's `serverURL`
(`NEXT_PUBLIC_SITE_URL` at build time), or every authenticated test fails.

## Suites

| Path | Covers |
|------|--------|
| `e2e/smoke.spec.ts` | P0 home/admin smoke |
| `e2e/scaffold.spec.ts` | P0 bindings/branch + P3 dry-run/LFS docs |
| `e2e/access.spec.ts` / `e2e/admin-auth.spec.ts` | P1 auth/access |
| `e2e/admin/media-gallery.spec.ts` | P1 upload + global hero |
| `e2e/public/*` | P2 publish visibility / revalidate / og |
| `e2e/media/*` | P2 Images + P5 gallery/Stream |
| `e2e/ai/*` | P4 AI API + Admin UI |

## Traces

`trace: retain-on-failure`. Failed CI uploads `playwright-report/` and `test-results/`.

## Staging / production smoke

```bash
PLAYWRIGHT_BASE_URL=https://wildrunner.org pnpm test:e2e --grep "P0-T2|P2-T8"
```
