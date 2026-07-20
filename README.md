# wildrunner.org-next

野馬營（Wild Runner）— Cloudflare Workers / OpenNext 迁移版。

## 技术栈

- Next.js 15 + React 19 + Velite MDX
- [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) → Cloudflare Workers
- R2（媒体，构建期上传）+ Tailwind 3 / shadcn

详见 [PLAN.md](./PLAN.md)。

## 开发

```bash
pnpm install
cp .env.example .env.local   # 填入 R2 与 NEXT_PUBLIC_SITE_URL
# src/content 为文本文档（md/mdx/json）；原图在旧仓 / R2
# 首次或内容变更后若需重建 .velite（需本地媒体 + R2 凭证）：
#   将媒体拷入 src/content 后执行 pnpm content
pnpm content   # 可选；仓库已含可用的 .velite 时可跳过
pnpm dev       # Next.js Turbopack 本地开发
pnpm preview   # workerd 预览
pnpm deploy    # 部署到 Cloudflare Workers
```

## 脚本说明

| 命令 | 作用 |
|------|------|
| `pnpm content` | 仅跑 Velite（图片处理 + R2） |
| `pnpm build` | `next build`（期望已有 `.velite`） |
| `pnpm build:content` | Velite + Next 完整构建 |
| `pnpm preview` / `deploy` | OpenNext → Workers |

## 当前进度

- Phase 0：脚手架 ✓
- Phase 1：源码/Velite 移植 ✓
- Phase 2：OG / Images / Web Analytics ✓
- Phase 3：Workers Builds 文档 ✓（DNS 切流需人工确认）

详见 [docs/workers-builds.md](docs/workers-builds.md)。

## Phase 2 说明

- OG 字体：`public/fonts/Inter-Regular.ttf`
- Web Analytics：在 `.env.local` / Workers 环境变量设置 `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN`
- preview / deploy 需要 **Node.js ≥ 22**（`nvm use 24`）
