# Cloudflare Workers Builds

生产站点已上线：**https://wildrunner.org**（Worker `wildrunner-org-next`）。

将本仓库接到 Cloudflare 可实现 Git 推送自动部署。

**Workers & Pages → 连接 Git → `jackywxd/wildrunner.org-next`**

## 架构说明（重要）

**Workers Builds 不跑 Velite，也不启用 Git LFS。**

- 公开内容由 **Payload CMS + D1** 提供；媒体原件在 **R2**；图片经 `IMAGES`；视频经 `STREAM`。
- 历史 `src/content` / Git LFS 媒体仅作离线迁移源，不参与 CI checkout。
- 构建前先对 D1 执行 Payload migrations。

```text
push main
  → Workers Builds:
      pnpm install
      → pnpm payload migrate
      → OpenNext build
      → patch headers
      → deploy
```

首次/全量内容导入在本机或受控环境执行：

```bash
pnpm migrate:velite:dry
pnpm migrate:velite:remote   # 写入远端 D1/R2，并触发 Stream ingest
```

## Build settings

| Setting | Value |
|---------|--------|
| Production branch | `main` |
| Git LFS | **关闭**（不要勾选） |
| Build command | `pnpm payload migrate && pnpm exec opennextjs-cloudflare build && node scripts/patch-assets-headers.mjs` |
| Deploy command | `pnpm exec opennextjs-cloudflare deploy` |
| Root directory | `/` |
| Node version | `22` 或 `24` |

Install（可选）：`pnpm install --frozen-lockfile`

> 不要在 Build command 里加 `pnpm content` / Velite。不要配置 `S3_*` 给 Workers Builds。

## Build variables / secrets

| Name | Type | Notes |
|------|------|--------|
| `NEXT_PUBLIC_SITE_URL` | Plaintext | `https://wildrunner.org` |
| `NEXT_PUBLIC_ENV` | Plaintext | `production` |
| `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN` | Secret | 可选 |
| `NEXT_PUBLIC_CF_STREAM_CUSTOMER_CODE` | Plaintext | 可选，自定义 Stream 播放域 |
| `R2_PUBLIC_URL` | Plaintext | `https://images.wildrunner.org` |
| `PAYLOAD_SECRET` | Secret | **必需** |
| `GIT_LFS_SKIP_SMUDGE` | Plaintext | `1`（若 clone 仍尝试 LFS） |

Bindings 由 `wrangler.jsonc` 提供：`D1`、`R2`、`IMAGES`、`STREAM`、`AI`。

## 已配置资源

| 资源 | 名称 |
|------|------|
| Worker | `wildrunner-org-next` |
| Routes | `wildrunner.org/*`、`www.wildrunner.org/*` |
| D1 | `wildrunner-org-next` |
| R2 cache | `wildrunner-org-next-opennext-cache` |
| R2 media | `wildrunner-storage` + `images.wildrunner.org` |
| Images | `IMAGES` binding |
| Stream | `STREAM` binding |
| Workers AI | `AI` binding |

## 本机：内容变更（Payload）

```bash
nvm use 24
pnpm payload migrate
pnpm migrate:velite:dry     # 迁移脚本计数校验
# 或在 /admin 直接发文 / 建相册 / 上传媒体
pnpm deploy                 # 或 push main 走 Workers Builds
```

## 回滚预案

1. Cloudflare Dashboard → Workers → Deployments → 回滚到上一 Worker 版本。
2. D1：部署前用 `wrangler d1 export wildrunner-org-next --remote --output backup.sql` 备份。
3. 若内容迁移异常，可重新跑幂等 `pnpm migrate:velite:remote`（已存在 slug 会跳过）。

## 验证清单

1. Dashboard 已连接仓库，生产分支 `main`，**Git LFS 关闭**。
2. push 到 `main` 后 Builds 成功（含 `payload migrate`，无 Velite / 无 LFS checkout）。
3. 线上：首页、文章、相册、视频页（Stream）、`/og?title=test`、`/admin` 登录。
4. Playwright：`PLAYWRIGHT_BASE_URL=https://wildrunner.org pnpm test:e2e`（冒烟）通过。
