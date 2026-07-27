# Payload CMS on Cloudflare (D1 + R2 + Images/Stream + Workers AI)

## Bindings (`wrangler.jsonc`)

| Binding | Resource |
|---------|----------|
| `D1` | D1 database `wildrunner-org-next` |
| `R2` | Media originals bucket `wildrunner-storage` (CDN: `images.wildrunner.org`) |
| `NEXT_INC_CACHE_R2_BUCKET` | OpenNext ISR cache |
| `IMAGES` | Cloudflare Images optimization for `next/image` |
| `STREAM` | Cloudflare Stream ingest / playback metadata |
| `AI` | Workers AI (article assist) |
| `ASSETS` / `WORKER_SELF_REFERENCE` | OpenNext |

Assert locally: `pnpm assert:bindings`.

## Local env

```bash
cp .env.example .env.local
# set PAYLOAD_SECRET=$(openssl rand -hex 32)
cp .dev.vars.example .dev.vars
```

## Scripts

```bash
pnpm install
pnpm generate:types
pnpm generate:importmap
pnpm payload migrate
pnpm migrate:velite:dry
pnpm migrate:velite           # local D1/R2
pnpm migrate:velite:remote    # production D1/R2 + STREAM ingest
pnpm dev
pnpm test:e2e
pnpm assert:lfs
```

## Media rules

- Images: originals in R2; public UI must use `next/image` (`/_next/image` + `IMAGES`).
- Videos: originals in R2; public playback uses Cloudflare Stream iframe once `streamId` + `streamReady`.
- While Stream is processing (or missing), UI shows processing state — **no production R2 mp4 fallback**.
- Social crawlers may use original CDN URLs for OG images (documented exception).

## AI assist

- API: authenticated `POST /api/ai/expand-post`
- Admin: Posts edit form includes **AI 完善文章** (`src/components/admin/AIAssistField.tsx`)
- Never auto-publishes; D1-backed rate limit (`ai_rate_limits`)

## CI / Workers Builds

- GitHub Actions: bindings + LFS policy + D1 migrate + Playwright + OpenNext build
- Workers Builds: `pnpm payload migrate && opennextjs-cloudflare build` — **no Velite, no Git LFS**
- Details: [`docs/workers-builds.md`](workers-builds.md), [`docs/payload-testing.md`](payload-testing.md)

## Cutover checklist

1. Run remote migrate once (`pnpm migrate:velite:remote`) and review `reports/payload-migration.json`.
2. Confirm Stream pending list is empty or documented for retry.
3. Point Workers Builds build command to migrate + OpenNext (see workers-builds.md).
4. Merge `feat/payload-cms-migration` → `main` after Playwright green.
5. Keep Velite scripts only as offline tools; public site must not import `#site/content`.
