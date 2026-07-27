# Cloudflare Workers Builds

生产站点已上线：**https://wildrunner.org**（Worker `wildrunner-org-next`）。

将本仓库接到 Cloudflare 可实现 Git 推送自动部署。

**Workers & Pages → 连接 Git → `jackywxd/wildrunner.org-next`**

## 架构说明（重要）

**Workers Builds 不跑 Velite，也不启用 Git LFS。**

- `src/content` 含约 **11GB** 原始图片/视频（Git LFS）。CI 无法可靠 checkout 与处理。
- 媒体处理与 R2 上传只在本机执行：`pnpm content`（需要 `.env.local` 里的 `S3_*`）。
- 生成物 [`.velite/`](../.velite/)（约数百 KB JSON）**已纳入 Git**；构建直接消费这些文件里的 R2 URL。

```text
本机: pnpm content → commit .velite/ + MDX
  → push main
  → Workers Builds: install → OpenNext build → patch headers → deploy
```

## Build settings

| Setting | Value |
|---------|--------|
| Production branch | `main` |
| Git LFS | **关闭**（不要勾选） |
| Build command | `pnpm exec opennextjs-cloudflare build && node scripts/patch-assets-headers.mjs` |
| Deploy command | `pnpm exec opennextjs-cloudflare deploy` |
| Root directory | `/` |
| Node version | `22` 或 `24` |

Install（可选）：`pnpm install --frozen-lockfile`

> 不要在 Build command 里加 `pnpm content`。不要配置 `S3_*` 给 Workers Builds。

## Build variables

| Name | Type | Notes |
|------|------|--------|
| `NEXT_PUBLIC_SITE_URL` | Plaintext | `https://wildrunner.org` |
| `NEXT_PUBLIC_ENV` | Plaintext | `production` |
| `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN` | Secret | 可选 |
| `R2_PUBLIC_URL` | Plaintext | `https://images.wildrunner.org` |
| `PAYLOAD_SECRET` | Secret | Payload CMS（`feat/payload-cms-migration` 起需要） |
| `GIT_LFS_SKIP_SMUDGE` | Plaintext | `1`（若 clone 仍尝试 LFS） |

`S3_*` **仅本机** `pnpm content` 需要，见 [`.env.example`](../.env.example)。

Payload / D1 / R2 / Playwright 细节见 [`docs/payload-migration.md`](payload-migration.md)。

## 已配置资源

| 资源 | 名称 |
|------|------|
| Worker | `wildrunner-org-next` |
| Routes | `wildrunner.org/*`、`www.wildrunner.org/*` |
| R2 cache | `wildrunner-org-next-opennext-cache` |
| R2 media | 现有桶 + `images.wildrunner.org` |
| Images | `IMAGES` binding |

## 本机：内容变更后发布

```bash
nvm use 24
# .env.local 需含 R2_PUBLIC_URL + S3_*
git lfs pull                 # 仅本机需要完整媒体
pnpm content                 # 上传新媒体到 R2，刷新 .velite/
git add .velite src/content
git commit -m "content: update"
git push origin main         # 触发 Workers Builds 自动部署
```

## 本机：仅代码变更（无新媒体）

```bash
nvm use 24
export NEXT_PUBLIC_SITE_URL=https://wildrunner.org
export NEXT_PUBLIC_ENV=production
export R2_PUBLIC_URL=https://images.wildrunner.org
pnpm deploy                  # 或 push main 走 CI
```

## 验证清单

1. Dashboard 已连接 `jackywxd/wildrunner.org-next`，生产分支 `main`，**Git LFS 关闭**。
2. push 到 `main` 后 Builds 成功（无 Velite / 无 LFS checkout）。
3. 线上：`https://wildrunner.org`、一篇文章、一个相册、`/og?title=test` 返回 200。
