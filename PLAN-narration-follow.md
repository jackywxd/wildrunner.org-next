# 文章朗讀：從上次位置繼續播放、文字跟隨朗讀

**狀態**：設計，尚未實作。由規劃代理（Opus）讀原始碼後起草，主 session 抽查並修訂。標「實測」的是量出來的；其餘出自所引的檔案或官方文件。

---

## 一、決定設計的事實

1. **頁面丟掉了 key 和 stale。** `narrationUrl` 只回傳 URL（`src/lib/reader/narration.ts:35-48`），而 `findNarration` 其實回傳 `{ key, stale }`（`src/lib/reader/article-audio.ts:121-142`）。兩個功能都需要這兩個值。
2. **瀏覽器讀不到 R2 上的 JSON。** `images.wildrunner.org` 不回 `access-control-allow-origin`（實測，2026-11-06，帶 `Origin` 標頭的 `curl -I`；`src/endpoints/articleAudioDownload.ts:16-25` 也有記錄）。時間對照表只能走同源的 endpoint，或寫進伺服器渲染的 HTML。
3. **透過 Workers AI 的 MiniMax 拿不到時間戳。** Cloudflare 對 `minimax/speech-2.8-hd` 公布的 input schema 只接受 `text, voice_id, speed, volume, pitch, emotion, format, sample_rate`，output 只有 `audio`，兩邊都是 `additionalProperties: false`。MiniMax 官方 `t2a_v2` 有 `subtitle_enable`，但那要另外開帳號、另外計費，不在本計畫範圍。
4. **兩條生成路徑的 `.txt` 內容不同。** Worker 路徑是一行對一句 `articleScript`（`narrate.ts:73,88`，`reconcileSpokenScript` 保證行數）；本地路徑是一行對一段 piece（`scripts/narrate-local.ts`）。本地腳本知道每段 piece 的精確起點（各段長度 + 間隔，再除以 tempo；最後一段後面沒有間隔），但不知道一段之內每句的起點，因為 `tidyPauses` 改過波形。piece 不會跨越頂層 block（`pack` 在每個 block 結尾都會切開）。
5. **oMLX 沒有開放強制對齊。** `/v1/audio/transcriptions` 沒有 `text` 欄位；`word_timestamps` 只支援 Whisper；Qwen3-ASR 的 segment 長達 1,200 秒，給不出可用的時間。oMLX 內建的 mlx-audio 0.6.3 有 `qwen3_forced_aligner`（解析度 80 ms，單次最多 400 秒），但模型還沒下載。
6. **句子編號在簡體站上不會變**，前提是從資料庫裡的繁體原文計算，這和 `narrationKey` 的做法一樣（`src/lib/content.ts:329-331`）。`toSimplifiedRichText` 保留樹的結構、只轉換文字節點（`src/lib/i18n/zh-post.ts:57-74`）。只有 YouTube 網址的段落，朗讀和渲染兩邊都用 `soleYouTubeUrl` 跳過，貢獻 0 句。
7. **渲染器拿到的是原始節點物件**，所以可以用以節點為 key 的 `WeakMap` 在 converter 裡加 `data-` 屬性。`PayloadRichText` 是 Server Component（檔案裡沒有 `"use client"`），加的屬性不會造成 hydration 不一致。
8. 網站標頭是 `sticky top-0 z-40`（`src/components/site-header.tsx:35`）；`data-hydrated` 涵蓋 `ArticleAudio`。
9. **本地 dev 播不了朗讀。** `.env.local` 的 `R2_PUBLIC_URL` 指向 production，本機也沒有路由提供 `article-audio/*`。
10. `.mp3` 不在 `.gitattributes` 的 LFS 規則裡（已查），測試夾具是普通 blob，不會在 CI 變成指標檔。

## 二、時間對照表格式

放在 MP3 旁邊，名為 `<key>.json`，例如 `article-audio/33-5989c777.mp3.json`，和現有的 `<key>.txt` 並列，每份朗讀寫一次。

