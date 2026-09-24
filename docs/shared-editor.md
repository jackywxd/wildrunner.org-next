# 共享編輯器：野馬營 × jackywu.ca

> 調研與 POC，2026-09-24。問題：野馬營的後台編輯器能不能變成兩個專案共用的模組，
> 讓 jackywu.ca（Astro 建置期靜態站）也用同一套編輯體驗，並支援上傳 GPX。
>
> **結論：可行。** 下面每一個「可行」都有一個跑得起來的證明，在
> [`poc/shared-editor/`](../poc/shared-editor/)，`./run-all.sh` 一次重現全部數字。

---

## 一、需求與約束

| # | 需求 | 來源 |
|---|---|---|
| R1 | 一套編輯器程式碼，兩站共用，編輯體驗一致 | 需求本身 |
| R2 | jackywu.ca 的後台是獨立網域 `admin.jackywu.ca`，技術棧不限 | 補充 |
| R3 | **後台的輸出必須能被 jackywu.ca 現有的 build 吃進去並產出網頁** | 補充（硬約束） |
| R4 | 後台輸出後要能觸發主站 build | 補充 |
| R5 | 能上傳 GPX；GPX 原檔放**私人** R2 | 補充 |
| R6 | 圖片放 R2 | 補充 |
| R7 | 內容的權威來源仍是 git 裡的 MDX / YAML | 已確認（選項「Git + MDX」） |

R7 決定了整個形狀：**共享的是編輯器，不是後端。** 野馬營的後端是 Payload + D1；
jackywu.ca 的「資料庫」是 git。兩邊各自接一個儲存 adapter，編輯器本身不知道內容最後去了哪裡。

---

## 二、POC 證明了什麼

全部對著兩個 repo 的**真實**程式碼與**真實**內容跑，不是示意。

| 步驟 | 要回答的問題 | 結果 |
|---|---|---|
| 1 | 野馬營編輯器的核心（node、序列化、MDX 匯入）能不能離開 Payload / Next 獨立運作？ | 16 個原始檔**一字未改**打包成功，bundle 裡 0 個 `@payloadcms` / `payload` / `next` 模組；jackywu.ca 31 篇經 Lexical 來回 **31/31 完全相同**；不認識的 node 型別原樣穿過 |
| 2 | MDX ⇄ Lexical 能不能不失真？ | 語法樹 **28/31 完全相同**；另外 3 篇是刻意的整形（見下） |
| 2b | **來回後的 MDX 能不能被 jackywu.ca build？（R3）** | `pnpm build` 通過，**五支 postbuild 檢查全綠**；108 頁中 **105 頁 HTML 逐位元組相同**，3 頁差異正是步驟 2 預測的那 3 篇 |
| 3 | 存檔會不會把整份檔案重新排版、在 git 裡製造雜訊？ | 不編輯直接存：**31/31 逐位元組相同**；改一段文字：**25/26 篇只動那一行** |
| 4 | GPX 能不能在瀏覽器／Worker 裡處理？ | jackywu.ca 的 `scripts/lib/gpx.mjs` **0 個 import**，打包 5 KB，在**沒有任何 Node API** 的沙盒裡跑，輸出與 Node 逐位元組相同 |
| 5 | 編輯器的 **UI** 能不能離開 Next.js？ | 野馬營真正的 `ContentEditor.tsx`（20 個原始檔、全部 plugin 與工具列）在純 Chromium 頁面掛載成功，markdown 快捷鍵（`## `、`**粗體**`）正常，讀回的文件正確，**0 個頁面錯誤** |

### 步驟 2 那 3 篇是什麼

三篇都是「一行字後面緊接一張圖，寫在同一段裡」：

```
Result:
![guangzhou marathon](./remote-2bd22828.png)
```

Lexical 的圖片是區塊，不能夾在文字行內，所以變成兩段。產出的 HTML 從
`<p>Result:<img></p>` 變成 `<p>Result:</p><p><img></p>`——字和圖都在，只是段落邊界。
這是 adapter 裡**唯一**一處刻意整形；而且有步驟 3 的最小差異存檔，**沒被編輯的段落不會被整形**，
只有作者動了那一段才會發生。

