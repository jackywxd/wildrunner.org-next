# wildrunner.org-next

野馬營（Wild Runner）站点的 Cloudflare 迁移版。

## 技术栈

- Next.js 15 + React 19
- [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) → Cloudflare Workers
- Wrangler + Workers Static Assets
- 计划：Velite 内容层、R2 媒体、Cloudflare Web Analytics（详见 [PLAN.md](./PLAN.md)）

## 开发

```bash
pnpm install
pnpm dev          # Next.js 本地开发（Node）
pnpm preview      # 构建并在 workerd 中预览（接近生产）
pnpm deploy       # 部署到 Cloudflare Workers
```

## Phase 0 状态

脚手架已就绪：空站可 `preview` / `deploy`。下一阶段移植旧仓源码与 Velite 内容管线。
