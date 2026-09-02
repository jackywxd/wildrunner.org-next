# 媒體功能改善方案（待 review）

**狀態**：設計，尚未實作。標「**實測**」的是這次在這台機器上跑出來的；其餘是讀原始碼推導的，來源檔案都寫在旁邊。

四項需求：

1. 媒體庫批量上傳、上傳時關聯比賽、有關聯媒體的比賽自動生成相簿
2. 每個媒體除了 `title` 還要有 `description`，前端要能呈現
3. 相簿提供更多 filter，例如按賽事
4. 相簿播放時可指定 YouTube 連結當背景音樂

---

## 0. 先講第一項：**已經做完了**

讀完整條路徑後，需求 1 的三件事在 `main` 上都已經存在。這不是「差不多」，是同一件事：

| 需求 | 現況 | 檔案 |
|---|---|---|
| 批量上傳 | `<input multiple>` + 佇列，逐檔進度條、可取消、可續傳、上傳前先比對指紋去重 | `src/components/members/media/UploadDropzone.tsx` |
| 上傳同時關聯比賽 | 佇列上方的「這些照片是哪一場比賽的（選填）」select，整批寫進 `media.raceEdition` | 同上，`uploadOne()` 兩條分支都帶 `raceEdition` |
| 有關聯媒體的比賽自動生成相簿 | **虛擬相簿**：`getRaceGalleries()` 把 `usage='gallery'` 且有 `raceEdition` 的媒體依賽事分組，合成 slug 為 `race-<eventKey>-<year>` 的相簿 | `src/lib/content.ts:1108`、`src/lib/race-gallery.ts` |

虛擬相簿會出現在 `/gallery` 的「依相簿」書架（`buildGalleryIndex([...galleries, ...raceGalleries], …)`），也可以直接打開 `/gallery/race-<key>-<year>`（`getGalleryBySlug` 找不到實體 row 時的 fallback）。`e2e/journeys/race-gallery.spec.ts` 的 `V-RACEALBUM-T1` 就是在測這件事。

**為什麼是虛擬而不是真的開一個 `galleries` row**：`src/lib/race-gallery.ts` 的檔頭寫得很清楚 —— 存一個 row 就等於讓「標籤」和「相簿」變成同一件事的兩個來源，第一次有人在 row 建好之後才補標籤就會分岔。這個 repo 已經為這個形狀付過一次錢（`race-schedule` 和 `race-editions` 的 R-DUPLICATE）。**建議維持虛擬相簿，不要改。**

> ⚠️ 我沒有在瀏覽器裡重新走一次這條路。以上是讀碼 + 既有 e2e 覆蓋的結論。要直接驗證：`pnpm db:reset:local`，起 `pnpm dev`，上傳兩張照片並選一場比賽，看 `/gallery` 的「依相簿」有沒有多一張卡。

**實測**（本機 D1，唯讀查詢）：

```
media 總數 546 / usage='gallery' 420 / 有 race_edition_id 的 0 / 相簿 20
```

本機語料**一張帶比賽標籤的媒體都沒有**。這件事會直接影響需求 3 —— 按賽事篩選在本機語料上會是一個空的下拉選單，所以那個測試必須自己造資料，不能靠現成語料。

### 0.1 那還剩下什麼？（§5 有細節）

三個缺口，都不是「沒做」而是「做得不夠」：

- **⚠️ 比賽選單只有 14 個選項，而且問錯了問題。** 這是最大的一個，`§1.5` 整節在講它 —— 選單是「已經開跑、而且有日期的屆次」，文章那邊問的是整份 catalogue（106 場 × 2010 起）。而且就算標上去了，讀取端還會把沒有日期的屆次過濾掉，照片不會出現在任何相簿裡。
- `choose()` 是 `setItems(...)` 直接**取代**佇列。用檔案選擇器時這跟瀏覽器行為一致，但**拖放第二批檔案會把第一批默默丟掉**。
- 比賽 select 是**整批一個值**，且上傳後只能一張一張進 dialog 改；媒體庫沒有批次編輯。

---

## 1. 現況地圖（改動會落在哪裡）

```
public /gallery  ──> page.tsx (revalidate 3600)
                     └─ buildGalleryIndex(galleries + raceGalleries, photos, videos)   src/lib/media/gallery-index.ts
                        ├─ albums[]      → AlbumCards
                        └─ items[]       → MediaGrid（第一頁 60 筆）
                                           └─ 捲動時打 /api/gallery/wall（同一份 buildGalleryIndex 重算）

public /gallery/[slug] ──> getGalleryBySlug → 實體相簿，找不到才落到虛擬比賽相簿
                           └─ PhotoGallery → MediaGrid（全部 items 都在手上，前端 arrange）

member /members/media ──> MediaLibrary
                          ├─ UploadDropzone（批量上傳 + 整批比賽 + 整批相片牆）
                          ├─ useMediaBrowse → /api/media（SQL 層篩選）
                          └─ MediaDetailDialog（alt / title / 相片牆 / 比賽 / 刪除 / 重轉檔 / 取封面）
```