### 過程中踩到、已經寫進設計的事

- **Lexical 必須只有一份。** POC 第一版讓 `lexical` 走 CommonJS 入口、`@lexical/rich-text` 走 ESM，
  bundle 裡出現兩份，Lexical 直接拒絕自己的 `HeadingNode`。這正是野馬營
  `scripts/assert-lexical-single-copy.mjs` 在防的事，共享套件要把它擴大到所有 `@lexical/*`（見 §4.1）。
- **野馬營的匯入器刻意把裸網址存成文字**（為了 YouTube 嵌入，見 `to-lexical.ts`）。原樣寫回 MDX，
  remark 會跳脫成 `https\://`，連結就沒了。jackywu.ca 的 adapter 匯出時要把裸網址還原成 GFM 自動連結。
- **軟換行。** jackywu.ca 有 11 篇、68 處在段落中間換行（`keeper.mdx` 就是）。匯入器把它變成 Lexical 的
  換行節點；匯出時必須還原成**原始碼換行**，不是 `<br>`，否則這 11 篇全部多出硬換行。語料裡的硬換行是 0 個。
- **清單項目裡放區塊**（表格、程式碼、第二段）Lexical 表示不了。野馬營的匯入器會把它**搬到清單後面**——
  對 jackywu.ca 那是改寫內容。adapter 的規則改成：**表示不了的，整塊原樣保留成原始碼**，
  跟野馬營 `UnknownNode` 是同一個原則，只是用在 MDX 上。
- **表格對齊用字元數算**，中文全形字會被算歪；序列化時關掉（`tablePipeAlign: false`）。

---

## 三、整體架構

```
                     ┌──────────────────────────────────────────┐
                     │  @jackywxd/content-editor（新的共享套件）      │
                     │  core   : Lexical nodes、序列化、UnknownNode   │
                     │  react  : ContentEditor、工具列、slash、拖曳…   │
                     │  ports  : MediaPort · BlockRegistry · AiPort  │
                     │  mdx    : MDX ⇄ Lexical（含最小差異存檔）         │
                     └───────────────┬──────────────┬───────────────┘
                                     │              │
         ┌───────────────────────────┘              └───────────────────────────┐
         ▼                                                                      ▼
 wildrunner.org（不變）                                        admin.jackywu.ca（新）
 Next + Payload + D1                                          Vite SPA + 一支 Worker
 PayloadMedia 實作 MediaPort                                    R2Media 實作 MediaPort
 內容 → Payload REST → D1                                       內容 → MDX adapter → GitHub API
                                                                        │ commit（MDX/YAML/SVG + media.json）
                                                                        ▼
                                                              jackywu.ca repo
                                                              PR → ci.yml（build + 5 檢查 + 預覽）
                                                              merge → deploy.yml → jackywu.ca
      R2 zhuiyunzhuxue-media（公開，media.jackywu.ca）◄── 圖片 ──┤
      R2 jackywu-gpx（私人，不綁網域）             ◄── GPX 原檔 ──┘
```

---

## 四、共享套件 `@jackywxd/content-editor`

名稱是暫定的。

### 4.1 依賴

| 依賴 | 方式 | 理由 |
|---|---|---|
| `lexical`、`@lexical/*` | **peerDependencies，精確版本 `0.41.0`** | 必須跟 Payload 用同一份。Payload 的 `@payloadcms/richtext-lexical/lexical/*` 只是 `export * from 'lexical'`（`dist/lexical-proxy/lexical.js`），所以套件直接 import `lexical`，在野馬營解析到的就是 Payload 那一份 |
| `react`、`react-dom` | peer | 宿主提供 |
| `unified`、`remark-*` | 只有 `mdx` 子路徑用 | 野馬營只載 `core` + `react`，不會背到 remark-mdx |

