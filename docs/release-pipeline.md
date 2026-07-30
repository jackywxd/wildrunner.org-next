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
      2. verify-staging   對已部署的 staging 跑完整 e2e，跑完清理測試資料
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

## 需要設定的東西（我沒有權限，要你在後台做）

### 1. GitHub Environment：投產閘門

Settings → Environments → New environment → 命名 **`production`**
→ 勾 **Required reviewers**，加上你自己。

沒有這一步，`production` job 會直接跑，閘門形同不存在。

### 2. GitHub Secrets

Settings → Secrets and variables → Actions：

| Secret | 內容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 具 Workers Scripts\:Edit、D1\:Edit、R2\:Edit 的 token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `STAGING_DOTENV` | **整個 `.env.staging` 檔案內容** |
| `PRODUCTION_DOTENV` | **整個 `.env.production` 檔案內容** |

整檔存成一個 secret 而不是逐一拆成多個 key，是因為 `scripts/with-env.mjs`
把該檔案視為那個環境的唯一權威來源（它會覆蓋 `process.env`，避免 staging
build 繼承到 `.env.local` 的 `S3_*` 寫入憑證）。拆開存會讓 CI 和筆電慢慢
飄移。

### 3. Cloudflare Workers Builds

目前 `wildrunner-org-next`（prod worker）綁 `main` **自動部署上線**——
這正是現在缺少 staging 排練的原因。

**把 prod worker 的 Workers Builds 自動部署關掉**，改由 `deploy.yml` 的
`production` job 在人工批准後部署。staging 也由 `deploy.yml` 部署，
不需要另外接 Workers Builds。

> 若你想保留 Workers Builds：把它接到 **staging** worker、production branch
> 設 `main`，然後在 `deploy.yml` 拿掉 `staging` job、只留 verify + 投產。
> 缺點是 Actions 無法得知 Workers Builds 何時部署完，verify 會賽跑。

### 4. Branch protection（建議）

Settings → Branches → `main`：要求 PR、要求 `E2E` check 通過、
禁止直接 push。

## staging 與 prod 的資料一致性

```bash
pnpm sync:staging --dry-run   # 看差異
pnpm sync:staging             # 把 prod 已發布內容補進 staging
```

單向：prod 是來源，staging 永不回寫。**不同步 `users`** —— prod 的帳號是真人
的 email 和密碼 hash，而 staging 帶著可用的 `RESEND_API_KEY`
（`noreply@wildrunner.org`），一次邀請或重設密碼就會寄到真實會員信箱。
內容的 owner 會改指到 staging 的帳號（`--owner=`）。

R2 物件也不複製：遷移過的媒體存的是 `images.wildrunner.org` 絕對網址，
staging 直接讀，所以 515MB 的影片只需要複製那一列資料。

> `pnpm cleanup:staging` 判斷「真實內容」時，除了 `.velite` 快照，**也會讀
> prod 的線上 slug 清單**。少了後者，剛 sync 過來的內容會被當成測試殘留刪掉
> ——這正是加上 prod 清單之前發生的事。

## 對 staging 跑測試

```bash
PLAYWRIGHT_BASE_URL=https://wildrunner-org-next-staging.small-tooth-cc10.workers.dev pnpm test:e2e
```

`PLAYWRIGHT_BASE_URL` 必須和該環境建置期的 `NEXT_PUBLIC_SITE_URL` **完全一致**：
Payload 的 CSRF 允許清單來自 `serverURL`，網址對不上的話每一支需要登入的
測試都會失敗，而且錯誤訊息毫無幫助。

指向非 localhost 時，`playwright.config.ts` 會自動：

- **不啟動**本機 dev server（省掉每次 1–3 分鐘）
- 把每支測試的預算從 30s 放寬到 300s ——上傳測試要把幾十 MB 推過 Worker
  進 R2，實測 V0-T5 42s、V2-T1 52s、V3-T3 1.6m
