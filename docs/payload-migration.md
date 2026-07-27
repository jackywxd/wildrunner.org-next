# Payload CMS on Cloudflare (D1 + R2 + Workers AI)

Phase 0+ scaffold notes. Full migration plan lives in the Cursor plan file.

## Bindings (`wrangler.jsonc`)

| Binding | Resource |
|---------|----------|
| `D1` | D1 database `wildrunner-org-next` |
| `R2` | Media originals bucket `wildrunner-storage` (public CDN: `images.wildrunner.org`) |
| `NEXT_INC_CACHE_R2_BUCKET` | OpenNext ISR cache |
| `IMAGES` | Cloudflare Images optimization for `next/image` |
| `AI` | Workers AI (article assist) |
| `ASSETS` / `WORKER_SELF_REFERENCE` | OpenNext |

## Local env

Copy and fill:

```bash
# .env.local
PAYLOAD_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ENV=development
R2_PUBLIC_URL=https://images.wildrunner.org
```

Existing Velite `S3_*` vars remain for legacy `pnpm content` until Phase 7 cutover.

## Scripts

```bash
pnpm install
pnpm generate:types        # Cloudflare + Payload types
pnpm generate:importmap
pnpm payload migrate       # apply D1 migrations (uses wrangler proxy)
pnpm dev                   # site + /admin
pnpm test:e2e              # Playwright gate
```

## CI / Workers Builds

- **Do not enable Git LFS** in Workers Builds (media lives in R2).
- Set `GIT_LFS_SKIP_SMUDGE=1` if clone still tries LFS.
- Playwright runs via GitHub Actions (`.github/workflows/e2e.yml`), separate from Workers Builds.
- Workers Builds still must not run Velite; after cutover it runs OpenNext + D1 migrate only.

## Media strategy (later phases)

- Images: R2 original → Cloudflare `IMAGES` / `next/image`
- Videos: R2 original → Cloudflare Stream playback
