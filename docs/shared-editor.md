# 共享編輯器：野馬營 × jackywu.ca

> 調研與 POC 2026-09-24，設計 v2 2026-09-25。問題：野馬營的後台編輯器能不能變成兩個專案共用的模組，
> 讓 jackywu.ca（Astro 建置期靜態站）也用同一套編輯體驗，並支援上傳 GPX。
>
> **結論：可行。** 每一個「可行」都有一個跑得起來的證明，在
> [`poc/shared-editor/`](../poc/shared-editor/)，`./run-all.sh` 一次重現全部數字。

## v2 修訂：自我審查改了什麼

v1 寫完後以審查者的角度重讀一次，對著兩個 repo 的程式碼逐條驗證。改了十件事，每一件都有一個具體的理由：

| # | v1 的問題 | v2 |
|---|---|---|
| 1 | **自動存檔會變成 commit。** 野馬營的編輯器每隔 ≥30 秒把草稿寫進 Payload（`src/lib/members/autosave.ts`）。同一個行為接到 git 後端，就是每停頓一下 commit 一次 | 套件把「自動存檔」和「明確存檔」分成兩個呼叫；git 後端的自動存檔只寫瀏覽器本機，明確存檔才 commit（§4.6） |
| 2 | **軟換行在編輯器裡顯示成斷行，網站上卻不是。** 原始碼裡的換行，瀏覽器渲染成空白或（中文之間）什麼都沒有；v1 把它變成 Lexical 的換行節點，所見非所得 | 匯入時按瀏覽器的規則合併；Shift+Enter 是真正的硬換行。未編輯的段落照舊保留原始碼的換行（§4.5） |
| 3 | **野馬營的區塊在編輯器裡是隱形的。** `UnknownNode.decorate()` 回傳 `null`，所以匯入文章裡的程式碼區塊與 HTML 嵌入，作者編輯時**看不到它在哪裡**，只有預覽面板會畫。v1 把它當成「唯讀」，其實是「不可見」 | 這是野馬營從 M1 就能實際拿到的改善，列為 M2 的驗收條件（§5、§9） |
| 4 | **套件放獨立 repo，每修一個 bug 都要發佈一次。** 主要消費者（野馬營）有 10 條 journey 在守這個編輯器，發佈→升版的摩擦會讓人繞過它 | 套件放野馬營 repo 的 `packages/editor`，野馬營用 workspace 直接引用；由野馬營 CI 發佈到 npm 給 jackywu.ca 釘版本（§4.1、§11） |
| 5 | **圖片進 R2 是計劃裡對 build 流程最大的改動，v1 卻排在中間。** 量過：jackywu.ca 的圖片總共 16 MB、git pack 14 MB，放 git 裡再用幾年都沒問題 | 目標不變（R6），順序改變：先用寫進同一個 commit 的 `GitMedia`，編輯器零改動；R2 落地為獨立的後續里程碑（§8.1、§10） |
| 6 | **認證只靠 Cloudflare Access 擋在前面。** Access 設錯一次，`/api/*` 就是一個能寫你 repo 的公開端點 | Worker 自己驗 JWT 簽章與 audience，寫入端點再檢查 `Sec-Fetch-Site`；GitHub 憑證改用細粒度 PAT（§6.2） |
| 7 | **PR + auto-merge 的前置設定沒寫。** 需要 branch protection、必要檢查、允許 auto-merge 三項，缺一項就靜默失效 | 寫成設定清單；直接合併到 main 作為不設定時的退路（§7） |
| 8 | **MDX 解析失敗的檔案打不開。** `<!-- -->` 之類會讓 remark-mdx 拋錯（jackywu.ca 的 gotcha 自己就記著這條） | 解析失敗退回純原始碼編輯；存檔前做「重新解析必須等於編輯器狀態」的自檢（§4.5） |
| 9 | **schema 共用的細節錯了。** Astro 7 的 `astro:content` 給的是 zod **v4**（`astro/dist/zod.js` = `export * from 'zod/v4'`），後台若裝 zod v3 會是兩個不相容的型別 | 兩邊都從 `astro/zod` 引；表單直接由 `z.toJSONSchema()` 產生（§6.3） |
| 10 | **沒有工作量估計。** | 每個里程碑給了範圍（§10） |

POC 的數字（§2）沒有一個因此改變；改的是它們之上的設計。

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

**範圍：** 共享的是野馬營**會員區**的編輯器（`src/components/members/editor`）。野馬營 `/admin` 用的是
Payload 自己的 Lexical 編輯器，本計劃不碰它。

**考慮過而不採用的一條路：** 把 jackywu.ca 的編輯功能直接放進野馬營的會員區（例如 `/members/jackywu`），
寫進 jackywu.ca 的 repo。省掉整個後台，但把個人站綁在俱樂部站的登入、D1、staging → production 閘門上，
所有權也是錯的。既然編輯器本身能獨立（§2 步驟 5），沒有理由付這個耦合。

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

### POC 沒有證明的事

誠實列出，免得數字被讀得比它們能承擔的多：