**單一副本守衛**：把 `assert-lexical-single-copy.mjs` 的檢查從 `@lexical/table` 擴大成
「套件的 peer 版本 == `@payloadcms/richtext-lexical` 釘的版本」，兩個宿主的 CI 都跑。
升 Payload 時這支檢查會強迫套件同步升級——那正是 §9 風險 1 要擋的事。

### 4.2 從野馬營搬什麼、留什麼

POC 步驟 1 與步驟 5 量出來的邊界：

| 搬進套件 | 留在野馬營 |
|---|---|
| `src/lib/editor/nodes/*`、`serialize.ts`、`config.ts`、`object-id.ts`、`empty.ts`、`image-width.ts`、`markdown-transformers.ts` | `blocks.ts`（引用 Payload 的 `CodeBlock()` 與 `HtmlEmbedBlock`，是 Payload 設定） |
| `ContentEditor.tsx` 與全部 plugin（Slash、SelectionToolbar、FixedToolbar、Table、DraggableBlock、ImageInsert、VideoInsert、MarkdownHints）、`theme.ts` | `PostEditor.tsx`、賽記、封面等**文章表單** |
| `src/lib/mdx-import/*`（成為 `mdx` 子路徑的匯入端；`resolve-embedded-images` 留在宿主，它要上傳） | `ContentPreview.tsx`（依賴野馬營的媒體網址、Stream 播放器與 YouTube 嵌入） |
| AI 面板的 **UI**（`AIImprovePanel`、`AITypoPanel`、`AISummaryButton`、`ai-markers.ts`、`typos.ts`） | AI 端點本身（`src/endpoints/ai*.ts`） |

### 4.3 Ports：宿主要實作的介面

POC 步驟 5 只替換了 4 個模組就讓整個 UI 在 Next 以外跑起來。那 4 個就是 `MediaPort` 的全部表面：

```ts
/** 編輯器只存「媒體參照」，不知道它是 Payload id 還是 R2 key。 */
export interface MediaPort {
  /** 參照 → 預覽用資料。取代 UploadPreview 裡的 useMediaById + mediaImageSrc */
  useMedia(ref: MediaRef): { status: 'loading' | 'ready' | 'missing'; src?: string; width?: number; height?: number; kind: 'image' | 'video' }
  /** 取代 upload-image.ts；pending 狀態與「上傳中不能存」的規則留在套件裡 */
  uploadImage(file: File, signal: AbortSignal, onProgress: (p: number) => void): Promise<MediaRef>
  /** 取代 upload-video.ts；宿主可以不提供（jackywu.ca v1 不提供，見 §6.4） */
  uploadVideo?(file: File, signal: AbortSignal, onProgress: (p: number) => void): Promise<MediaRef>
  /** 取代 MediaPickerDialog */
  Picker: React.ComponentType<{ open: boolean; kind: 'image' | 'video'; onPick(ref: MediaRef): void; onClose(): void }>
}
export type MediaRef = { relationTo: string; value: string | number }   // 就是 upload node 已經存的兩個欄位

/** 宿主自己的區塊（jackywu.ca 的 <Route>、野馬營的 Code / HtmlEmbed） */
export interface BlockDefinition<F> {
  blockType: string
  label: string                     // 斜線選單上的名字
  icon?: React.ReactNode
  defaults(): F
  Editor: React.ComponentType<{ fields: F; onChange(f: F): void }>   // 區塊內的表單
  Preview?: React.ComponentType<{ fields: F }>
}

export interface AiPort {           // 選用；兩站都有 Anthropic key
  improve(text: string): Promise<string>
  fixTypos(text: string): Promise<TypoFix[]>
  summarise(text: string): Promise<string>
}
```

用法：`<EditorProvider media={…} blocks={[…]} ai={…}><ContentEditor … /></EditorProvider>`。
`ContentEditor` 的 `ownerId` prop 移除——「誰的媒體庫」是 `MediaPort` 實作自己的事。

**upload node 的形狀不變**（`{type:'upload', relationTo, value, fields}`），野馬營 D1 裡的內容一個位元組都不用遷移。
jackywu.ca 用 `relationTo: 'file'`、`value: './summit.jpg'`。

