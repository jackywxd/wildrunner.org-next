# 生产切换：Velite → Payload（手动部署）

首次切换手动执行，不走 Workers Builds 自动部署。

## 现在的状态

生产 `wildrunner.org` 跑的是**旧的 Velite 建置**：`/admin` 和 `/api/posts` 都
回 404，**完全不连 D1**，内容在建置时就烤进去了。

切换后 `wildrunner.org` 会开始读生产 D1（`wildrunner-org-next`），也就是说
**那个资料库里现在有什么，正式站就显示什么**。

Staging 已经是完全隔离的另一组资源，切换不会动到它。

---

## 步骤

### 1. 备份生产资料库

```bash
wrangler d1 export wildrunner-org-next --remote --output prod-backup-$(date +%Y%m%d).sql
```

回滚时要用。**先做这一步。**

### 2. 删掉测试帐号

`admin@wildrunner.test`、`member@wildrunner.test`、`member2@wildrunner.test`
的密码写在 `e2e/helpers/` 里，是公开的。生产不能留。

```bash
wrangler d1 execute wildrunner-org-next --remote --command "
  UPDATE users SET author_id = NULL WHERE email LIKE '%.test';
  DELETE FROM authors WHERE owner_id IN (SELECT id FROM users WHERE email LIKE '%.test');
  DELETE FROM users WHERE email LIKE '%.test';
"
```

> `users.author_id` 和 `authors.owner_id` 互相参照，直接 DELETE 会撞外键，
> 所以要先清 `author_id`。

e2e 不受影响：它现在跑在 staging 自己的资料库上，那边有各自的测试帐号。

### 3. 套用 migration（如果有 pending）

```bash
NODE_ENV=production pnpm payload migrate
```

> 不要依赖建置流程里的 `payload migrate`：`payload.config.ts` 依
> `NODE_ENV === 'production'` 决定要不要用远端 bindings，在 Workers Builds
> 容器里 `NODE_ENV` 是未设定的，会 migrate 容器内的本机资料库然后丢弃。

### 4. 检查

```bash
pnpm preflight:prod
```

必须全绿。它会对**真实的**生产 D1 检查 schema、`revalidations` 表、pending
migration、内容与 admin 帐号、残留测试帐号，以及建置环境变量。

### 5. 部署

```bash
pnpm deploy:prod
```

这条指令做三件事：

1. `build:prod` — 用生产的 `NEXT_PUBLIC_SITE_URL` / `R2_PUBLIC_URL` 建置，
   并把 `S3_*` 清空
2. `assert-no-secrets-in-bundle` — 确认 R2 写入凭证真的没进 bundle，
   有的话直接中止部署
3. `opennextjs-cloudflare deploy` — 部署到 `wildrunner-org-next`（不带
   `--env`，也就是生产）

**为什么要清 `S3_*`**：OpenNext 会把整个建置环境内嵌进 worker bundle
（`.open-next/cloudflare/next-env.mjs`）。本机 `.env.local` 里的 `S3_*` 是
R2 的**写入**凭证，只给离线的 Velite 用；不清掉就会躺在部署产物里。

**为什么 `NEXT_PUBLIC_SITE_URL` 不能错**：它同时决定 Payload 的 CSRF 允许
来源。设错不会报错，只会让后台所有写入被**静默拒绝**。

### 6. 验证

```bash
# 公开页面
curl -s -o /dev/null -w "%{http_code}\n" https://wildrunner.org
curl -s -o /dev/null -w "%{http_code}\n" https://wildrunner.org/posts
curl -s -o /dev/null -w "%{http_code}\n" https://wildrunner.org/gallery

# Payload 已上线的证据（切换前这两个是 404）
curl -s -o /dev/null -w "%{http_code}\n" https://wildrunner.org/admin
curl -s -o /dev/null -w "%{http_code}\n" https://wildrunner.org/api/posts

# 冒烟测试
PLAYWRIGHT_BASE_URL=https://wildrunner.org pnpm test:e2e --grep "P0-T2|P2-T8"
```

浏览器再确认一次：

1. 用 `xudong.wu@gmail.com` 登入 `/admin`（**不需要注册**——帐号已经在生产
   资料库里，密码用 pbkdf2 + 每人各自的 salt，与 `PAYLOAD_SECRET` 无关）
2. 首页 hero 是「心如野馬，馳騁天下」
3. 随便开一篇有内文图片的文章，图片正常显示
4. 相簿影片能播放（走 R2 原档，未使用 Stream）
5. 在后台改一篇文章并储存 —— 能存成功就代表 CSRF 设定正确

### 7. 之后才开自动部署

确认手动切换没问题后，再把 Workers Builds 接上 `main`。设定见
[workers-builds.md](workers-builds.md)，特别注意 **build variables 不能有
`S3_*`**。

---

## 回滚

内容和程式是分开的，先判断坏在哪一边。

**程式坏了** → Cloudflare Dashboard → Workers → `wildrunner-org-next` →
Deployments → 回滚到切换前那一版（Velite 版）。

**资料坏了** → 用步骤 1 的备份还原：

```bash
wrangler d1 execute wildrunner-org-next --remote --file prod-backup-YYYYMMDD.sql
```

> 注意 `d1 export` 产出的 SQL **不是可直接汇入的顺序**：INSERT 会出现在对应
> 的表建立之前，而且 `users` ↔ `authors` 是循环外键。要重建到空资料库的话，
> 参考建 staging 时的做法（先建表、再依相依顺序插入、`users.author_id` 留
> 空最后用 UPDATE 补）。

---

## 已知限制

- **Cloudflare Stream 未使用**：影片直接从 R2 播放（支援 range request，
  可拖曳）。要改用 Stream 需先购买容量，然后 `STREAM_INGEST=true` 加
  `pnpm migrate:velite -- --remote --with-stream`。
- **AI 限流的 60 秒视窗无法端对端测试**：真实 Workers AI 一次呼叫约 10 秒，
  11 次连续呼叫超过视窗长度。本机 stub 有完整验证。