- **圖片與影片的插入路徑沒有在 Next 之外跑過。** 步驟 5 用會拋錯的替身取代了四個媒體模組，
  證明的是「介面就這四個」，不是「換一個實作也能動」。這是 M1 的測試要補的。
- **區塊（`<Route>` 等）沒有在編輯器裡顯示過。** 它們以 `UnknownNode` 穿過，而那個 node 目前什麼都不畫（修訂 #3）。
- **軟換行的來回相同**（步驟 2 的 11 篇）建立在 v1「換行節點 ⇄ 原始碼換行」的對應上。v2 改了規則（§4.5），
  這 11 篇經過**編輯**的段落會被合併成一行；未編輯的段落不受影響，所以步驟 2b 的 108 頁結果不變。
- **GPX 用的是合成軌跡**，repo 裡從來沒有原檔。證明的是能在哪裡跑，不是準確度——準確度 jackywu.ca 已對官方數據校準過。

### 過程中踩到、已經寫進設計的事

- **Lexical 必須只有一份。** POC 第一版讓 `lexical` 走 CommonJS 入口、`@lexical/rich-text` 走 ESM，
  bundle 裡出現兩份，Lexical 直接拒絕自己的 `HeadingNode`。這正是野馬營
  `scripts/assert-lexical-single-copy.mjs` 在防的事，共享套件要把它擴大到所有 `@lexical/*`（§4.1）。
- **野馬營的匯入器刻意把裸網址存成文字**（為了 YouTube 嵌入，見 `to-lexical.ts`）。原樣寫回 MDX，
  remark 會跳脫成 `https\://`，連結就沒了。jackywu.ca 的 adapter 匯出時要把裸網址還原成 GFM 自動連結。
- **清單項目裡放區塊**（表格、程式碼、第二段）Lexical 表示不了。野馬營的匯入器會把它**搬到清單後面**——
  對 jackywu.ca 那是改寫內容。adapter 的規則改成：**表示不了的，整塊原樣保留成原始碼**，
  跟野馬營 `UnknownNode` 是同一個原則，只是用在 MDX 上。
- **表格對齊用字元數算**，中文全形字會被算歪；序列化時關掉（`tablePipeAlign: false`）。
- **remark 的跳脫過度保守。** `transaction_id` 會被寫成 `transaction\_id`（`mdast-util-to-markdown` 對片語裡的
  `_` 一律跳脫）。渲染結果相同，但原始碼難看。最小差異存檔把它限制在被編輯的段落；
  正式版要不要自訂序列化器，看實際出現的頻率再決定，不預先做。

---

## 三、整體架構

```
 野馬營 repo
 ┌─ packages/editor ──────────────────────────────────────┐
 │  @jackywxd/content-editor（共享套件，由野馬營 CI 發佈到 npm）  │
 │  core   : Lexical nodes、序列化、UnknownNode                │
 │  react  : ContentEditor、工具列、slash、拖曳、區塊            │
 │  ports  : MediaPort · BlockRegistry · AiPort · SavePort    │
 │  mdx    : MDX ⇄ Lexical（含最小差異存檔）                     │
 └───────────┬──────────────────────────────┬───────────────┘
   workspace │                        npm 釘版本 │
             ▼                                  ▼
 wildrunner.org（其餘不變）              admin.jackywu.ca（新，在 jackywu.ca repo 的 admin/）
 Next + Payload + D1                    Vite SPA + 一支 Worker，Cloudflare Access 登入
 PayloadMedia / PayloadAi               GitMedia（v1）→ R2Media（後續）
 內容 → Payload REST → D1               內容 → MDX adapter → GitHub API
                                                 │ 一個 commit（MDX / YAML / SVG / 圖）
                                                 ▼
                                        jackywu.ca repo
                                        PR → ci.yml（build + 5 檢查 + 預覽）
                                        merge → deploy.yml → jackywu.ca
      R2 jackywu-gpx（私人）  ◄── GPX 原檔 ──┘
      R2 zhuiyunzhuxue-media  ◄── 圖片（後續里程碑）
```

---

## 四、共享套件 `@jackywxd/content-editor`

名稱是暫定的。

### 4.1 位置與依賴

**放在野馬營 repo 的 `packages/editor`。** 野馬營用 pnpm workspace 直接引用（改編輯器、跑 journey、合併，
一個 PR 裡完成）；jackywu.ca 用 npm 上釘死的版本，由野馬營 CI 在打 tag 時發佈。
兩個 repo 都是公開的，安裝不需要任何憑證。

野馬營 repo 因此變成 workspace（根目錄 + `packages/*`）。這會改變 `node_modules` 的佈局，
而 Lexical 單一副本正是靠佈局保證的——所以 M1 的第一個驗收就是那支檢查在新佈局下仍然通過，
而且要先故意弄出兩份看它紅。