兩邊**故意不共用查詢**：相片牆是「相簿成員 ∪ `media.usage`」在記憶體裡 union，媒體庫是 `/api/media` 在 SQL 裡篩。`src/lib/media/filters.ts` 的檔頭就是在講這件事 —— **共用詞彙，不共用機制**。下面每一項都遵守這條。

---

## 1.5 追加：**媒體的賽事選單只有 14 個選項，而且問錯了問題**

（2026-09-02 review 後補。這一節排在 B 前面做。）

### 現況，量出來的

**實測**（本機 D1，唯讀）：

```
race_editions 依年份： 2019×1  2023×1  2024×1  2025×1  2026×39  2027×38   （共 81）
有 start_date 的：77        ← 那 4 列舊的一列都沒有日期
start_date <= 今天的：14
```

`getRaceEditionOptions(now)`（`src/lib/content.ts:1220`）的 where 是 `startDate exists AND startDate <= today`。所以：

- 媒體庫的比賽下拉選單**只有 14 個選項**
- 那 4 個歷史屆次（2019 / 2023 / 2024 / 2025）**一個都不在裡面** —— 它們沒有日期

文章那邊問的是完全不同的問題。`RaceClaimFields` 問「系列 → 賽事 → 距離 → 年份」：賽事來自 **catalogue**（`race_events` 106 列），年份來自 `raceYearOptions()`，2010 到明年。

**這個 bug 這個 repo 已經寫下來過一次了**，只是當時修的是文章。`src/components/members/races/RaceClaimFields.tsx` 的檔頭：

> 在 2026-09-02 量的：每個環境的 `race_editions` 都只有 2026 和 2027（39 和 38 列；production、staging、local 一致），其中 14 場已經開跑。所以一個 2019 年跑過 UTMB 的會員可以在 /members/races 記錄它，卻沒辦法從他正在寫的那篇文章連過去 —— 編輯器只給他 2026，**看起來就像有人忘了關掉某個 filter**。

媒體庫就是那個還沒修的第二個入口。

### 還有第二層：就算標了，相簿也不會出現

`getRaceGalleries()`（`src/lib/content.ts:1115`）第一件事是 `getRaceEditionOptions(now)`，然後拿它當白名單過濾媒體：

```ts
if (editionId === undefined || !byId.has(editionId)) continue;
```

所以**標到一個沒有日期的屆次上的照片會被安靜地丟掉** —— 不進虛擬相簿，也不進 §3 那個賽事篩選選單。

而 find-or-create 造出來的歷史屆次**正好就是沒有日期的那種**：`RaceEditions.ts` 的檔頭寫明 `startDate` 是選填，理由就是要承載「會員記錄 2015 Hardrock」這種沒人知道日期的屆次。

**只修選單不修這裡的後果**：會員成功選了 2019 UTMB、存檔沒有任何錯誤、照片就是不出現在任何相簿裡。又貴又看不見。

### 修法（四塊，前三塊缺一不可）

**(1) 選單改問 catalogue 的問題**

重用 `RaceClaimFields`，加一個 `withDistance = true` 的 prop —— 一張照片不主張距離，`resolveRaceRecordRefs` 的 `distanceId` 本來就是選填。

**不要寫第二個 picker。** 那個元件的檔頭第一句就是「兩個入口用不同方式問同一件事，就是這個元件在修的 bug」；再寫一個就是第三個入口。

改動：
- `UploadDropzone`、`MediaDetailDialog` 的 select 換成 `RaceClaimFields`
- `/members/media/page.tsx` 改成 `getRaceCatalogueEvents()` 傳 `catalogueEvents`，跟 `posts/new/page.tsx` 一樣，不再傳 `raceEditions`
- 深連結 `?race=<eventKey>&year=<year>` 的預選變簡單了：直接組成一個 `RaceClaim`，不用再去 14 筆裡找

**(2) 寫入時 find-or-create 屆次**

`media.raceEdition` 是真外鍵，不能存字串。`resolveRaceRecordRefs()`（`src/collections/hooks/populate-race-record-refs.ts`）**已經就是這個 helper**：查 event key → 查 (event, year) → 沒有就 `payload.create` 只寫 `event` 和 `year`、`overrideAccess: true`、撞 unique 就重查。連「只寫 event 和 year，絕不寫日期或地點」這條限制都已經在它的檔頭裡。

新增一支 endpoint，形狀照 `src/endpoints/storageUsage.ts`，註冊進 `src/payload.config.ts` 的 `endpoints[]`：

```
POST /api/members/race-editions/resolve   { eventId, year } → { id }
```

- 沒有 `req.user` → 401
- **year 必須自己夾在 `EARLIEST_RACE_YEAR`(2010) 到明年之間，否則 400。** `resolveRaceRecordRefs` 本身沒有年份界線 —— RaceRecords 的界線來自那個 collection 自己的欄位驗證，這條路徑沒有那一層。不夾，就等於讓任何會員在公開的 `/races` 上建一列 9999 年
- `eventId` 不用另外驗：`resolveRaceRecordRefs` 找不到對應的 `race-events` 就回 `{}`，不會建任何東西