```jsonc
{
  "version": 1,
  "audio": "article-audio/33-5989c777.mp3",  // 描述的是哪個檔
  "bytes": 171760000,                        // 該 MP3 的大小；不符就拒用
  "duration": 27512.35,                      // 秒，ffprobe 實測
  "lines": 3375,                             // articleScript(...).split("\n").length
  "precision": "block",                      // v1 只有 "block"
  "source": "pieces" | "aligned",
  "starts": [0, 4.12, 9.8]                   // 每行一個，兩位小數，不遞減，落在 [0, duration]
}
```

- 第 i 行就是 `articleScript` 的第 i 行。標題非空時，第 0 行是標題，內文第 j 句是第 j+1 行。
- 繁體站和簡體站共用同一份，和 MP3 一樣。
- 檔案裡沒有文字，只有數字，描述的是已經公開的 MP3，所以 endpoint 不需要讀資料庫。
- `bytes` 是因為 `?force=true` 會在同一個 key 下重新生成音頻，這時舊的對照表會被大小檢查擋下，不必刪任何東西。

## 三、步驟

### 第 0 階段：動手前先鎖住朗讀 key

**0.1 U-READER-9（golden test）**，放在 `e2e/unit/article-text.spec.ts`。用一份綜合夾具（句中網址、`。」`、小數、清單、換行、只有 YouTube 的段落、180 字硬切、K/M/引號規則），把 `articleSegments` 的完整輸出和 `articleAudioKeyForPost` 的實際值釘死。先在現有程式碼上看它通過，故意改壞一條規則看它變紅。
防的是：重構時不小心改到任何一句朗讀文字，production 上所有朗讀的 key 都會變，頁面退回播舊檔，sweep 又想重新付費生成全部。

### 第 1 階段：從上次位置繼續（可以單獨上線，不需要時間對照表）

**1.1** `src/lib/reader/narration-position.ts`（純函式，`now` 由參數傳入）：
- localStorage 只用一個項目 `narration-positions`，存 `{ [audioKey]: { t, d, at } }`；
- `readPositions(raw)`：遇到壞掉的 JSON 也不會崩；
- `recordPosition(map, key, t, d, now)`：t < 5 秒或 t > d − 15 秒時刪除該項；只保留最新的 50 筆；
- `resumePoint(entry, duration)`：時長差距超過 max(1 秒, 0.5%) 或已接近結尾時回傳 null；
- `formatClock(s)`：`m:ss` 或 `h:mm:ss`。

**1.2** `narrationUrl` 改成回傳 `{ url, key, stale }`，更新 `page.tsx` 的呼叫和 `ArticleAudio` 的 props。

**1.3** `ArticleAudio.tsx` 加上 resume hook（`src/components/posts/narration/use-resume.ts`）：
- **第一次渲染**和伺服器一致：沒有提示，`preload="none"`。
- **掛載後**在 effect 裡讀 storage（包 try/catch）。有記錄就顯示「上次聽到 {時間}，按播放從這裡繼續」和「從頭開始」按鈕，並把 `preload` 改成 `"metadata"`。只有回訪的讀者才會預先抓一小段，第一次來的讀者仍然什麼都不抓。
- **還原**：按下播放時，若 `readyState >= HAVE_METADATA` 就直接設 `currentTime`，否則等 `loadedmetadata`。只在 `currentTime < 1` 時還原，避免讀者在 hydration 前已經按了原生播放、聽到一半被跳走。
- **儲存時機**：`timeupdate`（最多每 5 秒一次）、`pause`、`seeked`、`visibilitychange` 變成 hidden、`pagehide`、元件卸載。站內導覽不會觸發 `pagehide`，所以卸載時一定要存。
- **清除**：`ended` 時清除。
- **文案**：新增 `src/dictionaries/zh-Hant.json` 的 `reader.*`，再跑 `pnpm generate:zh-hans`。

