# 發布流程（trunk-based + 投產閘門）

`main` 是唯一的長期分支。

```text
feature branch
  → PR ──────────────► e2e.yml：typecheck + 本機測試套件 + OpenNext build
  → review + merge                    （閘門在 merge 之前）
        │
        ▼
  push main → deploy.yml
      1. staging          部署 staging Worker
      2. verify-staging   等 staging answers，再跑 smoke（e2e/deployed）
      3. production       ⏸ 等人工批准 → 同一個 commit 上 prod → smoke check
```

## 為什麼不開 `staging` 分支

一開始想過「feature → merge 進 staging → 部署 → 跑 CI → 再開 PR 到 main」。
三個問題：

1. **閘門跑在 merge 之後。** 壞的變更已經進了共用分支、也已經部署出去，
   要復原得在共用分支上 revert。現在 `e2e.yml` 是 `on: pull_request`，
   閘門本來就在 merge 之前——改成那樣是退步。
2. **PR 變成橡皮章。** 等 staging 通過才開的 PR，審的是一批已經合併的
   commit，審查再也擋不住任何東西，而且批次審查比逐一審查弱得多。
3. **兩條長期分支會分岔。** 這就是 GitFlow 的 `develop` + `master`：兩邊互相
   衝突、hotfix 要 cherry-pick，而最要命的是——你在 `staging` 上驗過的那棵
   tree，跟你從 `main` 部署出去的那棵**不是同一棵**。驗的和發的不是同一份
   程式。

trunk-based 把 staging 當成「即將上線的東西」的排練場，prod 則是把**同一個
已驗證的 commit** 往前推一步。要的批准關卡由 GitHub Environment 提供，是真正
可稽核的閘門，而不是事後補開的 PR。

## GitHub 上已經設定好的部分

以下都已透過 API 設好，可用 `gh api` 覆核：

| 項目 | 值 | 為什麼 |
|---|---|---|
| Environment `production` | required reviewer = `jackywxd`；`prevent_self_review = false` | 投產閘門。單人維護時若禁止自我審核，就永遠沒人能批准 |
| Environment 分支政策 | 只允許 `main` | 別的分支無法藉 `workflow_dispatch` 直接推上 prod |
| `main` required check | `playwright` | 這是 check run 的實際名稱（job 名，不是 workflow 名 `E2E`） |
| `main` strict | `true` | 分支需與 main 同步才可合併；偶爾要按一下 Update branch |
| `main` required approvals | **0** | 單一 contributor，設 1 會直接卡死自己。之後有第二個人再調高 |
| `enforce_admins` | `false` | 保留緊急情況下 admin 繞道的能力 |
| force push / branch 刪除 | 皆禁止 | |

```bash
gh api repos/jackywxd/wildrunner.org-next/branches/main/protection
gh api repos/jackywxd/wildrunner.org-next/environments
```

## 只有你能做的：4 個 secrets

我不經手憑證值，所以這步請你自己跑。

前兩個從檔案讀，值不經過任何中間人：

```bash
gh secret set STAGING_DOTENV < .env.staging
```

```bash
gh secret set PRODUCTION_DOTENV < .env.production
```

後兩個**必須一次跑一行**。`gh secret set` 在沒有 `--body` 時會讀 stdin；
四行一起貼進終端機的話，第三行會把第四行當成自己的祕密值吃掉，結果只設好
三個、其中一個內容是垃圾，而且不會報錯：

```bash
gh secret set CLOUDFLARE_API_TOKEN
```

```bash
gh secret set CLOUDFLARE_ACCOUNT_ID
```

單獨執行時 gh 會給互動式提示（輸入不回顯），也不會留在 shell history 裡。

### 怎麼產生 `CLOUDFLARE_API_TOKEN`

Dashboard → 右上頭像 → **My Profile** → **API Tokens** → **Create Token**
→ 最下面的 **Create Custom Token**（不要用 Global API Key，那把鑰匙能動你
帳號裡的所有東西，而且無法只給部分權限）。

直接網址：<https://dash.cloudflare.com/profile/api-tokens>

**Permissions**（依這個 repo 實際部署的東西列的）：

| 範圍 | 項目 | 權限 | 為什麼 |
|---|---|---|---|
| Account | Workers Scripts | Edit | 部署 Worker 本體與 assets |
| Account | Workers R2 Storage | Edit | `wildrunner-storage*`、OpenNext ISR cache bucket |
| Account | D1 | Edit | `preflight:prod` 讀 migration 狀態；`cleanup:staging` 會寫 |
| Account | Account Settings | Read | wrangler 解析帳號資訊（建議留著） |
| **Zone** | **Workers Routes** | **Edit** | **prod 專用**，見下方 |