| 依賴 | 方式 | 理由 |
|---|---|---|
| `lexical`、`@lexical/*` | **peerDependencies，精確版本 `0.41.0`** | 必須跟 Payload 用同一份。Payload 的 `@payloadcms/richtext-lexical/lexical/*` 只是 `export * from 'lexical'`（`dist/lexical-proxy/lexical.js`），所以套件直接 import `lexical`，在野馬營解析到的就是 Payload 那一份 |
| `react`、`react-dom` | peer | 宿主提供 |
| `unified`、`remark-*` | 只有 `mdx` 子路徑用 | 野馬營只載 `core` + `react`，不會背到 remark-mdx |

**發佈編譯後的 ESM（tsup），不發佈原始碼。** 這樣 Next 不需要 `transpilePackages`，Vite 也不需要特別設定。
樣式是 Tailwind class：宿主的掃描路徑要加上套件的 `dist/`（野馬營 v3 的 `content`；後台 v4 的 `@source`），
顏色走既有的 CSS 變數（`--foreground` 等），兩站各自定義。
**兩個宿主各加一條測試：** 建置出來的 CSS 必須含有套件裡的一個哨兵 class——漏掉掃描路徑的症狀是
dev 正常、production 樣式被清掉，沒有測試不會有人發現。

**套件的測試是野馬營 CI 裡一個獨立的快速 job**，跟 e2e 平行，不需要 Next dev server、D1、Payload、seed：
POC 步驟 5 在純瀏覽器裡掛載整個編輯器只要幾秒。一個只改 `packages/editor` 的 PR 要在一分鐘內看到套件測試的結果，
e2e 照跑——快的訊號和整合的訊號在同一個 PR 上。

搬走編輯器的測試**不會**讓野馬營的 e2e 變快，先把這個期待放下。`e2e.yml` 的量測記錄：一個 shard 約 14 分鐘，
其中約 4 分鐘是與測試數量無關的固定成本（容器、安裝、migrate + seed、預熱 29 條路由），測試本身 7 分鐘裡
X-I18N 與 X-OG 兩個 sweep 佔 44%。編輯器相關的 11 個 journey 檔案裡，能搬進套件的只有 `editor-undo` 與
`editor-image-width` 兩三條（各 3–16 秒）；其餘測的是編輯器接上 Payload 之後的行為——自動存檔後從伺服器讀回、
匯入後建文章、賽記、Stream——那是整合測試，Payload 在哪它就得在哪。48 條單元測試會搬走，但它們今天跑在 6 秒的
unit lane 裡，本來就不是瓶頸。

**單一副本守衛**：把 `assert-lexical-single-copy.mjs` 的檢查從 `@lexical/table` 擴大成
「套件的 peer 版本 == `@payloadcms/richtext-lexical` 釘的版本」，兩個宿主的 CI 都跑。
升 Payload 時這支檢查會強迫套件同步升級——那正是 §9 風險 1 要擋的事。

### 4.2 從野馬營搬什麼、留什麼

POC 步驟 1 與步驟 5 量出來的邊界：

| 搬進套件 | 留在野馬營 |
|---|---|
| `src/lib/editor/nodes/*`、`serialize.ts`、`config.ts`、`object-id.ts`、`empty.ts`、`image-width.ts`、`markdown-transformers.ts` | `blocks.ts`（引用 Payload 的 `CodeBlock()` 與 `HtmlEmbedBlock`，是 Payload 設定） |
| `ContentEditor.tsx` 與全部 plugin（Slash、SelectionToolbar、FixedToolbar、Table、DraggableBlock、ImageInsert、VideoInsert、MarkdownHints）、`theme.ts` | `PostEditor.tsx`、賽記、封面等**文章表單**，以及自動存檔的**時機**（`autosave.ts`） |
| `src/lib/mdx-import/*`（成為 `mdx` 子路徑的匯入端；`resolve-embedded-images` 留在宿主，它要上傳） | `ContentPreview.tsx`（依賴野馬營的媒體網址、Stream 播放器與 YouTube 嵌入） |
| `src/lib/media/prepare-upload.ts` 與它依賴的 `downscale`、`dng-preview`（瀏覽器端的圖片前處理，兩站都要） | 配額、重複偵測、`processMediaImage`（Payload 端點） |
| AI 面板的 **UI**（`AIImprovePanel`、`AITypoPanel`、`AISummaryButton`、`ai-markers.ts`、`typos.ts`） | AI 端點本身（`src/endpoints/ai*.ts`） |

### 4.3 Ports：宿主要實作的介面

POC 步驟 5 只替換了 4 個模組就讓整個 UI 在 Next 以外跑起來。那 4 個就是 `MediaPort` 的全部表面：

