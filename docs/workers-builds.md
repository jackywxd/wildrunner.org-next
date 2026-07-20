# Cloudflare Workers Builds

生产站点已上线：**https://wildrunner.org**（Worker `wildrunner-org-next`）。

将本仓库接到 Cloudflare 可实现 Git 推送自动部署。

**Workers & Pages → 连接 Git → `jackywxd/wildrunner.org-next`**

## Build settings

| Setting | Value |
|---------|--------|
| Production branch | `main`（或先合并当前功能分支） |
| Build command | `pnpm exec opennextjs-cloudflare build` |
| Deploy command | `pnpm exec opennextjs-cloudflare deploy` |
| Root directory | `/` |
| Node version | `22` 或 `24` |

Install（可选）：`pnpm install --frozen-lockfile`

## Build variables / secrets

| Name | Type | Notes |
|------|------|--------|
| `NEXT_PUBLIC_SITE_URL` | Plaintext | `https://wildrunner.org` |
| `NEXT_PUBLIC_ENV` | Plaintext | `production` |
| `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN` | Secret | 可选 |
| `R2_PUBLIC_URL` | Plaintext | `https://images.wildrunner.org` |
| `S3_ENDPOINT` | Secret | R2 S3 API（仅当 CI 跑 Velite） |
| `S3_ACCESS_KEY_ID` | Secret | |
| `S3_SECRET_ACCESS_KEY` | Secret | |
| `S3_BUCKET` | Plaintext | 媒体桶 |

> 默认 `pnpm build` **不**跑 Velite。CI 若需重建内容：  
> `pnpm content && pnpm exec opennextjs-cloudflare build`（并配置 `S3_*`）。

## 已配置资源

| 资源 | 名称 |
|------|------|
| Worker | `wildrunner-org-next` |
| Routes | `wildrunner.org/*`、`www.wildrunner.org/*` |
| R2 cache | `wildrunner-org-next-opennext-cache` |
| R2 media | 现有桶 + `images.wildrunner.org` |
| Images | `IMAGES` binding |

## 本机部署

```bash
nvm use 24
export NEXT_PUBLIC_SITE_URL=https://wildrunner.org
export NEXT_PUBLIC_ENV=production
export R2_PUBLIC_URL=https://images.wildrunner.org
pnpm deploy
```
