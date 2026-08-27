# 影片轉檔技術方案：上傳時轉成 H.264 1080p

**狀態**：設計，尚未實作。標「實測」的是量出來的；沒標的是推導或引用官方文件。

---

## 0. 先回答你的兩個問題

### 需要隊列嗎？

**需要隊列「語意」，但不需要 Cloudflare Queues。** 用 D1 當狀態機就夠了，理由在 §3。

### 需要臨時存儲嗎？

**需要，而且是硬性要求 —— 不是效能考量。** ffmpeg 自己的說明寫著：

```
faststart   Run a second pass to put the index (moov atom) at the beginning of the file
```

「second pass」代表輸出**必須是可 seek 的檔案**，不能直接 pipe 進 R2。沒有 faststart 的話瀏覽器要下載完整支才能開始播 —— 那正是我們要修的問題之一。

好消息是 container 自己的 ephemeral disk 就夠，不需要任何額外服務。實測數字在 §4。

---

## 1. 實測：這件事有多貴、多快

拿真的 4K 素材量的，不是估算：

```
來源  3840×2160  57s  134 MB  (19.7 Mbps)   gallery/2024/whistler-by-utmb/Whistler UTMB.m4v
指令  -threads 4 -preset medium -crf 21 -maxrate 6M
結果  18 秒牆鐘  →  speed=3.11x
輸出  1920×1080  level 4.0  42 MB  (~6.2 Mbps)
```

**3.11× 實時**，比我上一版估的「1–2×」快得多。重算全部成本：

| | |
|---|---|
| 既有 23 支（80.6 分鐘）全部轉完 | 25.9 分鐘牆鐘 → **104 vCPU-分鐘** |
| Workers Paid 每月內含 | **375 vCPU-分鐘** |
| 一支 5 分鐘的 4K 上傳 | 1.6 分鐘牆鐘 → **6.4 vCPU-分鐘** |
| 免費額度可涵蓋 | **每月約 58 支** |

**注意這是在我的 Mac 上量的**，單核可能比 Cloudflare 的 vCPU 快。就算實際只有一半速度（1.5×），回填也只要 215 vCPU-分鐘，仍在免費額度內。這個結論對誤差有很大容忍度。

順帶：輸出 `level 4.0`，正是中階 Android 硬解需要的。

### 但要加上網路時間 —— 那也是計費時間

從這個帳號既有的 container 讀到 `bandwidth_limit_mbps: 100`（見 §11）。而 Containers 是**按「實際運行的每 10ms」計費**，等網路也算錢。100 Mbps = 12.5 MB/s：

| | 轉檔 | 下載 | 上傳 | 合計牆鐘 | vCPU-分鐘 |
|---|---|---|---|---|---|
| 既有 23 支（10.45 GB） | 26 分 | 14 分 | 3.5 分 | **44 分** | **176** |
| 一支 5 分鐘 4K（~650 MB） | 1.6 分 | 0.9 分 | 0.3 分 | **2.8 分** | **11** |

所以免費額度涵蓋的是**每月約 34 支**，不是先前只算 CPU 的 58 支。回填仍在 375 之內。

**這也是把回填放在本機做的另一個理由** —— 本機沒有 100 Mbps 的上限，也不計費。

---

## 2. 一個一定要先講的地雷

**轉檔不能掛在 `media` 的 `afterChange` hook 上。**

`src/endpoints/processMediaImage.ts` 的檔頭記著這件事，是付過代價的：在同一個 request 裡對剛寫進去的 R2 物件做 `bucket.get()`，**本機和 production 都穩定回 null**，而任何真正獨立的 request 立刻讀得到。原因沒查清楚，既有做法是結構上繞開 —— 由 client 在建立 document 之後另外呼叫一個 endpoint。

轉檔照抄這個形狀。另外路徑**必須是 `/members/...` 而不是 `/media/...`**：Payload 的 router 會把第一段等於 collection slug 的路徑收進該 collection 自己的 `endpoints`，全域註冊被繞過、回 404。

---

## 3. 為什麼 D1 就是隊列