```ts
/** 編輯器只存「媒體參照」，不知道它是 Payload id、git 路徑還是 R2 key。 */
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
今天它在會員編輯器裡走 `UnknownNode`，而 `UnknownNode.decorate()` 回傳 `null`——
一篇匯入的技術文，它的程式碼區塊在編輯畫面上**不存在**，只有旁邊的預覽面板會畫。
`BlockRegistry` 把它變成一個有類別、有表單、看得見的 node；這對野馬營是實際的改善，不只是為了 jackywu.ca。

jackywu.ca 的 MDX 元件直接映射成同一種 node：

| MDX | `blockType` | 區塊表單 |
|---|---|---|
| `<Route of from to at label caption show>` | `Route` | `of` 從 repo 的 routes 清單挑；預覽直接畫該路線的 `.profile.svg`（從 repo 讀），拖選公里段落 |
| `<Figure src alt caption wide priority>` | `Figure` | 圖從 MediaPort 挑；`import` 行由 adapter 管（見下） |
| `<Gallery images caption>` | `Gallery` | 同上，多張 |
| `<Video entry caption>` | `Video` | `entry` 從 reel 清單挑 |
| `<MissingImage original hint>` | `MissingImage` | 兩個文字欄 |
| `<InkRule />` | `InkRule` | 無 |
| ` ```lang ` | `Code` | **可編輯的程式碼區塊**；野馬營的 `blockType: 'Code'` 形狀不變，兩站共用 |
| 其他 JSX（手寫的 `<svg>`、`<img>`、`<style>`） | —（`mdx-jsx`） | 原始碼編輯框，失焦時用 remark-mdx 解析，解析失敗就不收 |
| `import …`、`{/* … */}` | —（`mdx-esm` / `mdx-expression`） | 不顯示，原樣保留 |

**屬性值存原始碼，不存求值結果**：`from={40}` 存成 `{expression: '40'}`。這樣寫回去逐字相同，
也不需要在後台執行任何 MDX。

**`Figure` / `Gallery` 的 import 由 adapter 管理**：區塊裡存 `src: './summit.jpg'`；匯出時產生
`import summit from './summit.jpg'` 並寫成 `src={summit}`；匯入時反過來解析。
import 區塊後面一定空一行（jackywu.ca 的 gotcha：少了那一行，下一行中文會被丟進 JS 解析器，整篇正文消失）。

### 4.5 `mdx` 子路徑：MDX ⇄ Lexical

```ts
importMdx(source: string): { frontmatter: string | null; content: LexicalJson; warnings; baseline } | { error, source }
exportMdx(doc, loaded: LexicalJson, baseline): string
```

- **匯入**：markdown 部分交給野馬營現成的 `mdastToLexical`；只補 MDX 有而 Payload 沒有的東西（§4.4 表格）。
- **解析失敗不等於打不開。** `<!-- -->`、沒關的標籤，remark-mdx 會拋錯（jackywu.ca 的 gotchas 自己就記著
  HTML 註解那條）。這時後台退回純原始碼編輯框，存檔照樣走 commit——一個檔案永遠有辦法從後台修好，
  不會因為一個字元而被鎖在外面。
