# Content

MDX/JSON 文稿与原始图片、视频均存放于此，由 Git LFS 跟踪媒体文件。

- 构建：`pnpm content`（Velite）读取本地媒体 → WebP → 上传 Cloudflare R2
- 运行时：站点从 `images.wildrunner.org`（R2）拉图；本目录供作者编辑与增量构建
- LFS 规则见仓库根目录 `.gitattributes`
