# POC：共享編輯器

設計與結論在 [`docs/shared-editor.md`](../../docs/shared-editor.md)。這裡是證據，以及怎麼重跑。

獨立的小專案，有自己的 `package.json`，**不屬於野馬營的建置**：不進 `pnpm typecheck`、不進 CI、
也不改兩個 repo 的任何檔案（步驟 2b 在複本上跑）。

```bash
# 野馬營要先 pnpm install（要用它的 node_modules 與原始碼）；jackywu.ca 只要 clone 下來
./run-all.sh <野馬營目錄> <jackywu.ca 目錄> [暫存目錄]
```

給了第三個參數才跑步驟 2b（完整 build jackywu.ca 兩次，約 2 分鐘）。

| 步驟 | 檔案 | 證明什麼 | 2026-09-24 的結果 |
|---|---|---|---|
| 0 | `census.mjs` | jackywu.ca 的內容由哪些語法構成 | 31 篇 MDX；17 種 JSX 元素 |
| 1 | `build-core.mjs` → `run-core.mjs` | 野馬營編輯器核心不需要 Payload / Next | 16 檔原樣打包，0 個 Payload/Next 模組；31/31 來回相同 |
| 2 | `mdx-adapter.mjs` + `roundtrip.mjs` | MDX ⇄ Lexical 不失真 | 語法樹 28/31 相同（另 3 篇是刻意的圖片分段） |
| 2b | `build-diff.sh` | 來回後的 MDX 能被 jackywu.ca build | 5 支檢查全綠；108 頁中 105 頁 HTML 逐位元組相同 |
| 3 | `minimal-diff.mjs` | 存檔只寫改過的地方 | 未編輯 31/31 逐位元組相同；改一段 25/26 只動一行 |
| 4 | `gpx-sandbox.mjs` | GPX 能在瀏覽器／Worker 裡處理 | 0 import、無 Node API 沙盒中輸出與 Node 相同 |
| 5 | `build-ui.mjs` → `mount-ui.mjs` | 編輯器 UI 不需要 Next | 20 檔原樣打包、只替換 4 個宿主模組；Chromium 中輸入、讀回正確、0 錯誤 |

`stubs/` 是步驟 1 與 5 用來替換宿主模組的最小替身。**被替換的模組清單就是共享套件的 `MediaPort`**。

## 這不是什麼

- 不是套件的雛形。`mdx-adapter.mjs` 為了量測寫得很緊，正式版要照設計文件 §4.4–4.5 重寫，
  帶型別與測試。
- 步驟 4 的 GPX 是合成的 6,000 點環線，因為 repo 裡從來沒有 GPX 原檔。它證明的是「能在哪裡跑」，
  不是準確度——準確度 jackywu.ca 已經對官方數據校準過（`docs/authoring.md`）。
