Cloudflare 迁移计划（输出至 PLAN.md）

现状结论

现有仓库 [wildrunner.org](/Users/jackywxd/repos/wildrunner.org) 是「野馬營」跑步博客：





运行时几乎无后端：无 DB / Auth / API / Cron；唯一动态路由是已标 edge 的 [src/app/og/route.tsx](src/app/og/route.tsx)



内容：Velite + MDX（约 15 文、14 相册），src/content ~1.4GB（Git LFS）



媒体：构建期 sharp / HEIC → WebP，经 S3 API 上传 Cloudflare R2（images.wildrunner.org）



生产：Docker Node + Traefik（ACME 已用 Cloudflare DNS）



分析：PostHog（非 CF）

迁移本质是：应用运行时从自托管 Node 迁到 Cloudflare Workers；媒体与 DNS 已部分在 CF 上。

目标架构（已选定）

在兄弟目录创建新项目：










应用托管



Workers + Workers Static Assets + @opennextjs/cloudflare





框架



Next.js 15 App Router（官方 [create cloudflare --framework=next](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)）





媒体存储



沿用 R2 + 自定义域 images.wildrunner.org





运行时图片



OpenNext 的 /_next/image，或逐步切到 Cloudflare Images / Image Resizing





构建/CI



Workers Builds（Git 推送构建；Node 构建期跑 Velite + sharp）





DNS/TLS



Cloudflare Proxy + Universal SSL（替代 Traefik）





分析



Cloudflare Web Analytics 或 Zaraz（替代 PostHog，符合「仅 CF 栈」）





观测



Workers Observability





本地预览



wrangler / opennextjs-cloudflare preview（workerd）

不引入：D1、KV（除非后续做 ISR 缓存）、Durable Objects、Queues、Docker、Traefik、SMTP、第三方 CMS。

flowchart TB
  subgraph build [Build Node CI Workers Builds]
    Content[src/content MDX LFS]
    Velite[Velite + sharp HEIC]
    R2Up[Upload to R2]
    OpenNext[OpenNext build]
    Content --> Velite --> R2Up
    Velite --> OpenNext
  end
  subgraph edge [Cloudflare Edge]
    Worker[Workers OpenNext]
    Assets[Static Assets]
    R2[(R2 images.wildrunner.org)]
    Worker --> Assets
    Worker --> R2
  end
  OpenNext --> Worker
  R2Up --> R2
  User[Visitor] --> Worker

执行交付物（本阶段）

用户当前要求是制訂计划并写入 PLAN.md。批准后将：





创建目录 /Users/jackywxd/repos/wildrunner.org-next



写入详尽的 [PLAN.md](/Users/jackywxd/repos/wildrunner.org-next/PLAN.md)（中文），作为后续实施唯一依据

PLAN.md 将包含下文全部章节（审计摘要、目标栈、目录规划、分阶段任务、风险、验收、回滚）。



PLAN.md 拟定目录结构

1. 背景与目标





从 Docker/Traefik 迁到纯 Cloudflare



新仓独立于旧仓，便于并行与回滚



功能对等：首页 / posts / gallery / about / OG / SEO

2. 现有系统审计（摘要）





路由表、Velite collections、构建管线、veliteUtils R2 上传、env 清单、无 DB/Auth 事实



关键路径引用旧仓文件，便于迁移对照

3. 目标技术栈与职责边界

运行时（Workers）





OpenNext Worker 服务 SSG 页面 + /og



Static Assets 托管 JS/CSS/字体



图片优先直链 R2 CDN；next/image 由 OpenNext 提供

构建时（Node，Workers Builds）





保留 Velite + sharp + heic-convert + @aws-sdk/client-s3（或逐步改为 R2 binding / Wrangler R2 上传脚本）



禁止把 sharp/HEIC 放进 Workers 运行时

基础设施





复用现有 R2 bucket 与公开 URL



Custom Domain：wildrunner.org / www 绑 Workers



构建密钥：R2 凭据、NEXT_PUBLIC_* 放入 Workers Builds secrets

4. 新项目目录规划（wildrunner.org-next）

