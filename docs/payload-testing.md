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

Every path this table used to list (`e2e/smoke.spec.ts`, `e2e/access.spec.ts`,
`e2e/public/`, `e2e/media/`, `e2e/ai/`) had been deleted, and the table was
left describing a suite that no longer existed. What is actually there:

| Path | Level | Runs where |
|------|-------|------------|
| `e2e/unit/` | pure functions, no server or database | `checks` job, `pnpm test:unit`, ~6s |
| `e2e/journeys/` | one test per use case, browser + database | `e2e` job, 3 shards, each with its own local D1 |
| `e2e/corpus/` | assertions about the data that is actually there | same shards |
| `e2e/deployed/` | is the deployment wired up and alive | `verify-staging` after a deploy, `pnpm test:smoke` |

`e2e/deployed/` is deliberately six checks and not the whole suite —
`docs/release-pipeline.md` has the run-history numbers behind that, and
`docs/testing-strategy.md` §4 has the rules for what may be added to it.

## Traces

`trace: retain-on-failure`. Failed CI uploads `playwright-report/` and `test-results/`.

## Staging / production smoke

```bash
PLAYWRIGHT_BASE_URL=https://wildrunner.org pnpm test:e2e --grep "P0-T2|P2-T8"
```
