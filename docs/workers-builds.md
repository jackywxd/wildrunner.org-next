# Cloudflare Workers Builds

Connect this repo in the Cloudflare dashboard:

**Workers & Pages → Create → Connect to Git → `jackywxd/wildrunner.org-next`**

## Build settings

| Setting | Value |
|---------|--------|
| Production branch | `main` (or merge this feature branch first) |
| Build command | `pnpm exec opennextjs-cloudflare build` |
| Deploy command | `pnpm exec opennextjs-cloudflare deploy` |
| Root directory | `/` |
| Node version | `22` or `24` |

Install command (optional override): `pnpm install --frozen-lockfile`

## Build variables / secrets

Set under **Settings → Build → Variables and secrets**:

| Name | Type | Notes |
|------|------|--------|
| `NEXT_PUBLIC_SITE_URL` | Plaintext | e.g. `https://wildrunner.org` |
| `NEXT_PUBLIC_ENV` | Plaintext | `production` |
| `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN` | Secret | Optional Web Analytics token |
| `R2_PUBLIC_URL` | Plaintext | `https://images.wildrunner.org` |
| `S3_ENDPOINT` | Secret | R2 S3 API endpoint |
| `S3_ACCESS_KEY_ID` | Secret | R2 access key |
| `S3_SECRET_ACCESS_KEY` | Secret | R2 secret |
| `S3_BUCKET` | Plaintext | Media bucket name |

> `pnpm build` does **not** run Velite. Commit a fresh `.velite` locally after `pnpm content`, **or** change the build command to `pnpm content && pnpm exec opennextjs-cloudflare build` once media + R2 secrets are available in CI.

## One-time account setup

```bash
# Node >= 22
nvm use 24
pnpm exec wrangler r2 bucket create wildrunner-org-next-opennext-cache
pnpm deploy   # first deploy to *.workers.dev
```

## Custom domain

After workers.dev works:

1. Cloudflare Dashboard → Worker `wildrunner-org-next` → **Domains & Routes**
2. Add `wildrunner.org` and `www.wildrunner.org`
3. Point DNS (proxied) to the Worker; retire Docker/Traefik on the old host

Do **not** cut over production DNS until staging (`*.workers.dev`) is verified.