client：整批上傳前呼叫一次拿 id，之後照現在的方式寫 `raceEdition: id`；dialog 存檔前同理。

**為什麼是 endpoint 而不是 Media 的 beforeChange hook**：hook 需要 eventKey/year 兩個不落地的欄位跟著 media 走，`media.raceEdition` 就得從「單純的外鍵」變成「有時候是外鍵、有時候是一組宣稱」。endpoint 是零 schema 改動，而且和 `/api/members/media/[id]/process-image`、`/poster`、`/transcode` 同一個形狀。

**(3) 讀取端不要再拿「已開跑的屆次」當白名單**

`getRaceGalleries()` 現在是「撈 154 列屆次 → 和媒體取交集」。反過來問：

```ts
const docs = await getGalleryMedia()
const ids  = [...new Set(docs.map(editionIdOf).filter(isNumber))]
const editions = await payload.find({
  collection: 'race-editions',
  where: { id: { in: ids } },
  depth: 1,          // 要 event.key 和 event.nameZh
  pagination: false,
})
```

三個好處：沒有日期的屆次也會有相簿；查詢只碰真的被用到的屆次（通常個位數，不是 154）；§3 的賽事篩選選單吃同一份資料，兩邊不可能不一致。

`buildRaceGallery` 需要的 `event.key`、`year`、`nameZh ?? nameOverride ?? name` 在 depth 1 都拿得到，跟 `getRaceEditionOptions` 現在做的一樣。

**(4) 順手：改註解，不要改行為**

`src/components/race-schedule/RaceEntryRow.tsx` 有兩處註解寫著「和上傳選單同一個『已開跑』的界線（getRaceEditionOptions）」。那個界線其實是從 `race-schedule` 的日期算的，跟這個函式無關 —— 行為不用改，但註解在 (1) 之後會變成謊話。

### 測試

**unit**
- year 夾取：2009 → 拒絕，明年+1 → 拒絕，2015 → 通過

**contract**
- `POST /api/members/race-editions/resolve { eventId: 'other-hardrock', year: 2015 }` → 回一個 id
- 再打一次 → **同一個 id**（find-or-create 的冪等性；這是 `resolveRaceRecordRefs` 的競態重查那條路）
- 未登入 → 401；`year: 9999` → 400，而且**事後查 `race-editions` 沒有多出任何列**（只斷言 400 的話，一支「回 400 但還是建了」的實作會過）

**journey**
- `V-OLDRACE-T1`：會員上傳一張照片 → 選一個 2019 年的賽事 → 存 → `/gallery` 的書架出現那本相簿 → `/gallery/race-<key>-2019` 打得開。
  **這一支同時擋住 (1) 和 (3)**：只修了選單、沒修讀取端的話，它會在倒數第二步紅。這正是「一個斷言要看它為了它自己說的理由而紅」的用法。
  teardown 用建立時記下的 id 刪媒體。**那列 find-or-create 出來的 `race-editions` 不要刪** —— 它是共用資料，測試沒有把它從別人手上拿走的權利；而且不刪也不會讓下一輪失敗，find-or-create 第二次就是 find。

### 對其他章節的影響

- **§3.3**：賽事篩選的選項清單來源，從 `getRaceEditionOptions` 改成 (3) 的 by-id 查詢
- **§8 D1**：這一節就是 D1 的 (c) 加上一個沒人提到的讀取端 bug。如果你只想要這個，那 D1 選 (c)
- **§9**：新增 PR **A2**，排在 B 前面

---

## 2. 需求 2：`media.description`

### 2.1 為什麼不是重用 `alt`

三個欄位、三件事，這個 repo 已經為「兩個欄位合成一個」付過錢（見 `Media.ts` 裡 `title` 的檔頭）：

| 欄位 | 必填 | 給誰看 | 現有語料長什麼樣 |
|---|---|---|---|
| `alt` | ✅ | 螢幕閱讀器，描述畫面內容 | 遷移進來的影片是「相簿名 + 原檔名含副檔名」：`2023 - UTMB UTMB 2023 Vertical.m4v` |
| `title` | ❌ | 卡片標籤、分享頁標題 | 幾乎全為 NULL，`mediaDisplayName` 從 URL 推 |
| `description` | ❌ | **這張照片的說明／故事** | 新欄位，全 NULL |

拿 `alt` 當說明，等於「為了無障礙改一次文字，畫面上的說明就跟著被改掉」，而且現有 `alt` 的值本來就不是說明。

### 2.2 Schema

```ts
// src/collections/Media.ts，接在 title 後面
{
  name: 'description',
  type: 'textarea',
  label: { en: 'Description', 'zh-TW': '描述' },
  maxLength: 500,
  admin: {
    description:
      'What this photo or video is about. Shown in the lightbox caption and on its share page. Not alt text — see the field header.',
  },
}
```