**1.4** 為 journey test 準備一份朗讀：
- 新增小夾具 `e2e/fixtures/narration.mp3`（約 120 秒、單聲道、低位元率），實測時長和大小記在 `e2e/fixtures/narration.ts`，放在 `NARRATED_SLUG` 旁邊。選一篇多屏但**不是最長**的文章，因為 `V-READER` 挑的是最長那篇；讓它明確排除 `NARRATED_SLUG`。
- 新增 `scripts/seed-e2e-narration.ts`：
  - 用 `wrangler d1 execute --local --json` 讀文章，透過 `execFileSync`，不經 shell；
  - 用 `articleAudioKeyForPost` 算 key；
  - 用 `wrangler r2 object put --local` 寫入 MP3 和合成的 `.json`，再讀回確認；
  - 遇到 `CLOUDFLARE_ENV` 或 `NODE_ENV=production` 就拒絕執行（照 `scripts/reset-local-db.mjs` 的寫法）。`--local` 一定要明寫，因為 `wrangler.jsonc` 把 R2 設成 `remote: true`；
  - 結尾 `process.exit()`。
- 在 `reset-local-db.mjs` 的 `runSeeds` 之後呼叫它；`.github/workflows/e2e.yml` 在 Playwright 之前**每次都**跑一次，因為 fixture cache 只存 d1，cache 命中時 R2 會是空的。

### 第 2 階段：時間對照表（不改 UI）

**2.1** `src/lib/reader/narration-timing.ts`（純函式）：
- `parseTiming(json)`：檢查版本、`starts.length === lines`、不遞減、在範圍內；
- `findTiming(bucket, postId, key)`：key 格式不對、任一物件不存在、解析失敗、`audio !== key`、`bytes !== head.size` 時都回傳 null；
- `lineAt(starts, t)`：二分搜尋。

**2.2** `orphanAudioKeys`（`article-audio.ts:170`）把 `.json` 當成和 `.txt` 一樣的附屬檔，否則每份有時間表的朗讀都會被報成孤兒。

**2.3** 新增 `src/endpoints/articleAudioTiming.ts`，路由 `GET /article-audio/:id/timing?key=…`，在 `payload.config.ts` 註冊：
- 只讀 R2；
- 200 帶 `Cache-Control: public, max-age=3600`，刻意不用 immutable，因為 `force` 可能在同一個 key 下換掉 MP3；
- 404 帶 `no-store`，之後補上的時間表才會被讀到。

**2.4** 本地路徑（`scripts/narrate-local.ts`，加上純函式 `scripts/lib/narration-timing.ts`）：
- `blocks()` 改成逐行精確比對：`out.flat()` 必須等於 `articleScript(...).split("\n")`，不再只比去掉空白的字串；
- 讓 `{ line, text }` 一路帶過 `speakable`，現在的 `.filter(Boolean)` 會讓行號錯位；`Chunk` 加上 `lines: number[]`；
- `piecesToStarts(pieces, tempo, measuredDuration)`：
  - piece 的起點是精確的；
  - piece 之內的各句按 `comparable()` 的音節數分配；
  - 最後按 ffprobe 實測時長縮放，誤差超過 0.5 秒就拒絕；
  - `precision: "block"`；
- 寫出 `<mp3>.json`，並且**最先**印出它的 `wrangler r2 object put` 命令；
- `--timing-only`：給已經生成過的文章補時間表，要求每段都已在快取裡（不會重新生成），參數必須和當初發佈的那次一致。

**2.5** 補齊 production 上現有的 MiniMax 朗讀：
- `scripts/align-narration.py` 用 **oMLX 自帶的 Python**（`/Applications/oMLX.app/Contents/Resources/Python/...`，內含 mlx-audio 0.6.3）執行，因為這台 Mac 沒有裝 `uv`。模型是 `mlx-community/Qwen3-ForcedAligner-0.6B-8bit`（約 1 GB，需要你同意下載）。stdin 吃 JSONL `{ audio, sentences[], language }`，stdout 吐每句的 `{ start, end }`。
- `scripts/narration-timing.ts`（`pnpm narration:timing --post N | --all`）：
  - 用 `wrangler d1 execute --remote` 讀文章，不啟動 Payload；
  - 用 `articleAudioKeyForPost` 算 key，用 `wrangler r2 object get --remote` 下載，已有 `.json` 的跳過；
  - 以 `.txt` 各行為文字，行數和 `articleScript` 不符就拒絕；
  - 以 300 秒以內的滑動視窗對齊；
  - 寫出 JSON 並印出上傳命令。**寫入 production 由你執行。**

### 第 3 階段：文字跟隨朗讀（v1 只做段落級）