wildrunner.org-next/
  PLAN.md                 # 本计划
  README.md
  package.json            # next + @opennextjs/cloudflare + wrangler + velite...
  wrangler.jsonc          # main=.open-next/worker.js, assets, nodejs_compat, observability
  open-next.config.ts
  next.config.ts          # 去掉 Docker standalone 假设；保留 remotePatterns；接 OpenNext
  velite.config.ts        # 从旧仓移植
  src/                    # 从旧仓移植 app/components/lib/content...
  .env.example            # 仅 CF/R2/站点 URL，无 SMTP

内容策略：首期 Git submodule 或拷贝 src/content（含 LFS）；中期可考虑媒体仅存 R2、仓库只留 MDX 元数据以缩小 clone。

5. 分阶段实施（写入 PLAN.md 的可执行清单）

Phase 0 — 脚手架（已完成 2026-07-20）

- 使用 create-next-app@15 + `npx @opennextjs/cloudflare migrate` 完成脚手架
- 已配置 wrangler.jsonc（nodejs_compat、ASSETS、IMAGES、R2 incremental cache、observability）
- 已配置 open-next.config.ts、.dev.vars、public/_headers
- 本地验证：`opennextjs-cloudflare build` 成功；`preview` 在 http://localhost:8787 返回 200
- Worker 名：`wildrunner-org-next`；部署到 *.workers.dev 需账号登录后执行 `pnpm deploy`
- 备注：OpenNext 生产 build 勿用 `--turbopack`；pnpm 需 allow `esbuild`/`workerd`/`sharp` 构建脚本

Phase 1 — 代码与内容迁移





移植 src/app、src/components、src/lib、src/store、src/config、src/styles、src/assets、public/locales



移植 velite.config.ts + veliteUtils.ts；构建钩子改为与 OpenNext 兼容（Velite 在 next build / OpenNext build 前显式 velite build，避免仅依赖 Webpack 插件）



内容与 LFS：文档化 git lfs pull 与构建内存（≥8GB）



清理：axios/cheerio/SMTP、空 src/routes、未使用 about.mdx 决策

Phase 2 — Cloudflare 适配





/og 在 workerd 下验证字体与 ImageResponse



next/image + R2 remotePatterns；meta 中硬编码 /_next/image 的路径做兼容测试



MDX new Function 在 Workers 下验证



用 Cloudflare Web Analytics 替换 PostHog provider



可选：R2 binding + remote bindings 便于本地连生产桶

Phase 3 — CI/CD 与域名





Workers Builds：install → LFS pull → velite/build/deploy；配置 build secrets



自定义域切流：先 staging Worker 子域验收 → 再切 wildrunner.org DNS



停用 Docker/Traefik 生产（旧仓保留只读备份）

Phase 4 — 优化（非阻塞上线）





增量图片上传（已有 HeadObject 去重，强化 CI 缓存）



评估 Cloudflare Images 替代运行时优化



内容仓瘦身：原图只存 R2，Git 仅 MDX

6. 环境变量映射







旧



新





S3_* / R2_PUBLIC_URL



构建 secrets（同义或改名 R2_*）





NEXT_PUBLIC_SITE_URL



Workers / Builds





NEXT_PUBLIC_POSTHOG_*



删除 → Web Analytics token





SMTP_* / Traefik DNS token



删除（DNS 在 CF Dashboard）

7. 风险与缓解







风险



缓解





1.4GB LFS 导致 Builds 超时/磁盘不足



LFS 缓存、媒体外置、分阶段上传





sharp 构建内存



NODE_OPTIONS=--max-old-space-size=8192





OpenNext 与 Velite Webpack 插件冲突



显式 prebuild velite，弱化 webpack 钩子





/_next/image / OG 边缘差异



Phase 2 pnpm preview 清单验收





域名切换短暂中断



先 workers.dev 与预览域并行

8. 验收标准





全部现有路由 SSG 可访问，相册/文章图片来自 R2



/og?title=... 返回正确图片



wrangler/Workers Builds 一键部署成功



无 Docker 依赖；分析走 CF



Lighthouse / 基本 SEO meta 不回归

9. 回滚





DNS 切回旧 Traefik 源站；wildrunner.org-next 与旧仓并存直至稳定



本回合（批准后）最小动作

仅创建 wildrunner.org-next/PLAN.md（完整中文文档，含上述全部细节与文件对照表）。不在本阶段实施代码迁移，除非你追加要求开始 Phase 0。