- `textarea` 而非 `text`：說明是會換行的。
- `maxLength: 500`：**這個值要你確認**（見 §8 D4）。它同時是 payload 大小的上限 —— 相片牆一次送 60 筆，說明是跟著送的。
- **不建索引**：SQLite 不允許對有索引的欄位 `DROP COLUMN`，`down()` 就得重建整張表。跟 `usage`、`unusedSince`、`title` 同一個理由。

### 2.3 Migration

`src/migrations/2026xxxx_add_media_description.ts`，**照抄** `20260901_213000_add_media_title.ts` 的形狀（那個檔案自己註明：抄而不共用，因為已套用的 migration 是歷史紀錄）：

```ts
const ADD_COLUMN  = sql`ALTER TABLE \`media\` ADD \`description\` text;`
const DROP_COLUMN = sql`ALTER TABLE \`media\` DROP COLUMN \`description\`;`
const ALREADY_ADDED   = /duplicate column name/i
const ALREADY_DROPPED = /no such column/i
```

必須帶 `allMessages()` 走 `cause` 鏈 —— drizzle 的 `.message` 只有它自己的 `Failed query: ALTER TABLE …`，資料庫真正的抱怨在下面一兩層。**只讀 `.message` 的 matcher 等於沒寫**。

必須可以跑兩次：`next build` 用 worker pool 收集頁面資料，每個 worker 各自 boot Payload 各自套 migration（AGENTS.md 記錄的那次 staging 停機）。

`media` 沒有 drafts，所以**沒有** `_media_v` 影子表要一起加。（**實測**：`PRAGMA table_info(media)` 26 欄，`title` 已在；資料庫裡沒有 `_media_v`。）

### 2.4 讀取路徑（漏掉任何一步，欄位就是存了但永遠不顯示）

| 檔案 | 改什麼 |
|---|---|
| `src/lib/content.ts` | `GALLERY_MEDIA_SELECT` 加 `description: true` |
| `src/lib/media/gallery-mapping.ts` | `MediaCardDoc` 加 `description`；`mapMediaToPhoto` 回傳 `description: media.description ?? undefined` |
| `src/lib/media/site-video.ts` | `VideoMediaDoc` + `mediaToSiteVideo` 同上 |
| `src/lib/content-types.ts` | `SitePhoto.description?`、`SiteVideo.description?`、`SiteRaceEditionPhoto.description?` |
| `src/lib/media/public-fields.ts` | `PUBLIC_MEDIA_FIELDS` 加 `'description'` |
| `pnpm generate:types:payload` | 重新產 `payload-types.ts` |

`PUBLIC_MEDIA_FIELDS` 這一步很容易漏：`/gallery` 是 `revalidate = 3600` 的快取頁，`revalidateMedia.afterChange` 只在這個清單裡的欄位變動時才失效快取。不加，改完說明最多要等一小時才看得到。

### 2.5 會員怎麼填

`MediaDetailDialog.tsx`：在「顯示名稱」下面加一個 textarea，`data-testid="media-detail-description"`；`save()` 的 body 加

```ts
description: description.trim() || null,
```

`|| null` 而不是送 `""`：跟 `title` 同樣理由，「沒有人寫過」要能表示。

**不加在 UploadDropzone**：一次上傳 40 張，逐張寫說明不是上傳流程該做的事。

`pnpm assert:schema-screen` 不需要新增 mapping —— 它只管**必填**欄位，`description` 是選填。

### 2.6 前端呈現（三個地方）

1. **分享頁 `/gallery/m/[mediaId]`**：標題底下一段 `<p data-testid="media-description">`；`generateMetadata` 有說明時用它當 `description` 和 OG description，取代現在寫死的 `siteConfig.description`。這是四個需求裡最直接的效益 —— 分享出去的預覽會變成這張照片的說明。
2. **Lightbox caption**（`MediaGrid.tsx` 和 `RacePhotoWall.tsx`）：加 `Captions` plugin。
   ```ts
   import Captions from "yet-another-react-lightbox/plugins/captions";
   import "yet-another-react-lightbox/plugins/captions.css";
   // slides: { ..., title: label, description: item.description }
   // <Lightbox captions={{ showToggle: true, descriptionTextAlign: "start" }} … />
   ```
   **實測**：`node_modules/yet-another-react-lightbox@3.32.1` 的 `exports` 有 `./plugins/captions` 和 `./plugins/captions.css`，`dist/plugins/captions/` 檔案齊全。不需要裝任何東西。
   > 順帶修一個現存的死碼：`RacePhotoWall.tsx` 已經在 slides 上組了 `description: "${alt} · ${uploaderName}"`，但**沒有載入 Captions plugin，所以那段字從來沒有顯示過**。加上 plugin 之後它會開始出現 —— 這是行為改變，要在 PR 說明裡寫出來。
3. **`showToggle: true`**：說明蓋在照片上，看照片的人要能關掉它。

---

## 3. 需求 3：按賽事篩選

### 3.1 兩個面（不能用同一套機制，理由在 gallery-index.ts 檔頭）

- **相片牆（`view === "all"`）**：客戶端手上只有 60 筆，在瀏覽器裡篩會變成「顯示這 60 筆裡的 3 筆，然後說沒有了」。**必須在伺服器上、切片之前篩** —— 這正是 kind/sort 已經走 `/api/gallery/wall` 的原因。
- **書架（`view === "albums"`）**：卡片本來就全部在手上，客戶端篩。
- **單一相簿頁 `/gallery/[slug]`**：整本相簿都在手上，客戶端篩（`arrangeMedia` 已經是這個形狀）。

### 3.2 相簿的「賽事」從哪來 —— **推導，不新增欄位**

實體相簿沒有 `raceEdition` 欄位。看起來該加一個，但**不加**：一本相簿的賽事可以從它的成員推出來（成員身上就有 `media.raceEdition`），存一份就是第二個真相來源，第一次有人改了照片標籤而沒改相簿欄位就分岔 —— 跟 §0 拒絕實體比賽相簿是同一條理由。

所以 `albumCard()` 多算一個 `raceEditionIds: number[]`（這本相簿成員身上出現過的賽事 id 集合），虛擬比賽相簿自然只有一個。

### 3.3 具體改動

**型別**（`src/lib/content-types.ts`）
```ts
SitePhoto  += raceEditionId?: number
SiteVideo  += raceEditionId?: number
SiteAlbumCard += raceEditionIds: number[]
```
只送 id（一個數字），**不送賽事名稱**。名稱在選項清單裡送一次就好 —— `gallery-index.ts` 的檔頭記著 `/gallery` 曾經 663 KB 的那次，每一筆多帶一個字串是同一個錯誤的小號版本。

**`src/lib/media/gallery-index.ts`**（純函式，unit lane 測得到）
```ts
export type RaceFilterOption = { id: number; label: string; count: number }
export type WallArrangement = { kind: MediaKindFilter; sort: WallSort; race: number | null }