**Account Resources**：`Include → <你的帳號>`
**Zone Resources**：`Include → Specific zone → wildrunner.org`

> ⚠️ 最容易漏掉的是 **Zone → Workers Routes → Edit**。production 的
> `wrangler.jsonc` 用 zone routes（`wildrunner.org/*`、`www.wildrunner.org/*`），
> 少了這個權限，staging 部署會成功、production 部署卻失敗，錯誤訊息還不會直接
> 說是路由權限問題。staging 只用 `workers.dev`，所以不需要 zone 權限。

`AI` 和 `IMAGES` 是 runtime binding，部署時不需要額外 token 權限。

**TTL**：可以設到期日，但記得到期要換，否則某天部署會無預警失敗。

### 存進 GitHub 之前先驗證

別把沒驗過的 token 直接存進去。用 `read -s` 讀入（不回顯、不進 history）：

```bash
read -rs CF_TOKEN && curl -s -H "Authorization: Bearer $CF_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.success?'✅ '+j.result.status:'❌ '+JSON.stringify(j.errors))})"
```

再實際試一次部署（這才是真正的驗證——`verify` 只證明 token 有效，不證明權限
夠）：

```bash
CLOUDFLARE_API_TOKEN=$CF_TOKEN CLOUDFLARE_ACCOUNT_ID=$(wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1) pnpm deploy:staging
```

驗過再 `gh secret set`，最後 `unset CF_TOKEN`。

### `CLOUDFLARE_ACCOUNT_ID`

```bash
wrangler whoami
```

輸出裡的 Account ID（32 位十六進位）。`wrangler.jsonc` 沒有寫死
`account_id`，所以 CI 真的需要這一個 secret。

檢查：`gh secret list`（應看到 4 個）。

> `.env.staging` / `.env.production` 裡的 `RESEND_API_KEY`、`S3_*` 目前都是
> **空值**——`S3_*` 是故意留空來中和 `.env.local`（見 `with-env.mjs`）。所以
> 這兩個 blob 裡真正的祕密是 `PAYLOAD_SECRET`。

整個 env 檔存成**一個** secret 而不是拆成多個 key，是因為
`scripts/with-env.mjs` 把該檔案視為那個環境的唯一權威來源（它會覆蓋
`process.env`，避免 staging build 繼承到 `.env.local` 的 `S3_*` 寫入憑證）。
拆開存會讓 CI 和筆電慢慢飄移。

### 還需要在 Cloudflare 後台做

目前 `wildrunner-org-next`（prod worker）綁 `main` **自動部署上線**——
這正是現在缺少 staging 排練的原因。

**把 prod worker 的 Workers Builds 自動部署關掉**，改由 `deploy.yml` 的
`production` job 在人工批准後部署。staging 也由 `deploy.yml` 部署，
不需要另外接 Workers Builds。

> 若你想保留 Workers Builds：把它接到 **staging** worker、production branch
> 設 `main`，然後在 `deploy.yml` 拿掉 `staging` job、只留 verify + 投產。
> 缺點是 Actions 無法得知 Workers Builds 何時部署完，verify 會賽跑。

## 待處理：staging 和 prod 共用同一個 PAYLOAD_SECRET

兩個 env 檔的 `PAYLOAD_SECRET` 是**同一個值**（sha256 前 12 碼相同）。

實測目前**無法**用 staging 的 token 冒充 prod：拿 staging 簽出來的 admin JWT
打 `https://wildrunner.org/api/users/me`，prod 回 `user: null`——因為 Payload
會拿 token 裡的 `sid` 去比對該使用者的 `users_sessions`，而兩邊資料庫的 session
不同。

但這仍該修，理由是它只差一步就會變成可利用：

- `PAYLOAD_SECRET` 同時是簽章金鑰**和**欄位加密金鑰，兩個環境共用等於單點失效
- staging 的 admin 密碼是 `e2e/helpers/auth.ts` 裡的常數，且 staging 是公開可達的
- 一旦 session 驗證行為改變（或某處關掉），token 立刻可跨環境攜帶

建議：給 staging 換一個獨立的 `PAYLOAD_SECRET`，然後重設 `STAGING_DOTENV`。
換掉會讓 staging 現有的登入 session 全部失效（重新登入即可），不影響內容。

## staging 與 prod 的資料一致性