Cloudflare Containers 有三個硬限制（官方文件）：

1. **執行時間沒有保證。** 原話是不因固定時長停掉，但「does not guarantee that any container instance will run for any set period of time」—— host 重啟、rollout 都會停它：`SIGTERM` → 最多 15 分鐘 → `SIGKILL`。
2. **磁碟是 ephemeral。** 每次啟動都是乾淨的。
3. Container 是 **Durable-Object-backed**，DO 有持久儲存和 alarm。

限制 (1) 是整個設計的核心：**轉檔一定會偶爾被中斷**，所以它必須可重跑，而且狀態不能放在 container 裡。

那狀態放哪？放 `media` 這一列。它已經在 D1，已經有備份，已經是這個功能的真相來源。

```
media.transcodeStatus    queued | running | done | failed | skipped
media.transcodeAttempts  number
media.originalUrl        轉檔前的 URL，永遠保留
```

**這就是一個隊列**：`queued` 是待辦，`running` 是租約，`attempts` 是重試計數，`failed` 是死信。

補上「租約會過期」的那一半，用**這個 repo 已經有的排程 worker**（`raceScheduleMaintenanceEndpoint` 就是這個形狀）：掃出 `running` 超過 N 分鐘的列，把它們打回 `queued` 並 `attempts += 1`；`attempts` 到上限就標 `failed`。

### 那什麼時候該換成 Cloudflare Queues？

Queues 買到的是 `max_retries`、`dead_letter_queue`、`max_concurrency`、`retry_delay` 這些現成語意。但這裡有個錯配：**queue 的投遞保證涵蓋的是「有沒有成功把工作交出去」，而會失敗的是後面那段長時間的轉檔** —— consumer 早就回傳了。要讓 queue 的重試涵蓋轉檔本身，consumer 就得一直等著，那又是另一種脆弱。

而且量級不對：**每月十幾支影片、一個生產者**。`max_instances` 預設 20 本來就限制了併發。

所以：**先不用 Queues。** 什麼時候該加 —— 上傳量成長到一天數十支、或出現多個生產者（例如批次匯入）需要背壓的時候。那時 §5 的狀態機不用改，只是把「誰來 poke」換掉。

---

## 4. 臨時存儲要多大

實測比例 + 算術：

| | |
|---|---|
| 實測 | 134 MB 來源 → 42 MB 輸出 |
| 輸出大小 | 由 `-maxrate 6M` 決定，跟內容無關：≈ 6.2 Mbps × 長度 |
| corpus 最大檔 | 1.17 GB / 481 秒 → 輸出約 **373 MB** |
| faststart 第二遍 | 需要一份輸出大小的工作空間 |
| **峰值** | 1.17 + 0.37 + 0.37 ≈ **2 GB** |

Container instance 規格：

| Instance | vCPU | Memory | Disk |
|---|---|---|---|
| standard-2 | 1 | 6 GiB | 12 GB |
| standard-3 | 2 | 8 GiB | 16 GB |
| **standard-4** | **4** | **12 GiB** | **20 GB** |

**磁碟完全不是瓶頸** —— 連 standard-2 的 12 GB 都有 6 倍餘裕。選 standard-4 是為了 CPU（4 vCPU 才有實測的 3.11×），不是為了空間。

---

## 4b. 轉檔器必須是「另一個 Worker」

原本打算把 Container class 放進主 app。**查完發現不行。**

Container 必須是 Durable Object，而 OpenNext 產生的 worker entry 是固定樣板，只 export 它自己那三個 DO：

```js
export { DOQueueHandler } from "./.build/durable-objects/queue.js";
export { DOShardedTagCache } from "./.build/durable-objects/sharded-tag-cache.js";
export { BucketCachePurge } from "./.build/durable-objects/bucket-cache-purge.js";
```

`@opennextjs/cloudflare` 的設定介面**沒有**任何 `additionalExports` / 自訂 entry 的鉤子。要塞進去只能改它產生的檔案 —— 那正是這個 repo 一再吃虧的那種地雷（改動會在下次 build 被蓋掉）。

所以拆成兩個 Worker：