// arrangeMedia：先套 race，再套 kind，最後排序
// 新增 raceFilterOptions(items, editions): RaceFilterOption[]
//   —— 只列出「真的有東西」的賽事，label 用 `${year}　${nameZh ?? name}`（跟上傳 select 同一個寫法）
// buildGalleryIndex(galleries, photos, videos, editions) 多回一個 races: RaceFilterOption[]
```

**`src/app/api/gallery/wall/route.ts`**
```ts
// race 只接受正整數，其他一律當 all —— 跟 sort 的處理一致：
// 「query string 不是訪客簽過的合約，過期的書籤還是該看到相片牆」
const race = /^\d+$/.test(raw ?? "") ? Number(raw) : null
```
套在 `wallPage` 切片**之前**。

**`MediaGrid.tsx`**
- 新 prop `races?: RaceFilterOption[]`；空陣列就不畫控制項（本機語料就是這個情況）。
- `FilterSelect label="賽事" data-testid="gallery-filter-race"`。
- `applyArrangement(kind, sort, race)` 三個參數；換賽事一樣**重設到第一頁**（`setAccumulated([])`、`setCursor(null)`）。
- 空狀態文案的條件從 `kind === "all"` 改成 `kind === "all" && race === null`，否則「還沒有相片或影片。」會對一個只是篩空了的訪客說謊。

**`gallery-page-client.tsx` / `AlbumCards.tsx`**
- 書架自己一個 `FilterSelect data-testid="gallery-album-filter-race"`，純前端 `albums.filter(a => a.raceEditionIds.includes(race))`。

**`/gallery/[slug]/page.tsx`**
- 這本相簿成員身上出現的賽事 id → 對應 label，當 `races` 傳給 `PhotoGallery` → `MediaGrid`。

**`src/lib/content.ts`**
- 選項清單的來源是 **§1.5 (3) 那個 by-id 查詢**，不是 `getRaceEditionOptions` —— 否則歷史屆次（沒有日期的那些）會有照片卻不在篩選選單裡，篩選器就開始說謊。
- 那份 by-id 查詢包一層 `cache()`：`/gallery` 一次請求會問兩次（`getRaceGalleries` 一次、`races` 一次），`getGalleryMedia` 已經是這個做法。

### 3.4 為什麼不順手加「年份」「上傳者」

可以加，但先不加。賽事清單本來就是「有媒體的賽事」，本機是 0 筆、production 大概也是個位數；在清單短的時候多一層年份只是多一個控制項。等賽事選單真的長到要捲動再說。

---

## 4. 需求 4：相簿播放時的 YouTube 背景音樂

### 4.1 已經有的東西

`src/lib/youtube.ts` 已經有一個寫得很嚴的 parser：只認 8 個 host、只吐 11 字元 id、播放清單和頻道一律 null；`youTubeEmbedUrl()` 一律重建成 `youtube-nocookie.com`。檔頭那句是這一節的地基：

> 解析成 id 再重建 embed URL，而不是把作者的 URL 直接塞進 `<iframe src>` —— 第三方 frame 的 src 是唯一一個「一個亂字串會變成我們頁面上的任意外部來源」的地方。

`yet-another-react-lightbox` 的 `Slideshow` plugin **已經在用**，而且（**實測** `dist/plugins/slideshow/index.d.ts`）有 `slideshowStart` / `slideshowStop` callback 和 `SlideshowRef`。這就是掛音樂的位置，不需要自己做投影片。

專案**沒有設 CSP**（`next.config.ts` 的 `headers()` 只有 Cache-Control 那幾條），文章內的 YouTube 內嵌本來就在跑，所以沒有 header 要改。

### 4.2 Schema

```ts
// src/collections/Galleries.ts
{
  name: 'musicUrl',
  type: 'text',
  label: { en: 'Background music (YouTube)', 'zh-TW': '背景音樂（YouTube）' },
  admin: {
    position: 'sidebar',
    description: '貼一個 YouTube 影片連結。訪客播放投影片時當背景音樂，可以隨時關掉。',
  },
  validate: (value) =>
    !value || youTubeVideoId(value) !== null || '請貼一個 YouTube 影片連結（播放清單或頻道不行）',
}
```

`src/lib/youtube.ts` 是純函式、零依賴，從 collection config import 是安全的。

**存 URL、不存 id**：存管理員貼的東西，渲染時再過一次 `youTubeVideoId()`。這樣「作者的字串永遠不會抵達 iframe」這條規則只有一個地方在守。

相簿是**管理員在 `/admin` 編輯的**（`src/app/(site)/members` 底下沒有相簿 UI），所以這個欄位的控制項由 Payload 自己生，不需要寫表單，也不進 `assert:schema-screen`（它只管會員面的表單）。

### 4.3 Migration —— **這裡有一個 `media` 沒有的坑**

`galleries` 有 `versions: { drafts: true }`，所以除了 `galleries` 本身，**還有一張影子表要一起加欄位**。

**實測**（本機 D1 `.schema _galleries_v`）：影子表的欄位一律是 `version_` 前綴，例如 `version_name`、`version_event_date`、`version_owner_id`。所以：

```sql
ALTER TABLE `galleries`    ADD `music_url` text;
ALTER TABLE `_galleries_v` ADD `version_music_url` text;
```

兩句都要能吞 `duplicate column name`，`down()` 反序 drop 兩句、吞 `no such column`。漏掉影子表的後果是：存草稿時 drizzle 寫一個不存在的欄位 → `/admin` 存檔 500。

### 4.4 讀取與型別

```
GALLERY_SELECT += musicUrl: true
GalleryDoc     += musicUrl
SiteGallery    += musicVideoId?: string | null
mapPayloadGallery: musicVideoId: doc.musicUrl ? youTubeVideoId(doc.musicUrl) : null
```

跨到 client 的只有 11 個字元的 id。

### 4.5 播放器

新檔 `src/components/gallery/SlideshowMusic.tsx`（`"use client"`）：

```
props: { videoId: string; playing: boolean }
```

渲染一個**離屏但仍在版面裡**的 iframe（不要 `display:none` —— 被隱藏的 iframe 有被瀏覽器節流的風險）：

```
https://www.youtube-nocookie.com/embed/<id>?enablejsapi=1&loop=1&playlist=<id>&controls=0&playsinline=1&origin=<location.origin>
```

控制用 `postMessage`：

```ts
iframe.contentWindow?.postMessage(
  JSON.stringify({ event: "command", func: playing ? "playVideo" : "pauseVideo", args: [] }),
  "https://www.youtube-nocookie.com",
);
```

> ⚠️ **這一段必須在 dev 裡實際驗證，不能當作已知。** 我沒有驗過 `youtube-nocookie.com` + `enablejsapi=1` 是否接受不載入 `iframe_api` 的 postMessage 指令。
> **驗證方式**：起 dev，開一本有 musicUrl 的相簿，按播放，聽有沒有聲音、看 console 有沒有 rejected postMessage。
> **Fallback**：改用官方 `https://www.youtube.com/iframe_api` + `new YT.Player()`。可靠但有代價 —— 那支 script 本身就在 `youtube.com` 上設 cookie，`youtube-nocookie` 的意義就沒了（`src/lib/youtube.ts` 選 nocookie 的理由是「本站沒有 cookie 橫幅」）。真的要走 fallback，那個取捨要寫進註解。