- **軟換行按瀏覽器的規則處理。** 語料裡 11 篇、68 處在段落中間換行，硬換行 0 個。原始碼裡的換行，
  瀏覽器渲染成一個空白，而中文字之間（CSS Text 的 segment break 規則）什麼都沒有。
  編輯器裡就顯示成那樣：匯入時把換行合併（中文之間去掉，其餘變空白），
  **Shift+Enter 是真正的硬換行**，匯出成行尾 `\`。代價：被編輯的段落會寫回成一行，失去原始碼裡的手動折行；
  未編輯的段落由最小差異存檔原樣保留。v1 的做法（換行節點 ⇄ 原始碼換行）來回相同，
  但編輯器裡看到的斷行網站上不存在，那是所見非所得，比折行消失更糟。
- **匯出**：Lexical → mdast → `remark-stringify`（`remark-mdx` + `remark-gfm`，`tablePipeAlign: false`）。
  文字格式在 Lexical 是位元遮罩、在 mdast 是巢狀，用貪婪法重建巢狀：從目前位置開始，
  哪個格式延續最長就先開哪個。
- **最小差異存檔**：匯入時記下每個原始碼區塊變成了哪幾個 Lexical node、原文、以及它與前一塊之間的空白。
  存檔時，一組 node 若與開啟時完全相同，就寫回**原文**；只有改過的區塊重新序列化，並繼承原位置的空白。
  整份沒改 → 直接回傳原檔。這是 POC 步驟 3 的 31/31 與 25/26。

  這件事對 git 後端不是錦上添花：jackywu.ca 的內容也會被手改、被 Claude 翻譯，
  一個會把整份檔案重排的編輯器，會讓每一次存檔都跟那兩條路徑衝突。
- **存檔前的自檢**：把匯出的文字重新 `importMdx`，語法樹必須等於編輯器此刻的狀態；不等就拒絕存檔並顯示差異。
  序列化器的任何一個漏洞（跳脫、空白、巢狀格式）都會在這裡被抓到，而不是在 build 或在網站上。
  POC 的 `roundtrip.mjs` 做的就是這件事，只是離線做；正式版把它放進存檔路徑。
- **frontmatter 不進 Lexical**：原樣保存，由後台的表單編輯（§6.3）。沒動表單就一個位元組都不變。

### 4.6 `SavePort`：自動存檔與明確存檔是兩件事

野馬營的編輯器在停頓 3 秒後、且距上次至少 30 秒，會自動把草稿寫進 Payload（`autosave.ts`）。
這個時機邏輯留在野馬營；套件只提供一個介面：

```ts
export interface SavePort {
  /** 自動觸發。git 後端寫瀏覽器本機（IndexedDB），不 commit */
  autosave(doc: LexicalJson): Promise<void>
  /** 作者按下存檔。git 後端才 commit */
  save(doc: LexicalJson): Promise<void>
  /** 開啟時：本機有比 git 新的副本就問要不要還原 */
  recover(): Promise<LexicalJson | null>
}
```

野馬營的 `PayloadSave` 兩個方法都寫 `?draft=true`，行為跟今天完全一樣。
jackywu.ca 的 `GitSave.autosave` 不碰網路——否則寫一篇文章會在分支上留下幾十個 commit，
而且每一個都要走一次 GitHub API。

---

## 五、野馬營這一側的改動

內容格式、資料庫、Payload 設定**都不動**。只是搬家與換 import。

1. repo 變成 pnpm workspace，編輯器搬到 `packages/editor`（§4.1）。
2. `@payloadcms/richtext-lexical/lexical/X` → `lexical` / `@lexical/X`（語意相同，見 §4.1）。
3. 4 個宿主耦合點改成從 `MediaPort` 取：`UploadPreview`、`upload-image`、`upload-video`、`MediaPickerDialog`。
   現有實作原封不動地包成 `PayloadMedia`，留在野馬營。
4. AI 面板的 `fetch('/api/ai/…')` 改成 `AiPort`；`savePost` 包成 `PayloadSave`。實作都留在野馬營。
5. `@/components/ui/button` 與 `cn`：套件自帶一個極小的 `Button`。Tailwind 掃描路徑加上套件 `dist/`，
   外加哨兵 class 測試（§4.1）。
6. **匯入文章的程式碼區塊與 HTML 嵌入在編輯器裡變成看得見、可編輯的區塊**（§4.4）。
   `ContentPreview` 裡對應的兩個 `case` 保留，因為預覽面板是另一條渲染路徑。

---

## 六、admin.jackywu.ca

### 6.1 技術選型

**Vite + React SPA，由一支 Cloudflare Worker 提供靜態資產與 `/api/*`。** 不用 Next、不用 Payload、沒有資料庫。

- git 就是資料庫，草稿就是分支——不需要 D1。
- 只有一個使用者。**登入交給 Cloudflare Access**（Zero Trust，允許清單就是你的 email）。
  沒有帳號系統、密碼重設、session 要維護——野馬營 AGENTS.md 裡那一整節 `extractJWT` / CSRF 的坑在這裡不存在。
  但 Access 不是唯一的門，見 §6.2。
- **程式碼放在 jackywu.ca repo 的 `admin/`**，是 pnpm workspace 裡的另一個套件、另一支 Worker、另一個網域。
  這樣後台可以直接 import jackywu.ca 自己的 `scripts/lib/gpx.mjs` 與 content schema（§6.3），
  兩者永遠同一版本，不會「後台驗過、build 卻擋下」。
  公開站的 `dist/` 不受影響，**主站依然 0 JS 框架**——React 只存在於後台那支 Worker。

### 6.2 Worker API 與安全

| 端點 | 作用 | 用到 |
|---|---|---|
| `GET /api/entries` | 列出 tales / routes / reel / pages | GitHub Trees API |
| `GET /api/entry?path=` | 讀一篇（MDX 原文 + blob sha + 同資料夾的檔案清單） | GitHub API |
| `PUT /api/entry` | 存檔：一次 commit 寫入該篇所有變更檔案 | Git Data API（見 §7） |
| `POST /api/gpx` | GPX 原檔 → 私人 R2；衍生檔隨下一次存檔 commit | R2 binding `GPX` |
| `POST /api/publish` | 草稿分支 → PR + auto-merge（或直接合併，§7） | GitHub API |
| `GET /api/status?sha=` | 該 commit 的 CI / 部署狀態 | `GET /actions/runs?head_sha=` |
| `POST /api/media/image` | 圖片 → 公開 R2（後續里程碑；v1 圖片走 `PUT /api/entry` 進 git） | R2 binding `MEDIA` |

**三道門，每一道都假設前一道失效：**

1. Cloudflare Access 擋在網域前面。
2. Worker 對每個 `/api/*` 請求**自己驗證** `Cf-Access-Jwt-Assertion`：用團隊的 JWKS 驗簽章、比對這個
   Access application 的 `aud`、檢查 `email` 在允許清單。Access 設錯（或有人直接打 Worker 的 `workers.dev` 網址）
   時，這一層仍然擋著一個能寫你 repo 的端點。
3. 寫入端點檢查 `Sec-Fetch-Site: same-origin`。Access 的 cookie 是否隨跨站請求送出，取決於它的 SameSite 設定；
   這一行讓答案不重要。

**GitHub 憑證：細粒度 PAT，只授這一個 repo，`Contents: write`、`Pull requests: write`、`Actions: read`。**
存成 Worker secret，SPA 永遠拿不到。選 PAT 而不是 GitHub App 的理由：這是一個人的站，commit 以你的名義出現
本來就是對的；App 要做 JWT 簽章換 installation token，多一層沒有人受益的機制。
PAT 最長一年到期——**到期日寫進 Worker 的環境變數，到期前 30 天後台首頁顯示提醒**；否則第一個症狀是存檔 401。
兩種 token 推的 commit 都會觸發 workflow（只有 Actions 自己的 `GITHUB_TOKEN` 不會）。

### 6.3 編輯畫面

- **正文**：共享的 `ContentEditor`，接 `GitMedia` 與 jackywu.ca 的六個區塊。
- **frontmatter 表單由 schema 產生，不手寫。** 把 `src/content.config.ts` 裡的 zod 物件抽到
  `src/content.schema.ts`：從 `astro/zod` 引 `z`（Astro 7 的 `astro:content` 給的是 zod **v4**，
  後台必須用同一個，否則是兩套型別），`image()` 與 `reference()` 當參數傳入。
  `content.config.ts` 與後台都 import 它；表單從 `z.toJSONSchema()` 的輸出渲染，`.refine()` 在存檔前跑**同一份**：
  顯示寬度（中文算 2）、`hero` 必須配 `heroAlt`、`still` 必須 `shareable: false`……錯誤訊息就是 build 會印的那一句。
- **譯文**：`index.en.mdx` 是同一篇的第二個分頁；`.strict()` 擋住的欄位在表單上就不出現。
- **新文章**：等同 `pnpm new`——`date` 決定年份資料夾，CJK 標題必須給 slug（同一條規則，同一段程式）。
- **自動存檔**只寫 IndexedDB；重新開啟時若本機副本比 git 新，先問要不要還原（§4.6）。

### 6.4 v1 不做的事

- **影片上傳**：jackywu.ca 的影片流程是 ffmpeg 先驗來源、只 remux 或重編（`pnpm video`），瀏覽器做不了。
  v1 在正文裡只能挑既有的 reel 條目；影片照舊用 CLI。
- **刪除**：後台不刪任何檔案或 R2 物件。延續兩個 repo 的同一條規則——破壞性操作是提議，不是執行；
  孤兒交給既有的 `pnpm orphans` / `pnpm sync` 報告。
- **改網址**（改資料夾名）：等同刪加一篇，還牽涉 `_redirects`。v1 不提供，改 slug 走 git。

---

## 七、輸出與觸發 build（R3、R4）

**不需要新的觸發機制。** jackywu.ca 已經有：

- `ci.yml`：`on: pull_request` → build + 型別檢查 + 五支 postbuild 檢查 + E2E + `wrangler versions upload`（預覽版）
- `deploy.yml`：`on: push: main` → 同一支 build action → `wrangler deploy` → 線上 smoke

後台的輸出就是一個 commit，commit 本身就是觸發：

```
存草稿   → commit 到 admin/<年>/<slug> 分支     （分支推送不觸發任何 workflow：草稿不燒 CI）
發佈     → 開 PR，開啟 auto-merge
             ci.yml 跑完整 build 與全部檢查，回貼預覽網址
             綠 → 自動 merge → deploy.yml 部署 → smoke
             紅 → PR 停住，線上完全不受影響；後台讀 check run 顯示是哪一條擋下
```

**PR + auto-merge 需要三項 repo 設定，缺一項就靜默不合併：**
(1) main 的 branch protection 或 ruleset 要求 `ci.yml` 的 `Build` 為必要檢查；
(2) repo 設定開啟「Allow auto-merge」；(3) PAT 有 `Pull requests: write`。
M5 的驗收包含「故意關掉其中一項，後台要顯示卡在哪」。

**不想設定這三項的退路：** `POST /repos/{o}/{r}/merges` 直接把分支合併進 main。`deploy.yml` 會在部署前 build，
壞的內容上不了線；代價是沒有預覽網址，而且 main 會停在紅燈直到修好。

實作要點：

- **一次存檔 = 一個原子 commit**：Git Data API 依序建 blob → tree → commit → 移動 ref。
  MDX、YAML、三張 SVG、圖片在同一個 commit，不會出現「文章上去了、路線圖還沒」的中間態。
- **並發保護有兩層**：開啟時記下每個檔案的 blob sha，存檔時若分支上的 sha 已經變了（你在本機改過、
  或 Claude 翻譯過），拒絕並顯示兩邊差異；ref 更新用 `force: false`，兩個存檔同時進行時後到的那個會被 GitHub 拒絕，
  不會蓋掉先到的。
- `deploy.yml` 的 `concurrency: cancel-in-progress: false` 已經保證連發幾篇時部署會排隊，不會半途被取消。

---

## 八、圖片與 GPX 的儲存（R5、R6）

### 8.1 圖片：先進 git，R2 是後續里程碑

**兩個量過的事實：**

1. jackywu.ca 目前**文章圖片全部在 git 裡**（35 處引用、51 個檔案，跟文章同資料夾），總共 **16 MB**，
   整個 repo 的 pack 是 **14 MB**。R2 只放影片與音樂。所以「圖片放 R2」是一次改變，不是延續；
   而以這個站十年 28 篇的節奏，圖片留在 git 裡再用幾年也不會成為問題。
2. Astro content schema 的 `image()` 只接受本地檔案——`astro/dist/content/runtime-assets.js` 的 `createImage`
   用 `pluginContext.resolve` 找磁碟上的路徑，找不到就報 `Image … does not exist`；整個檔案沒有任何遠端分支。
   `hero` 正是走 `image()`（`Tale.astro` 的 `<Picture>`、`TaleCard`、微信首圖），所以 build **不能**直接吃 R2 網址。
   正文裡的 `![](https://…)` 雖然能 build，但會失去 AVIF/WebP 與尺寸資訊。

所以無論圖片存在哪裡，**build 時圖片都必須在文章資料夾裡**。這給了一個乾淨的分期：

**v1：`GitMedia`。** 上傳的圖片經瀏覽器端前處理（`prepare-upload`：HEIC 轉檔、縮圖、拒絕不能顯示的格式），
以 blob 寫進**同一個 commit**。MDX 寫法、build、五支檢查、CSP，**什麼都不用改**——今天就是這樣運作的。
編輯器看到的是 `MediaRef { relationTo: 'file', value: './summit.jpg' }`。

**後續：`R2Media`（R6 的目標）。** 同一個 `MediaRef`，位元組改放 R2，資料夾裡多一個對照表：

```
src/content/tales/2026/first-day-of-season/
  index.mdx          ![山頂的雲](./summit.jpg)      ← 不變
  media.json         { "summit.jpg": { "key": "img/2026/first-day-of-season/3f9a…c1.jpg",
                                       "sha256": "3f9a…", "bytes": 482113 } }
  summit.jpg         ← 不進 git；prebuild 從 R2 取回
```

- 新的 prebuild 步驟 `scripts/fetch-media.mjs`（排在 `fetch-fonts` 旁邊，`predev` 也跑）：讀所有 `media.json`，
  從 `media.jackywu.ca` 取回、**驗 sha256**、寫到資料夾。缺檔或雜湊不符就 exit 1——延續「檢查必須會失敗」的原則。
- R2 key 以內容雜湊命名，天然不可變，可以帶 `immutable` 快取；CI 以 `media.json` 的雜湊做 actions/cache。
- 圖片仍從網站自己的網域送出，`img-src` 的 CSP 不用動。
- `.gitignore` 加上「有 `media.json` 條目的檔名」；`pnpm orphans` / `pnpm sync` 要學會讀 `media.json`。
- **編輯器一行都不用改**——這是把 `MediaPort` 做成介面的直接回報，也是把它排在後面而不會欠債的原因。

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
  CLI 與後台都呼叫它，**同一個 GPX 在兩條路徑產出逐位元組相同的檔案**（M6 的驗收條件）。
- YAML 的 `gpx:` 欄位沿用，語意改為「私人 bucket 裡 `routes/<年>/` 下的檔名」。
  將來演算法改了要重算所有路線，用有金鑰的腳本從私人 bucket 讀回來重跑即可。
- 私人 bucket 只有後台 Worker 的 binding 能碰；`downloadable` 欄位目前沒有任何頁面使用，
  真要開放下載，再加一個帶簽章、有效期的 Worker 路由。
- 3.5 MB 的 GPX（TOR450 全段）遠在 Workers 請求上限之內，不需要分段上傳。

---

## 九、風險

| # | 風險 | 對策 |
|---|---|---|
| 1 | Payload 升級帶動 Lexical 升級，套件與野馬營的 Lexical 版本分叉 → 瀏覽器裡才爆的 "node not configured" | §4.1 的單一副本檢查在兩站 CI 都跑；套件在野馬營 workspace 裡，升 Payload 的 PR 同時升套件 |
| 2 | 抽離時動到野馬營正在運作的編輯器 | 內容格式不變、資料庫不動。以現有 journey 當驗收：`editor-autosave`、`editor-undo`、`editor-image-width`、`editor-preview`、`editor-ai-*`、`post-video`、`post-import`、`post-typography`、`race-report`，外加 unit 的 `mdx-import`、`image-width`；新增一條「匯入的程式碼區塊在編輯器裡看得見、改得動」 |
| 3 | 野馬營變成 workspace 改變 `node_modules` 佈局 | M1 第一個驗收：單一副本檢查在新佈局下通過，並先故意弄出兩份看它紅 |
| 4 | 兩站的需求往不同方向長，套件變成條件分支堆 | 差異一律走 Port 與 BlockRegistry；套件裡不准出現 `if (host === …)` |
| 5 | 套件的 Tailwind class 在某個宿主的 production 被清掉 | 兩站各一條哨兵 class 測試（§4.1） |
| 6 | 序列化器有漏洞，壞的 MDX 進了 git | 存檔前重新解析自檢（§4.5）；build 是第二道 |
| 7 | 後台與人工／Claude 同時改同一篇 | §7 的兩層並發保護 + §4.5 的最小差異存檔 |
| 8 | PAT 到期，存檔忽然 401 | 到期日進環境變數，到期前 30 天後台提醒（§6.2） |
| 9 | 自動存檔的本機副本與 git 分叉（換了瀏覽器、清了資料） | 只當作還原來源，永遠問過再用；git 永遠是權威 |

---

## 十、事項計劃

每一步都有能失敗的驗收條件；照兩個 repo 的規矩，驗收要先看它紅過一次。
工作量是估計，單位是專注的工作天，含測試。

| 里程碑 | 內容 | 驗收 | 估計 |
|---|---|---|---|
| **M0** ✅ | 本 POC | `poc/shared-editor/run-all.sh` | — |
| **M1** 建立套件 | 野馬營轉 workspace；`packages/editor` 收下 §4.2 左欄；import 改成 `lexical`；定義四個 Port 與 `BlockRegistry`；單一副本檢查擴大；套件測試 job；發佈流程 | 新佈局下單一副本檢查通過（先弄紅一次）；POC 步驟 1、3、5 轉成套件測試；用替身 `MediaPort` 走完一次圖片插入；只改 `packages/editor` 的 PR 一分鐘內看到套件測試結果 | 4–6 天 |
| **M2** 野馬營改用套件 | `PayloadMedia`、`PayloadAi`、`PayloadSave`；Code / HtmlEmbed 變成可見區塊；哨兵 class 測試；`editor-undo`、`editor-image-width` 與 48 條單元測試搬進套件；刪掉被搬走的原檔 | `pnpm typecheck`、`pnpm test:unit`、§9 風險 2 的全部 journey 綠燈；staging 上實際走一次 `docs/member-publish-flow.md` | 3–4 天 |
| **M3** MDX adapter 正式化 | §4.4 六個區塊的表單、import 管理、軟換行規則、解析失敗退路、存檔自檢；jackywu.ca 抽出 `content.schema.ts` | 語料 31 篇：未編輯存檔逐位元組相同；`build-diff.sh` 108 頁；每個區塊一條「改屬性 → build → 頁面反映」；一個含 `<!-- -->` 的檔案能開、能存 | 5–7 天 |
| **M4** 後台骨架 | `admin/` workspace、Worker、Access + JWT 驗證、PAT；列表／開啟／編輯／`GitMedia`／本機自動存檔／存草稿 | 改一篇草稿 → 分支上**一個** commit、diff 只有改的那幾行；上傳一張圖 → 同一個 commit；直接打 Worker 網址被 401；並發衝突被擋 | 5–7 天 |
| **M5** 發佈 | PR + auto-merge + 狀態顯示；三項 repo 設定 | 故意存 `excerpt` 太短的 → 後台先擋；繞過後台推同樣內容 → PR 紅、線上不變；正常的一篇 → 自動上線、smoke 綠；關掉一項設定 → 後台說出卡在哪 | 2–3 天 |
| **M6** GPX | 私人 bucket、瀏覽器解析、衍生檔 commit、SVG 模板抽成共用函式 | 同一個 GPX 走 `pnpm gpx` 與走後台，產出逐位元組相同 | 2–3 天 |
| **M7** 圖片進 R2 | `R2Media`、`media.json`、`fetch-media.mjs`、`orphans`/`sync` 認得 manifest | 乾淨 checkout 能 build 且五支檢查全綠；改掉一個 sha256 → build 失敗；編輯器套件 diff 為零 | 3–4 天 |
| M8（選用） | 51 張舊圖搬到 R2 | 搬遷前後 `dist/` HTML 逐位元組相同 | 1 天 |

M1 → M2 → M3 依序（M3 需要 M1 的 `BlockRegistry`）；M4 之後依序。全部約 **25–35 天**；
M1–M5 做完就有一個能用的後台，M6、M7 是各自獨立的增量。

---

## 十一、需要你決定的事

1. **套件放野馬營 repo 的 `packages/editor`，由野馬營 CI 發佈到 npm**（理由與量測在 §4.1）。
   獨立 repo 的好處是「編輯器的 PR 只跑編輯器的測試」，而這在 workspace 裡用一個獨立的快速 job 一樣拿得到，
   還多了同一個 PR 上的整合訊號；獨立 repo 則要到升版本那個 PR 才知道接不接得上，中間野馬營的 CI 綠的是舊版本。
   兩者都不會讓野馬營的 e2e 變快。選獨立 repo 的唯一理由是不想把野馬營轉成 workspace（風險 3）。
   不建議把兩站合併成 monorepo：CI、部署、地雷清單都完全不同。
2. **圖片先進 git，R2 排在 M7**（§8.1）。R6 仍是目標；只是順序。如果你希望從第一天就是 R2，
   M7 提前到 M4 之後，代價是後台能用的時間往後推一週。
3. **v1 不做影片上傳**（§6.4）。
4. **發佈預設走 PR**（§7），需要三項 repo 設定；不設定就用直接合併。
5. **jackywu.ca 要不要接 AI 功能**（`AiPort`）。`.env` 裡已經有 `ANTHROPIC_API_KEY`，接上成本很低；
   但它的翻譯規則是「在對話裡翻，不用腳本」，AI 潤稿要不要進後台是風格決定，不是技術決定。
6. **舊圖要不要搬到 R2**（M8）。不搬也完全能運作。