```
wildrunner-org-next          （OpenNext 產生，維持現狀）
  └─ POST /api/members/media/:id/transcode
       └─ env.TRANSCODER.fetch()        service binding
                ↓
wildrunner-transcoder        （手寫的小 Worker，新增）
  ├─ export class TranscodeContainer extends Container
  └─ default.fetch → 路由到 container
```

這樣反而更好：不用碰 OpenNext 產生的東西、可以獨立部署、DO migration 跟主 app 的 D1 migration 互不干擾、轉檔壞掉不會拖垮網站。

service binding 這個 repo 已經在用了（`WORKER_SELF_REFERENCE`），照抄即可。

---

## 5. 時序

```
會員上傳（>32MB 直接進 R2）                                [既有]
  └─ createMediaDocument()                                 [既有]
       └─ POST /api/members/media/:id/transcode            [新] client 呼叫，best-effort
            ├─ 是影片嗎？不是 → status='skipped'，結束
            ├─ status='queued'
            └─ env.TRANSCODER.get(mediaId).kick()          不 await 完成，立刻回傳

Container（Docker，linux/amd64）                            [新]
  1. PATCH media: status='running'          ← 先寫，這是租約
  2. curl 原檔 → /tmp/in            （公開 CDN，不穿過 Worker）
  3. ffmpeg → /tmp/out.mp4          （見 §6）
  4. 上傳到「新的 key」，不覆蓋原檔  （R2 S3 API，憑證由 Worker secret 傳入）
  5. PATCH media: status='done', url=新網址, width/height/filesize, originalUrl=舊網址

排程 worker（既有的 cron 加一個 job）                        [新]
  掃 status='running' 且 updatedAt 超過 15 分鐘的列
    → attempts < 3 ? 打回 'queued' 並重新 kick : 標 'failed'
```

**下載走公開 CDN、上傳走 S3 API**：container 拿不到 Worker 的 R2 binding，而 1.17 GB 穿過 Worker 轉送是最糟的做法。原檔本來就公開可讀，下載一行 curl；只有寫入需要憑證。

**每一步都冪等**：輸出 key 由 media id 推導，重跑覆蓋自己；步驟 5 之前失敗，媒體庫看到的還是原檔。

---

## 6. ffmpeg 參數（實測過的那一組）

```bash
ffmpeg -nostdin -y -threads 4 -i "$SRC" \
  -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2" \
  -c:v libx264 -profile:v high -level:v 4.0 -preset medium -crf 21 \
  -maxrate 6M -bufsize 12M -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 128k -ac 2 \
  "$OUT"
```

- `min(1920,iw)` / `min(1080,ih)` + `force_original_aspect_ratio=decrease`：**直式影片也要對**。corpus 裡有 3 支 2160×3840，會縮成 1080×1920 而不是被壓扁。
- `level 4.0` + `yuv420p`：中階 Android 硬解得動。實測輸出確實是 level 40。
- `-preset medium`：**成本旋鈕**，CPU 是這裡唯一的帳單。實測 3.11×；要更小的檔就往 `slow` 調，代價是線性的 CPU 時間。
- `-movflags +faststart`：§0 那個硬性要求。
- `-nostdin`：不加的話 ffmpeg 會吃掉呼叫端的 stdin（我在做這份調查時被咬過一次）。

---

## 7. 檔案清單

### 新增

| 檔案 | 內容 |
|---|---|
| `docker/transcode/Dockerfile` | `linux/amd64`；ffmpeg + curl + awscli |
| `docker/transcode/transcode.sh` | §5 的 1–5 步。處理 `SIGTERM`：什麼都不做，讓它死，靠 §3 的掃描重跑 |
| `src/containers/TranscodeContainer.ts` | Container class（DO）。`onError`/`onStop` 把失敗寫回 media |
| `src/endpoints/transcodeMedia.ts` | `POST /members/media/:id/transcode`，形狀照 `processMediaImage.ts` |
| `src/lib/members/transcode-video.ts` | client：上傳完成後 best-effort 呼叫 |
| `scripts/transcode-existing-videos.ts` | 一次性回填，本機 Docker |