### 4.6 接線（`MediaGrid.tsx`）

新 prop `musicVideoId?: string | null`，只有相簿頁會傳（`PhotoGallery` → `gallery.musicVideoId`）。相片牆沒有相簿，虛擬比賽相簿沒有可存欄位，兩者都沒有音樂（見 §8 D3）。

```ts
<Lightbox
  slideshow={{ ref: slideshowRef }}
  on={{
    view:          ({ index }) => { setIndex(index); /* 影片 slide → 暫停音樂 */ },
    slideshowStart: () => setMusicOn(!muted),
    slideshowStop:  () => setMusicOn(false),
  }}
  toolbar={{ buttons: [musicButton, shareButton, "close"] }}
/>
```

四條規則：

1. **音樂只在投影片播放時響。** `slideshowStart` 是使用者按下播放鍵才觸發 —— 那是一個 user gesture，所以瀏覽器的自動播放政策允許出聲。頁面載入時、lightbox 打開時都不出聲。
2. **一定要有開關。** WCAG 1.4.2：任何超過 3 秒的音訊必須有控制項。工具列一個 `data-testid="gallery-music-toggle"` 的按鈕，帶 `data-playing` 屬性（測試就斷言這個，不去驗 YouTube 有沒有真的發聲）。靜音選擇存 `sessionStorage`，關掉一次就不用在每本相簿再關一次。
3. **走到影片 slide 時暫停音樂**，離開再恢復。不然兩軌聲音一起放。
4. **`visibilitychange` 隱藏時暫停**，關閉 lightbox 時停止。