**3.1** `article-text.ts`：抽出 `isLeafBlock(node)`，匯出 `leafBlocks(content)`，新增 `narrationPlan(title, content) → { titled, blocks: number[] }`（每個 leaf block 的句數）。總數必須等於 `articleSegments(content).length`，否則回傳 null。

**3.2** 在 `content.ts` 算 `narrationKey` 的同一處，從儲存的原文算出 `narrationPlan`，放進 `SitePost`，`toSimplifiedPost` 原樣帶過去。

**3.3** `payload-rich-text.tsx` 加一個可選的 `narrationPlan` prop：
- 從正在渲染的那棵樹建立 `WeakMap<leaf, 第一句的內文 index>`，在 `paragraph`（非 YouTube）、`heading`、`listitem`、`quote` 上用 `cloneElement` 加 `data-seg`；
- leaf 數量對不上就一個都不加。對不上時寧可不標，也不能標錯；
- 列印頁和會員預覽不傳這個 prop，行為不變。

**3.4** `page.tsx`：只有 `narration && !narration.stale` 時才傳 plan；h1 加 `data-narration-title`；把 `{ lines, titled }` 傳給 `ArticleAudio`。

**3.5** 跟隨的程式放在 `src/components/posts/narration/`，第一次按播放時才用 `import()` 載入：
- 抓 timing endpoint，只有在行數相符、不是 stale、時長在容許範圍內、頁面上有 `data-seg` 時才啟用；
- `timeupdate` 時用 `lineAt` 找出現在的行，再用二分搜尋找出 `data-seg` 不大於它的最後一個 block，給它加 `data-narrating`；
- **狀態**（標在播放器的 `data-follow` 上）：
  - `following`：按下播放、有時間表、讀者沒關掉跟隨（偏好存在 localStorage）；
  - `detached`：讀者用滾輪、觸控或按鍵捲動頁面後；
  - 回到 `following`：按「回到朗讀位置」或拖動進度條之後；
  - `unavailable`：不顯示任何跟隨控制。
- **捲動**：只有當該段離開「標頭與播放器下方 + 16 px」這條閱讀帶的上方 45% 時才捲動；用 `smooth`，`prefers-reduced-motion` 時用 `auto`；頁面在背景時不捲，回到前景時跳一次；暫停時保留高亮。

**3.6** 播放器只有在播放中或已脫離跟隨時才變成 `sticky top-16 z-30 bg-background`；加「跟隨朗讀」開關（`aria-pressed`）和「回到朗讀位置」按鈕。

**3.7** `src/styles/globals.css` 在 `.article-body` 附近加 `.article-body [data-narrating]` 和 `scroll-margin-top`。

**3.8** `docs/testing-plan.md` 加一列使用情境（V11：收聽文章，文字跟隨，回來時接續播放），並列入 journey 清單。

### 第 4 階段：上線

由你執行印出的命令：post 31 和 33 跑 `--timing-only`，其他 MiniMax 朗讀跑補齊腳本。接著在 staging 走一遍真實流程，並用真的 iPhone 檢查三件事：Safari 在 metadata 載入前設定 `currentTime` 的行為、sticky 播放器和工具列的互動、捲動是否和讀者手動捲動打架。

## 四、測試

單元測試放在 `e2e/unit/`，純函式，`now` 由參數傳入。每一列寫的是它防的失敗：

| 測試 | 防的是 |
|---|---|
| U-READER-9（golden） | 重構悄悄改到 production 的 key |
| U-FOLLOW-1 | 簡體站上 plan 和 `data-seg` 與繁體站相同，只有 YouTube 的段落不標也不讓編號錯位；否則簡體站會高亮錯的段落 |
| U-FOLLOW-2 | 結構對不上時一個都不標；`narrationPlan` 的總數等於 `articleSegments` |
| U-TIMING-1 | `parseTiming` 拒絕長度錯、遞減、超出範圍、未知版本；否則會自信地高亮錯的地方 |
| U-TIMING-2 | `findTiming` 在大小不符、檔案不存在、別篇文章的 key 時回傳 null；否則 `force` 之後會用到過期的時間表 |
| U-TIMING-3 | `lineAt` 的邊界：第一個起點之前、剛好在起點上、最後一個之後、相同的起點 |
| U-RESUME-1..4 | 接近結尾時清除、時長不同時拒絕、不同 key 互不干擾、超過 50 筆時修剪；否則會接續到結尾，或用到別的檔案的位置 |
| U-AUDIOKEY（擴充） | `.json` 不算孤兒 |
| U-NARRATE-17 | `piecesToStarts` 處理間隔、最後一段、tempo、縮放，誤差過大時拒絕；否則 7 小時的檔案會越對越偏 |
| U-NARRATE-18 | 行號經過 `speakable` 和 `pack` 後不錯位 |
| U-NARRATE-19 | 對齊結果換算成每行起點，以及視窗的接受規則 |