### 修改

| 檔案 | 改動 |
|---|---|
| `wrangler.jsonc` | `containers` + `durable_objects.bindings` + `migrations`（`new_sqlite_classes`），production/staging 各一份 |
| `src/collections/Media.ts` | 加 §3 的三個欄位，全部 `admin.readOnly` |
| `src/components/members/media/UploadDropzone.tsx` | 影片上傳後呼叫 endpoint |
| `src/components/members/media/MediaDetailDialog.tsx` | 顯示轉檔狀態 |
| 既有排程 worker | 加上租約過期掃描 |

**不動** `stream-ingest.ts` 和 `streamId`/`streamReady`。Stream 那條路留著但仍關閉。

---

## 8. 不覆蓋原檔

輸出寫新 key，原檔留著，`originalUrl` 記住它。

轉檔可能被 `SIGKILL` 中斷，覆蓋原檔等於有機會兩邊都沒有。而且要不要刪掉那 10.45 GB 的 4K 原檔，是你看過結果之後的決定，不是腳本的 —— AGENTS.md 的規則是破壞性操作只提出、不執行。

---

## 9. 分階段

**Phase 1 — 本機 Docker 回填既有 23 支。** 免費、不需要任何新基礎設施，而且會量到 Cloudflare 上的真實速度之外的另一個參考點。先 `--dry-run` 印對照表，跑完用 `ffprobe` 逐支驗 ≤1080p / H.264 / faststart。

**Phase 2 — Containers 接上新上傳。** wrangler 設定、Container class、endpoint、UI 狀態。先只開 staging。

**Phase 3 — 租約過期掃描。** 這是限制 (1) 的直接後果，不能省。沒有它，一次 host 重啟就會留下永遠卡在 `running` 的列。

---

## 10. 測試

照 `docs/testing-strategy.md`：**不寫瀏覽器測試去驗證 ffmpeg 會轉檔**（那是在測 vendor）。

| 層級 | 驗什麼 |
|---|---|
| 單元 | 輸出 key 推導、直式/橫式縮放計算、狀態機轉移（含 attempts 到頂 → failed） |
| 一次性腳本 | `--dry-run` 對照表要人看過；轉完 `ffprobe` 逐支驗 |
| Journey | 會員上傳影片 → 看到「轉檔中」→ 完成後可播 |
| 實機 | **必須在真手機上放一次**，iOS Safari + Android Chrome 各一 |

**驗收標準**：在 4G（不是 wifi）上 3 秒內開始播放且不中斷。現在 20 Mbps 的檔案做不到。

---

## 11. 還沒確認的事

- ~~帳號有沒有開 Containers、wrangler 支不支援~~ → **兩個都已確認可行**（2026-08-26）：
  - wrangler 4.112.0 有完整的 `wrangler containers` 指令組（list / info / build / push / images / ssh）
  - OAuth token 具備 `containers (write)` 與 `cloudchamber (write)`
  - **帳號不只開通，而且已經在用**：`face-detector` 的 prod / staging / dev 三個應用都是 `ready`，共 11 個 live instance。等於這個帳號上已經有一個可以照抄的成功案例
  - 帳號額度很寬鬆：並行 1,500 vCPU / 6 TiB 記憶體 / 30 TB 磁碟
  - 兩個要留意的：**帳號映像檔總量上限 50 GB**（face-detector 已經堆了不少 tag），以及下面那個頻寬上限
