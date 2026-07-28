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
      → pnpm payload migrate     ← 见下方警告
      → OpenNext build
      → patch headers
      → deploy
```

> ⚠️ **build 里的 `pnpm payload migrate` 不会写到生产 D1。**
> `payload.config.ts` 依 `NODE_ENV === 'production'` 决定要不要用远端
> bindings，而 Workers Builds 容器里 `NODE_ENV` 是未设定的，所以它会写进
> 容器内的本机模拟资料库然后随容器销毁。
>
> 目前靠 D1 adapter 的 `prodMigrations` 兜底：worker 在第一个请求时自己套用
> migration。可以运作，但把 schema 变更推迟到了线上流量之后。
>
> **合并前请先在本机套用**：
> ```bash
> NODE_ENV=production pnpm payload migrate
> ```
> `pnpm preflight:prod` 会验证没有 pending migration。

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
| `RESEND_API_KEY` | Secret | 邀请信；未设定时邀请端点改回传连结让管理员手动传送 |
| `RESEND_FROM_ADDRESS` | Plaintext | `noreply@wildrunner.org` |
| `RESEND_FROM_NAME` | Plaintext | `野馬營` |

Bindings 由 `wrangler.jsonc` 提供：`D1`、`NEXT_TAG_CACHE_D1`、`R2`、
`NEXT_INC_CACHE_R2_BUCKET`、`IMAGES`、`STREAM`、`AI`。

### 为什么这些是 build 变量而不是 Worker secret

OpenNext 会把**整个 build 环境内嵌进 worker bundle**
（`.open-next/cloudflare/next-env.mjs`）。所以：

- 上表的变量必须设在 Workers Builds 的 **Build variables**，设成 Worker
  runtime secret 没有用（build 时读不到）。
- 反过来：**任何**出现在 build 环境里的变量都会被打包进部署产物。
  `S3_*` 是 R2 的写入凭证，**绝对不要**设给 Workers Builds——它们只在本机
  跑 Velite 时需要。`pnpm preflight:prod` 会检查这一项。
- `NEXT_PUBLIC_SITE_URL` 设错不会报错，只会让 Payload 的 CSRF 允许来源对不
  上，后台所有写入被**静默拒绝**。

## 已配置资源

| 资源 | 名称 |
|------|------|
| Worker | `wildrunner-org-next` |
| Routes | `wildrunner.org/*`、`www.wildrunner.org/*` |
| D1 | `wildrunner-org-next` |
| R2 cache | `wildrunner-org-next-opennext-cache` |
| R2 media | `wildrunner-storage` + `images.wildrunner.org` |

Staging 是**完全隔离**的另一组资源（`wildrunner-org-next-staging` D1、
`wildrunner-storage-staging`、`...-opennext-cache-staging`），部署用
`pnpm deploy:staging`。两边曾经共用同一个资料库，代价是 e2e 覆写过线上首页
标题、清理脚本删掉过线上内容依赖的 media。
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

## 合并前检查

```bash
pnpm preflight:prod
```

会对**真实的**生产 D1（`wrangler d1 execute --remote`，不经 platform proxy——
顶层 bindings 没有标 `remote: true`，用 proxy 会静默读到本机模拟库）检查：
schema、`revalidations` 表、pending migration、内容与 admin 帐号存在、
没有残留 `.test` 测试帐号、以及 build 环境变量是否正确。

## 验证清单

1. Dashboard 已连接仓库，生产分支 `main`，**Git LFS 关闭**。
2. push 到 `main` 后 Builds 成功（含 `payload migrate`，无 Velite / 无 LFS checkout）。
3. 线上：首页、文章、相册、视频页（Stream）、`/og?title=test`、`/admin` 登录。
4. Playwright：`PLAYWRIGHT_BASE_URL=https://wildrunner.org pnpm test:e2e`（冒烟）通过。