```bash
pnpm sync:staging --dry-run   # 看差異
pnpm sync:staging             # 把 prod 已發布內容補進 staging
```

單向：prod 是來源，staging 永不回寫。**不同步 `users`** —— prod 的帳號是真人
的 email 和 bcrypt hash，沒有理由複製到一個 admin 密碼寫在
`e2e/helpers/` 裡的環境。內容的 owner 會改指到 staging 的帳號（`--owner=`）。

> 關於寄信：staging 的 `RESEND_API_KEY` 目前是**空的**，所以
> `isEmailConfigured()` 為 false、Payload 只把信寫進 log，今天在 staging 觸發
> 邀請或重設密碼**不會真的寄出**。但那只差一個設定——真實 email 若躺在這個
> 資料庫裡、哪天把 key 填上就會開始寄給真人。把 `users` 排除在外，是讓這件事
> 「不可能」而不只是「不太可能」。

R2 物件也不複製：遷移過的媒體存的是 `images.wildrunner.org` 絕對網址，
staging 直接讀，所以 515MB 的影片只需要複製那一列資料。

> `pnpm cleanup:staging` 判斷「真實內容」時，除了 `.velite` 快照，**也會讀
> prod 的線上 slug 清單**。少了後者，剛 sync 過來的內容會被當成測試殘留刪掉
> ——這正是加上 prod 清單之前發生的事。

## 為什麼 staging 只跑 smoke，不跑完整套件

**這一段是 2026-09-02 的決定，證據在下面，不要在不知道這些數字的情況下改回去。**

原本 `verify-staging` 對已部署的 staging 跑**和 PR gate 完全一樣的 59 個測試**
——同一份程式碼，只換 base URL。執行紀錄結束了這個做法：

| Gate | 完成次數 | 首次就過 |
|---|---|---|
| `e2e.yml`（PR，job 內自建自毀的 D1） | 29 | 79% |
| `verify-staging`（共用的已部署 staging） | 25 | 約 40% |

`production` 是 `needs: verify-staging`，所以一個失敗多於成功的閘門，**擋掉了
一半以上的發布**。而逐行讀過的六次失敗，**沒有一次是產品缺陷**：ECONNRESET、
teardown 競態、fixture 假設、冷啟動 500。一個抓不到真 bug 卻攔掉一半發布的
閘門，只會訓練大家去按重跑。

三個結構性原因，都是「把完整套件指向共用的活環境」直接帶來的：

- 會建立 posts / media / galleries，所以需要 ledger、cleanup、殘留追蹤
- 59 支測試共用一個 admin 帳號，`users_sessions` 是讀改寫，所以**無法平行化**
- 跑在剛部署完的 Worker 上，冷啟動的 500 直接算成測試失敗

現在完整套件留在它該在的地方（PR gate，資料庫在 job 裡建、在 job 裡死），
`verify-staging` 只問 PR gate 問不到的那一件事:**剛剛部署出去的東西有沒有接
好、活著**。內容是 `e2e/deployed/smoke.spec.ts` 的六項，本機實測 1.2 分鐘。

**放棄的是深度。** 如果某個 journey 只在真的 Worker 上壞掉，這裡抓不到——要
嘛 PR gate 抓到，要嘛沒人抓到。這是刻意的取捨:被取代的做法也一樣抓不到，
它只是為了無關的理由紅著、看起來像在把關。

## 對 staging 跑測試

```bash
# CI 跑的那一個：只有 e2e/deployed 的六項
PLAYWRIGHT_BASE_URL=https://wildrunner-org-next-staging.small-tooth-cc10.workers.dev pnpm test:smoke

# 完整套件。CI 不再這樣跑（上一節說明原因），手動除錯時才用
PLAYWRIGHT_BASE_URL=https://wildrunner-org-next-staging.small-tooth-cc10.workers.dev pnpm test:e2e
```

`PLAYWRIGHT_BASE_URL` 必須和該環境建置期的 `NEXT_PUBLIC_SITE_URL` **完全一致**：
Payload 的 CSRF 允許清單來自 `serverURL`，網址對不上的話每一支需要登入的
測試都會失敗，而且錯誤訊息毫無幫助。

指向非 localhost 時，`playwright.config.ts` 會自動：

- **不啟動**本機 dev server（省掉每次 1–3 分鐘）
- 把每支測試的預算從 30s 放寬到 300s ——上傳測試要把幾十 MB 推過 Worker
  進 R2，實測 V0-T5 42s、V2-T1 52s、V3-T3 1.6m