- **每個 instance 有 `bandwidth_limit_mbps: 100`**。這是從既有 container 的 API 回應讀到的實際值，不是文件寫的 —— 我沒有在文件裡找到它，也**沒有確認它會不會隨 instance type 變大**。§1 的成本已經照 100 Mbps 算過。
- **Docker daemon 沒有在跑**。CLI 是 29.6.2，但 daemon 連不上，Phase 1 要先把 Docker Desktop 開起來。
- **Cloudflare vCPU 的實際速度**。§1 是在我的 Mac 上量的；就算只有一半也還在免費額度內，但 Phase 2 第一支上傳要記錄真實數字。
- **staging 寫哪個 bucket**。staging 的 R2 是另一個 bucket，而遷移進來的媒體在 staging 是唯讀的 production URL。Phase 2 只開 staging 的話要先想清楚。
- **`media.filesize` 目前是 null**：direct upload 繞過 Worker，所有影片都沒記錄大小，配額計算一直漏算影片。回填腳本可以順手補 —— 既有缺陷，不是這個功能造成的。
- **單一 1080p 檔仍然沒有 ABR**。20 → 6 Mbps 對 4G 已是天差地別，但弱網仍可能卡。真正的解法是多 rendition + HLS，那基本上是自己重做一遍 Cloudflare Stream。先看 Phase 1 的結果再決定。

---

## 12. 附錄：去重（nice to have）評估

### 先講一個查出來的事：現在偵測不了重複

```
media 總數                548
filesize IS NULL          548   ← 全部
distinct url              548   ← 沒有完全相同的 URL
hash / checksum 欄位      不存在
```

**`filesize` 對 548 筆全都是空的**，而且不只影片 —— 連遷移進來的圖片也是。所以連「有沒有重複」這個問題，今天都答不出來，因為唯一便宜的指紋（大小）根本沒被記錄。

順帶：這代表 **`enforceStorageQuota` 的配額計算一直是壞的**。它按 owner 累加 bytes，而 bytes 全是 null。這是既有缺陷，比去重本身更值得先修。

### 指紋從哪來（這裡有個免費的機會）

兩條上傳路徑：

| 路徑 | 位元組經過 Worker？ | 怎麼拿到 hash |
|---|---|---|
| ≤32 MB（圖片為主） | 是 | Worker 直接 `crypto.subtle.digest('SHA-256')`，便宜 |
| >32 MB（影片） | **否**，直接進 R2 | 瀏覽器算 SHA-256 要把整支讀進記憶體（SubtleCrypto 沒有串流 API），1.17 GB 不可行 |

但是 —— **§5 的 container 已經把檔案下載到磁碟了**。加一行 `sha256sum` 幾乎免費。

所以：**去重的前置條件，剛好是轉檔功能的副產品。** 這是把它排在 Phase 2 之後的好理由，而不是另外做一套。

### 但「共用位元組」的去重我不建議做

真正的去重（兩列共用一個 R2 物件）會撞上三個現在規則很乾淨的東西：

1. **擁有權**。`media.owner` + `ownedOnlyPublicRead`。兩個會員上傳同一個檔，共用一列的話算誰的？
2. **刪除**。`delete: isOwner`，而 Payload 的 upload collection 會連檔案一起刪。共用物件就必須**引用計數**，否則 A 刪掉會弄壞 B 的。
3. **配額**。`enforceStorageQuota` 按 owner 算，共用的那份算誰頭上？

而最真實的重複情境正好最尷尬：**同一場比賽的兩個會員，把同一張在群組裡流傳的照片各自上傳一次** —— 他們兩個都會希望它在自己的媒體庫裡。

### 建議：只做偵測，不做共用

上傳時算 hash，如果**同一個 owner** 已經有一模一樣的檔案，就告訴他「你已經上傳過這個檔案」並提供改用既有那一份。

- 不需要引用計數
- 擁有權、刪除、配額三條規則完全不動
- 擋掉最常見的浪費（同一個人重複上傳）
- 跨會員的重複**不擋**，因為那是他們各自的素材

要做的話：

| 檔案 | 改動 |
|---|---|
| `src/collections/Media.ts` | 加 `contentHash`（text, index）、補 `filesize` |
| `src/lib/members/upload-image.ts` | ≤32MB 路徑：上傳前算 hash，先查同 owner 是否已有 |
| `docker/transcode/transcode.sh` | 順手 `sha256sum`，跟轉檔結果一起 PATCH 回去 |
| 回填腳本 | 為既有 548 筆補 `filesize` + `contentHash` |

**排序建議**：先補 `filesize`（修配額這個真 bug），再談 hash。去重本身放到轉檔上線之後 —— 那時指紋已經是免費的了。