---

## 5. 需求 1 的兩個補丁（可選，零 schema）

1. **拖放要用 append 而不是取代**（`UploadDropzone.choose`）。現在第二次拖放會默默丟掉第一批。修法：以 `name+size+lastModified` 去重後併入既有佇列；`running` 時不接受新檔案。
2. **逐檔覆寫比賽**：佇列每一列多一個小 select，預設跟隨整批的值。一次匯入兩場比賽的照片就不用上傳兩輪。
3. **（比較大，另開一張）媒體庫批次編輯**：勾選 N 張 → 設定比賽／設定相片牆。這才是「上傳後才發現標錯」的解法。§8 D1 問你要不要。

---

## 6. Migration 與部署順序

### 6.1 三個新欄位、兩支 migration

| 檔案 | 動作 |
|---|---|
| `2026xxxx_add_media_description.ts` | `media.description` |
| `2026xxxx_add_gallery_music.ts` | `galleries.music_url` + `_galleries_v.version_music_url` |

一支一個關注點，各自冪等，都不建索引，`down()` 反序。兩支都要註冊進 `src/migrations/index.ts`。

### 6.2 紅線（AGENTS.md）

- **絕對不要跑 `pnpm build`。** 它會連上 production D1 並套用待處理的 migration。用 `pnpm build:staging`。
- **絕對不要用 `payload migrate:status` 看部署環境。** `NODE_ENV=production` 一連線就套 migration —— 「查狀態」本身就是寫入。要看就查：
  ```bash
  npx wrangler d1 execute wildrunner-org-next --remote --command "SELECT name, batch FROM payload_migrations ORDER BY id DESC LIMIT 5;"
  ```
- **動 production 之前先記錄還原點**：`wrangler d1 time-travel info wildrunner-org-next`。
- **staging 要能當彩排，得先有 production 的資料**：`pnpm sync:staging`，前後比對 row count。
- **如果這個 PR 被關掉**：欄位和 `payload_migrations` 的 row 會留在資料庫上（AGENTS.md 的 PR #25）。重開時要沿用同一個 migration 檔名。

### 6.3 每個 PR 的檢查清單

```bash
pnpm generate:types
pnpm typecheck
npx eslint src scripts e2e     # pnpm lint 會 OOM
pnpm test:unit
pnpm assert:tests
pnpm assert:schema-screen
pnpm db:reset:local            # 每次跑 e2e 之前，不是壞掉才跑
pnpm test:e2e
```

---

## 7. 測試計畫

每個測試先寫「它擋住哪一個又貴又看不見的失敗」，再挑**能觀察到那個失敗的最便宜層級**。

### unit（`e2e/unit/`，無伺服器無資料庫，~6s）

| 測試 | 擋住什麼 |
|---|---|
| `gallery-index.spec.ts`：`arrangeMedia` 的 race 分支 | 篩選器默默回傳全部 —— 畫面看起來正常，篩選根本沒作用 |
| 同上：`raceFilterOptions` 只列出真的有東西的賽事、count 正確 | 下拉選單列了 154 場比賽，選了 150 場都是空的 |
| `media-public-fields.spec.ts`：`description` 變動要回報 changed | 改完說明，快取頁一小時內不更新，而且沒人會把這兩件事連起來 |
| `youtube.spec.ts`：相簿音樂欄位的 validate | 貼了播放清單 URL 存進去，前端拿到 null，靜靜地沒有音樂 |

### contract（`apiTest`，不開瀏覽器）

| 測試 | 擋住什麼 |
|---|---|
| `GET /api/gallery/wall?race=<id>` 只回那場比賽，且 cursor 接得上第二頁 | 第一頁篩了、第二頁沒篩 —— 正是那支路由檔頭在警告的形狀 |
| `PATCH /api/media/:id { description }` 之後，公開路徑讀得到 | 欄位加了但忘了進 `GALLERY_MEDIA_SELECT`，值永遠是 `undefined`，而且不會報錯 |

### journey（瀏覽器，`e2e/journeys/`，從 `helpers/test` import）