（規劃稿原本用了 U-NARRATE-7..9，已經被 `narration-check.spec.ts` 用掉，所以改成 17–19。）

**一個 journey：`e2e/journeys/article-listen.spec.ts` V-LISTEN-T1**，從 `helpers/test` import `test`，用 `budget()`：

1. 用 route 攔截 `article-audio/*.mp3`，回應夾具 MP3；timing endpoint 走真的。
2. `goto` 到 `NARRATED_SLUG` 的簡體頁，`waitForHydration`。
3. 靜音播放，跳到 `starts[k] + 0.1`，預期包含第 k 句的段落帶有 `data-narrating`，而且在閱讀帶內。
4. `mouse.wheel` 之後預期 `data-follow=detached`；按「回到朗讀位置」後，該段回到畫面內。
5. 暫停，**點擊**「查看所有文章」離開，再點回這篇文章，預期出現接續提示；按播放後 `currentTime` 接近儲存的位置。

寫之前先確認三件事：Playwright 的 Chromium 對 `canPlayType('audio/mpeg')` 回報可用；`audio.play()` 不需要點擊就能啟動；用 `currentTime` 跳轉時在測試裡寫明理由（它代替的是 Playwright 操作不了的原生進度條）。

## 五、風險

1. **改 key 相關的程式碼。** 先寫 U-READER-9 來擋。部署前後各跑一次 production sweep 的 dry-run（需要你的 maintenance secret），缺音頻的文章清單不能變。
2. **MiniMax 音頻的對齊效果還沒量過。** 批次跑之前，先在一份朗讀上隨機挑 10 句用耳朵核對。
3. **不要上線「按字數平均估算」的時間表。** 沒有東西可以校正，誤差會一路累積到檔案結尾。
4. 拖動捲軸和頁內搜尋只能靠備用判斷規則偵測。
5. Safari 的行為（見第 4 階段）。
6. 無頭瀏覽器能不能播 MP3 還沒確認（見第四節）。
7. post 33 約有 1–2k 個 block，`data-seg` 約增加 25 KB 未壓縮的 HTML；時間表約 25 KB，只在按播放時抓。
8. 沒處理：網站背景音樂和朗讀仍然可能同時播放。

## 六、需要你決定的事（第一個選項是建議）

1. **高亮的層級**：v1 只做段落級；句子級要等強制對齊有了句子精度之後再做。
2. **現有 MiniMax 朗讀怎麼補時間表**：在 Mac 上做強制對齊（免費，約 1 GB 模型，解析度 80 ms）／按字數估算（不建議）／不補，只做接續播放。
3. **Worker 之後生成的新朗讀**：先沒有時間表，跑補齊腳本後才有。
4. **stale 朗讀**（文章已編輯、還在播舊音頻）：不跟隨。
5. **跟隨的預設**：按下播放就跟隨，手動捲動就脫離，拖動進度條就回來。
6. **sticky 播放器**：只在播放中或已脫離時才固定。
7. **`ArticleReader`（沒有音頻時用裝置語音念的備用播放器）**：v1 不做。它本來就有游標，以後接上高亮只要一個呼叫。
8. **會員跨裝置同步收聽位置**：不做，要動 D1 schema。
9. **時間表怎麼送到頁面**：同源 endpoint、按播放時才抓。另一個選項是在 production bucket 加 CORS 規則，但那是一個要你去改的 production 永久設定。
10. **順序**：第 1 階段單獨一個 PR，第 2、3 階段再一個。