### 4.4 區塊：一個機制，兩種來源

野馬營的 `block` node（`{type:'block', fields:{blockType,…}}`）本來就是 Payload 的區塊形狀。
jackywu.ca 的 MDX 元件直接映射成同一種 node：

| MDX | `blockType` | 區塊表單 |
|---|---|---|
| `<Route of from to at label caption show>` | `Route` | `of` 從 repo 的 routes 清單挑；預覽直接畫該路線的 `.profile.svg`，拖選公里段落 |
| `<Figure src alt caption wide priority>` | `Figure` | 圖從 MediaPort 挑；`import` 行由 adapter 管（見下） |
| `<Gallery images caption>` | `Gallery` | 同上，多張 |
| `<Video entry caption>` | `Video` | `entry` 從 reel 清單挑 |
| `<MissingImage original hint>` | `MissingImage` | 兩個文字欄 |
| `<InkRule />` | `InkRule` | 無 |
| ` ```lang ` | `Code` | **可編輯的程式碼區塊**（見 §9 風險 4） |
| 其他 JSX（手寫的 `<svg>`、`<img>`、`<style>`） | —（`mdx-jsx`） | 原始碼編輯框，失焦時用 remark-mdx 解析，解析失敗就不收 |
| `import …`、`{/* … */}` | —（`mdx-esm` / `mdx-expression`） | 不顯示，原樣保留 |

**屬性值存原始碼，不存求值結果**：`from={40}` 存成 `{expression: '40'}`。這樣寫回去逐字相同，
也不需要在後台執行任何 MDX。

**`Figure` / `Gallery` 的 import 由 adapter 管理**：區塊裡存 `src: './summit.jpg'`；匯出時產生
`import summit from './summit.jpg'` 並寫成 `src={summit}`；匯入時反過來解析。
import 區塊後面一定空一行（jackywu.ca 的 gotcha：少了那一行，下一行中文會被丟進 JS 解析器，整篇正文消失）。

### 4.5 `mdx` 子路徑：MDX ⇄ Lexical

```ts
importMdx(source: string): { frontmatter: string | null; content: LexicalJson; warnings; baseline }
exportMdx(doc, loaded: LexicalJson, baseline): string
```

- **匯入**：markdown 部分交給野馬營現成的 `mdastToLexical`；只補 MDX 有而 Payload 沒有的東西（§4.4 表格）。
- **匯出**：Lexical → mdast → `remark-stringify`（`remark-mdx` + `remark-gfm`，`tablePipeAlign: false`）。
  文字格式在 Lexical 是位元遮罩、在 mdast 是巢狀，用貪婪法重建巢狀：從目前位置開始，
  哪個格式延續最長就先開哪個。
- **最小差異存檔**：匯入時記下每個原始碼區塊變成了哪幾個 Lexical node、原文、以及它與前一塊之間的空白。
  存檔時，一組 node 若與開啟時完全相同，就寫回**原文**；只有改過的區塊重新序列化，並繼承原位置的空白。
  整份沒改 → 直接回傳原檔。這是 POC 步驟 3 的 31/31 與 25/26。

  這件事對 git 後端不是錦上添花：jackywu.ca 的內容也會被手改、被 Claude 翻譯，
  一個會把整份檔案重排的編輯器，會讓每一次存檔都跟那兩條路徑衝突。
- **frontmatter 不進 Lexical**：原樣保存，由後台的表單編輯（§6.3）。沒動表單就一個位元組都不變。

---

## 五、野馬營這一側的改動

內容格式、資料庫、Payload 設定**都不動**。只是搬家與換 import。

1. `@payloadcms/richtext-lexical/lexical/X` → `lexical` / `@lexical/X`（語意相同，見 §4.1）。
2. 4 個宿主耦合點改成從 `MediaPort` 取：`UploadPreview`、`upload-image`、`upload-video`、`MediaPickerDialog`。
   現有實作原封不動地包成 `PayloadMedia`，留在野馬營。
3. AI 面板的 `fetch('/api/ai/…')` 改成 `AiPort`，實作留在野馬營。
4. `@/components/ui/button` 與 `cn`：套件自帶一個極小的 `Button`，或從 Provider 注入。
   樣式用 Tailwind class，套件以原始碼發佈；宿主的 Tailwind `content` 加上套件路徑
   （野馬營 v3 是 `content`；後台若用 v4 是 `@source`）。顏色走既有的 CSS 變數（`--foreground` 等），
   兩站各自定義。

---

## 六、admin.jackywu.ca

### 6.1 技術選型

**Vite + React SPA，由一支 Cloudflare Worker 提供靜態資產與 `/api/*`。** 不用 Next、不用 Payload、沒有資料庫。

- git 就是資料庫，草稿就是分支——不需要 D1。
- 只有一個使用者。**認證交給 Cloudflare Access**（Zero Trust，允許清單就是你的 email），
  Worker 驗 `Cf-Access-Jwt-Assertion`。沒有帳號系統、密碼重設、session 要維護——
  野馬營 AGENTS.md 裡那一整節 `extractJWT` / CSRF 的坑在這裡不存在。
- **程式碼放在 jackywu.ca repo 的 `admin/`**，是 pnpm workspace 裡的另一個套件、另一支 Worker、另一個網域。
  這樣後台可以直接 import jackywu.ca 自己的 `scripts/lib/gpx.mjs` 與 content schema（§6.3），
  兩者永遠同一版本，不會「後台驗過、build 卻擋下」。
  公開站的 `dist/` 不受影響，**主站依然 0 JS 框架**——React 只存在於後台那支 Worker。

### 6.2 Worker API

| 端點 | 作用 | 用到 |
|---|---|---|
| `GET /api/entries` | 列出 tales / routes / reel / pages | GitHub Contents / Trees API |
| `GET /api/entry?path=` | 讀一篇（MDX 原文 + blob sha + 同資料夾的 `media.json`） | GitHub API |
| `PUT /api/entry` | 存檔：一次 commit 寫入該篇所有變更檔案 | Git Data API（見 §7） |
| `POST /api/media/image` | 圖片 → 公開 R2 | R2 binding `MEDIA` |
| `POST /api/gpx` | GPX 原檔 → 私人 R2；衍生檔隨下一次存檔 commit | R2 binding `GPX` |
| `POST /api/publish` | 草稿分支 → PR + auto-merge | GitHub API |
| `GET /api/status?sha=` | 該 commit 的 CI / 部署狀態 | `GET /actions/runs?head_sha=` |

秘密：GitHub App 私鑰（Worker secret）。App 權限只給這一個 repo：
`contents: write`、`pull_requests: write`、`actions: read`、`checks: read`。

### 6.3 編輯畫面

- **正文**：共享的 `ContentEditor`，接 `R2Media` 與 jackywu.ca 的六個區塊。
- **frontmatter 表單**：由 schema 產生。把 `src/content.config.ts` 裡的 zod 物件抽到
  `src/content.schema.ts`（純 zod，`image()` 當參數傳入），`content.config.ts` 與後台都 import 它。
  後台在存檔前跑**同一份** `.refine()`：顯示寬度（中文算 2）、`hero` 必須配 `heroAlt`、
  `still` 必須 `shareable: false`……錯誤訊息就是 build 會印的那一句。
- **譯文**：`index.en.mdx` 是同一篇的第二個分頁；`.strict()` 擋住的欄位在表單上就不出現。
- **新文章**：等同 `pnpm new`——`date` 決定年份資料夾，CJK 標題必須給 slug（同一條規則）。

### 6.4 v1 不做的事

- **影片上傳**：jackywu.ca 的影片流程是 ffmpeg 先驗來源、只 remux 或重編（`pnpm video`），瀏覽器做不了。
  v1 在正文裡只能挑既有的 reel 條目；影片照舊用 CLI。
- **刪除**：後台不刪任何檔案或 R2 物件。延續兩個 repo 的同一條規則——破壞性操作是提議，不是執行；
  孤兒交給既有的 `pnpm orphans` / `pnpm sync` 報告。

---

## 七、輸出與觸發 build（R3、R4）

**不需要新的觸發機制。** jackywu.ca 已經有：

- `ci.yml`：`on: pull_request` → build + 型別檢查 + 五支 postbuild 檢查 + E2E + `wrangler versions upload`（預覽版）
- `deploy.yml`：`on: push: main` → 同一支 build action → `wrangler deploy` → 線上 smoke

後台的輸出就是一個 commit，commit 本身就是觸發：

```
存草稿   → commit 到 admin/<年>/<slug> 分支               （什麼都不上線）
發佈     → 開 PR，開啟 auto-merge
             ci.yml 跑完整 build 與全部檢查，回貼預覽網址
             綠 → 自動 merge → deploy.yml 部署 → smoke
             紅 → PR 停住，線上完全不受影響；後台讀 check run 顯示是哪一條擋下
```

幾個實作要點：

- **一次存檔 = 一個原子 commit**：Git Data API 依序建 blob → tree → commit → 移動 ref。
  MDX、YAML、三張 SVG、`media.json` 在同一個 commit，不會出現「文章上去了、路線圖還沒」的中間態。
- **並發保護**：開啟時記下每個檔案的 blob sha；存檔時若分支上的 sha 已經變了（你在本機改過、或 Claude 翻譯過），
  拒絕並顯示兩邊差異，不覆蓋。
- **GitHub App 開的 PR 會觸發 workflow**（只有 `GITHUB_TOKEN` 建立的不會）。repo 需要開
  「Allow auto-merge」，並把 `ci.yml` 的 build 設為 main 的必要檢查。
- `deploy.yml` 的 `concurrency: cancel-in-progress: false` 已經保證連發幾篇時部署會排隊，不會半途被取消。
- 想跳過 PR 直接 commit 到 main 也行，`deploy.yml` 會在部署前 build 並擋下壞的內容；代價是沒有預覽。預設走 PR。

---

## 八、圖片與 GPX 的儲存（R5、R6）

### 8.1 圖片：R2 存位元組，建置前落地

**先講一個事實**：jackywu.ca 目前**文章圖片全部在 git 裡**（35 處引用、51 個檔案，跟文章同資料夾），
R2 只放影片與音樂。所以「圖片放 R2」是一次改變，不是延續。

**另一個事實決定了做法**：Astro content schema 的 `image()` 只接受本地檔案——
`astro/dist/content/runtime-assets.js` 的 `createImage` 用 `pluginContext.resolve` 找磁碟上的路徑，
找不到就報 `Image … does not exist`。而 `hero` 正是走 `image()`——`Tale.astro` 用 `<Picture>` 產多尺寸、
`TaleCard` 用它做卡片，`docs/authoring.md` 也寫明它是微信抓取的首圖來源。所以 build 不能直接吃 R2 網址。

做法：**R2 是權威存放處，build 前把圖片落地到原本的位置。**

```
src/content/tales/2026/first-day-of-season/
  index.mdx          ![山頂的雲](./summit.jpg)      ← MDX 寫法完全不變
  media.json         { "summit.jpg": { "key": "img/2026/first-day-of-season/3f9a…c1.jpg",
                                       "sha256": "3f9a…", "bytes": 482113 } }
  summit.jpg         ← 不進 git；prebuild 從 R2 取回
```

- 新的 prebuild 步驟 `scripts/fetch-media.mjs`（排在 `fetch-fonts` 旁邊）：讀所有 `media.json`，
  從 `media.jackywu.ca` 取回、**驗 sha256**、寫到資料夾。缺檔或雜湊不符就 exit 1——
  延續 jackywu.ca「檢查必須會失敗」的原則。
- 之後的一切**完全不變**：`astro:assets` 的 AVIF/WebP、`hero` 的 `image()`、五支檢查。
- R2 key 以內容雜湊命名，天然不可變，可以帶 `immutable` 快取；CI 以 `media.json` 的雜湊做 actions/cache。
- `.gitignore` 加上「有 `media.json` 條目的檔名」這一類規則；現有 51 張照舊在 git 裡，兩種並存，
  **遷移舊圖是選項，不是前置條件**（§10 M7）。
- `pnpm orphans` / `pnpm sync` 要學會讀 `media.json`，否則會把這些圖當成孤兒或漏報。
- 後台上傳：瀏覽器端先做野馬營已有的處理（HEIC 轉檔、縮圖、EXIF——`src/lib/media/prepare-upload` 可以一起搬進套件）
  → 算 sha256 → Worker 寫進 R2 → `media.json` 在下次存檔時一起 commit。
  預覽：`R2Media.useMedia('./summit.jpg')` 查 `media.json` 得到 `https://media.jackywu.ca/img/…`。

### 8.2 GPX：原檔進私人 R2，衍生物進 git

jackywu.ca 本來就不把 GPX 放進 repo：`pnpm gpx` 從 `~/Downloads` 讀、只 commit 算出來的 YAML 與三張 SVG
（`gpx.mjs` 開頭寫得很清楚：「建置期不重新解析」）。後台照同一個分工，只是把「原檔在誰的筆電裡」
改成「原檔在私人 R2」。

```
拖入 .gpx
  → 瀏覽器用 jackywu.ca 自己的 gpx.mjs 解析（POC 步驟 4：零依賴、無 Node API、輸出與 CLI 相同）
  → 立刻顯示距離、爬升、路線輪廓、海拔剖面；填名稱／realm／region／date／badge 表單
  → 存檔：
      原檔  → R2 bucket jackywu-gpx（無公開網域）  key: routes/<年>/<slug>.gpx
      衍生  → 一個 commit：<slug>.yaml、.svg、.thumb.svg、.profile.svg
```

- 產生 SVG 的程式就是 `ingest-gpx.mjs` 那幾行模板；抽成 `scripts/lib/gpx.mjs` 的一個函式，
  CLI 與後台都呼叫它，**同一個 GPX 在兩條路徑產出逐位元組相同的檔案**（M5 的驗收條件）。
- YAML 的 `gpx:` 欄位沿用，語意改為「私人 bucket 裡 `routes/<年>/` 下的檔名」。
  將來演算法改了要重算所有路線，用有金鑰的腳本從私人 bucket 讀回來重跑即可。
- 私人 bucket 只有後台 Worker 的 binding 能碰；`downloadable` 欄位目前沒有任何頁面使用，
  真要開放下載，再加一個帶簽章、有效期的 Worker 路由。

---

## 九、風險

| # | 風險 | 對策 |
|---|---|---|
| 1 | Payload 升級帶動 Lexical 升級，套件與野馬營的 Lexical 版本分叉 → 瀏覽器裡才爆的 "node not configured" | §4.1 的單一副本檢查在兩站 CI 都跑；套件的 Lexical 版本跟著 Payload 走，Payload 升級 PR 必須連同套件一起升 |
| 2 | 抽離時動到野馬營正在運作的編輯器 | 內容格式不變、資料庫不動。以現有 journey 當驗收：`editor-autosave`、`editor-undo`、`editor-image-width`、`editor-preview`、`editor-ai-*`、`post-video`、`post-import`、`post-typography`、`race-report`，外加 unit 的 `mdx-import`、`image-width` |
| 3 | 兩站的需求往不同方向長，套件變成條件分支堆 | 差異一律走 Port 與 BlockRegistry；套件裡不准出現 `if (host === …)` |
| 4 | 程式碼區塊在野馬營是唯讀穿透（`code-block-not-editable`），jackywu.ca 有 14 篇技術文重度使用 | 套件新增可編輯的 Code 區塊；野馬營順帶得到同樣功能（shape 不變：`blockType: 'Code'`） |
| 5 | 軟換行：編輯器裡 Shift+Enter 會變成原始碼換行，渲染出來不是 `<br>` | 這與現有內容的語意一致（11 篇 68 處軟換行、0 個硬換行）。需要真正斷行時再加顯式 `<br />` 區塊 |
| 6 | 後台與人工／Claude 同時改同一篇 | §7 的 blob sha 並發保護 + §4.5 的最小差異存檔 |
| 7 | R2 圖片落地讓 build 多一次下載 | 內容雜湊 key + CI 快取；51 張現有圖不強制搬 |

---

## 十、事項計劃

每一步都有能失敗的驗收條件；照兩個 repo 的規矩，驗收要先看它紅過一次。

| 里程碑 | 內容 | 驗收 |
|---|---|---|
| **M0** ✅ | 本 POC | `poc/shared-editor/run-all.sh` |
| **M1** 建立套件 | 新 repo（或野馬營內的 `packages/`，見 §11）；搬 §4.2 左欄；import 改成 `lexical`；定義 Ports；單一副本檢查 | 套件自己的測試：POC 步驟 1、3、5 轉成正式測試（headless 來回、mount 後輸入） |
| **M2** 野馬營改用套件 | `PayloadMedia`、`PayloadAi` 實作；刪掉被搬走的原檔 | `pnpm typecheck`、`pnpm test:unit`、§9 風險 2 列的全部 journey 綠燈；staging 上實際走一次 `docs/member-publish-flow.md` 的流程 |
| **M3** MDX adapter 正式化 | §4.4 區塊表單、import 管理、可編輯 Code 區塊；jackywu.ca 抽出 `content.schema.ts` | jackywu.ca 語料：未編輯存檔 31/31 逐位元組相同；`build-diff.sh` 108 頁；每個區塊至少一條「改屬性 → build → 頁面反映」 |
| **M4** 後台骨架 | `admin/` workspace、Worker、Cloudflare Access、GitHub App；列表／開啟／編輯／存草稿 | 在 admin 改一篇草稿 → 分支上出現**一個** commit、diff 只有改的那幾行；並發衝突會被擋 |
| **M5** 發佈 | PR + auto-merge + 狀態顯示 | 故意存一篇 `excerpt` 太短的 → 後台先擋；繞過後台直接推同樣內容 → PR 紅、線上不變；正常的一篇 → 自動上線、smoke 綠 |
| **M6** 圖片進 R2 | `media.json`、`fetch-media.mjs`、後台上傳、`orphans`/`sync` 認得 manifest | 乾淨 checkout（沒有任何本地圖）能 build 且五支檢查全綠；改掉一個 sha256 → build 失敗 |
| **M7** GPX | 私人 bucket、瀏覽器解析、衍生檔 commit、SVG 模板抽成共用函式 | 同一個 GPX 走 `pnpm gpx` 與走後台，產出檔案逐位元組相同 |
| M8（選用） | 51 張舊圖搬到 R2 | 搬遷前後 `dist/` HTML 逐位元組相同 |

M1–M2 與 M3 可以平行；M4 之後依序。

---

## 十一、需要你決定的事

1. **套件放哪裡。** 建議**獨立的公開 repo，發佈到 npm**：兩個消費端都是公開 repo，
   Cloudflare 與 GitHub Actions 安裝不用任何憑證；兩邊釘精確版本。
   替代方案是放在野馬營 repo 的 `packages/editor`，用 git 依賴給後台——少一個 repo，
   但 jackywu.ca 的安裝會依賴野馬營 repo 的建置步驟，而兩站的 pnpm 主版本不同（10 vs 11）。
   不建議把兩站合併成 monorepo：CI、部署、地雷清單都完全不同，合併的成本遠大於收益。
2. **舊圖要不要搬到 R2**（M8）。不搬也完全能運作。
3. **v1 要不要做影片上傳**（§6.4）。建議不做。
4. **發佈預設走 PR 還是直接 main**（§7）。建議 PR，換到預覽網址與「紅了不上線」。
5. **jackywu.ca 要不要接 AI 功能**（`AiPort`）。`.env` 裡已經有 `ANTHROPIC_API_KEY`，接上成本很低；
   但它的翻譯規則是「在對話裡翻，不用腳本」，AI 潤稿要不要進後台是風格決定，不是技術決定。