| 測試 | 走法 |
|---|---|
| `V-DESC-T1` | 會員上傳一張照片 → 開 detail dialog → 打說明 → 存 → 開 `/gallery/m/<id>` 看到那段字。`afterEach` 用**建立時記下的 id** 刪除，pass/fail/throw 都要跑 |
| `V-GALLERYFILTER-T1` | 造兩張分屬不同賽事的照片 → 到 `/gallery` **用點的**選賽事 → 只剩那場的 → 空狀態文案是「沒有符合條件的項目」而不是「還沒有相片或影片」 |
| `V-BGM-T1` | 開一本有 musicUrl 的相簿 → 開 lightbox → 按投影片播放 → 音樂按鈕 `data-playing="true"` → 關閉 lightbox → 變 `false` |

三件事必須遵守：

- **不驗 YouTube 有沒有真的發出聲音。** 那是 vendor 的。我們驗自己的接線狀態。
- **自己造資料，不要靠現成語料。** 本機 0 筆帶比賽標籤的媒體（§0 實測），CI 的資料庫也是重建的。
- **每個斷言都要親眼看它紅過一次**：故意把 race 篩選改成回傳全部，看 `V-GALLERYFILTER-T1` 紅；改回來。沒紅過的斷言是還沒驗證的宣稱。

### 需要留意的雜訊

Lightbox 裡多一個 YouTube iframe，`e2e/helpers/test.ts` 的 console 守衛可能會抓到新的訊息。**先跑，看到再說** —— 那個 ignore list 的門檻是「app 不可能造成、也不可能阻止」，不是「現在在紅」。

---

## 8. 需要你決定的（我不替你決定）

**D1 — 需求 1 已經有了，你要的是哪一個？**
&nbsp;&nbsp;(a) 就是它，我不知道已經有 → 那第一項不用做
&nbsp;&nbsp;(b) 我要的是**媒體庫的批次編輯**（勾選 N 張，一次改比賽／相片牆）
&nbsp;&nbsp;(c) 我要的是**選得到更多比賽**（不只最近開跑的那 14 場）→ 這就是 §1.5，我已經當成要做的在排
&nbsp;&nbsp;(d) 我要比賽相簿變成**真的可以編輯的相簿**（可換封面、可排序、可寫簡介）→ 這會推翻 §0 的虛擬相簿設計，要另外談

**D2 — 說明要不要進 lightbox caption？** 進 caption 代表相片牆每頁 60 筆都要帶說明字串。不進的話，說明只在分享頁 `/gallery/m/<id>` 看得到，相片牆點開只有圖。（我的建議：進，但 `maxLength` 壓在 500。）

**D3 — 虛擬比賽相簿要不要也能有背景音樂？** 它沒有可存的 row。要的話得在 `race-editions` 加一個 `musicUrl`。（我的建議：先不要，等有人真的問。）

**D4 — `description` 的 `maxLength` 500 可以嗎？**

**D5 — 音樂預設行為**：按下投影片播放就出聲（有靜音鍵，靜音記在 sessionStorage）—— 還是一定要先按音樂鍵才出聲？（我的建議：前者，它才符合你說的「相簿在播放的時候」。）

---

## 9. PR 拆法與大小

| PR | 內容 | schema | 風險 |
|---|---|---|---|
| **A** | `media.description`：欄位 + migration + select/型別 + dialog textarea + 分享頁 + lightbox captions（含修好 RacePhotoWall 那段從沒顯示過的字） | `media.description` | 低。全新欄位、全 NULL、不改任何既有行為 |
| **A2** | §1.5 賽事選單改問 catalogue + `resolve` endpoint + `getRaceGalleries` 不再用「已開跑」當白名單 | 無 | 中。動到寫入路徑和虛擬相簿的分組；`V-RACEALBUM-T1` 要一起跑 |
| **B** | 按賽事篩選：item 帶 `raceEditionId`、`arrangeMedia` 加 race、wall route 加參數、兩個面各自的控制項 | 無 | 中。動到相片牆的分頁 cursor 路徑，`V-WALL` 那幾支要一起跑 |
| **C** | 相簿背景音樂：`galleries.musicUrl` + 影子表欄位 + `SlideshowMusic` + lightbox 接線 | `galleries.music_url`、`_galleries_v.version_music_url` | 中。影子表漏掉會讓 `/admin` 存草稿 500；postMessage 那條要先在 dev 驗 |
| **D**（可選） | §5 的上傳佇列補丁 | 無 | 極低 |

順序 **A2 → A → B → C**。A2 排最前面是因為它是你實際碰到的問題，而且 §3 的篩選選單和它共用同一份屆次解析 —— B 先做的話會蓋在一個還會過濾掉歷史屆次的讀取端上面。A 和其餘各支都沒有相依，C 最後（唯一需要外部服務行為驗證的一支）。D 隨時可插。

依 AGENTS.md 的規矩：每一個 PR 開之前都先在 `pnpm dev` 上**真的走一次那條路** —— 登入、點、存、重整。「編得過」不是這裡在主張的事情。
