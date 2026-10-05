# NTU Road Report

手機優先的臺大道路狀況回報工具。使用者可以用地圖標記位置、拍照或選擇照片、讀取 JPEG EXIF 拍攝日期與 GPS 座標，最後透過後端 proxy 將資料送到 NTU 公共設施報修表單。

本專案採 Cloudflare Pages 原生架構：

- `src/`：Vite + React 前端
- `functions/`：Cloudflare Pages Functions API
- `dist/`：Pages 靜態輸出目錄

## 功能

- 地圖預設在臺大校園，支援手機定位與點選地圖更新座標
- 回報狀況總覽為純前端 POC，以地圖呈現假資料地點、照片與描述
- 手機拍照按鈕位於照片區中下方，使用 `capture="environment"`
- 讀取 JPEG EXIF 的拍攝日期與 GPS 座標，沒有 EXIF 時改用檔案時間與手動定位
- 後端保留 NTU 表單 session、CSRF token 與 `CapId`
- Captcha 以 proxy 圖片顯示，使用者手動輸入 5 碼；目前資料庫模式仍顯示與要求輸入，但不送往 NTU 驗證
- 位置送出使用必填的 `LocationNote`、`Latitude`、`Longitude`，後端再格式化成 NTU 表單的 `Location`（例：`傅鐘前方柏油路：25.017340, 121.539750`）
- 送出欄位對應 NTU 表單的 `ApplicantPhone`、`Location`、`BrokenItemId`、`Reason`、`ImageFiles`、拍攝日期與 `CapAns`
- 學校接受報修後，把回報欄位存入 D1、照片存入 R2，並在 KV 建立不含聯絡資訊的報修索引
- 聯絡步驟可選擇是否讓本站儲存姓名、電話與 E-mail；預設關閉，關閉時 D1 的三個欄位均存 `opt-out`

## 介面配色

配色取自 [臺大學生會 logo](public/ntusa_logo/NTUSA_Logo_1.png)，統一在 [`src/globals.css`](src/globals.css) 的 `:root` 定義。

| 色彩 | 色碼 / CSS 變數 | 用途 |
| --- | --- | --- |
| Logo 青藍 | `#72B3C0` / `--brand` | 主要按鈕、目前步驟圓標底色、裝飾邊框 |
| Logo 深藍灰 | `#313646` / `--brand-dark`、`--foreground` | 標題、內文、青藍按鈕上的文字與圖示 |
| Logo 紅 | `#CD3846` / `--highlight` | 總覽地圖目前選取的標記 |
| 白色 | `#FFFFFF` / `--surface` | 頁首、卡片與地圖標記描邊 |
| 深青藍 | `#326975` / `--brand-ink` | 功能文字、圖示、地圖標記、選取邊框、鍵盤焦點框、成功訊息 |
| 淺青藍 | `#EAF4F6` / `--brand-soft` | 步驟選取背景、次要按鈕、狀態標籤 |
| 青藍邊框 | `#C6DFE4` / `--brand-border` | 次要按鈕與提示區塊邊框 |
| 懸停青藍 | `#88BFC9` / `--brand-hover` | 主要按鈕滑鼠懸停狀態 |
| 深紅 | `#B52E3B` / `--danger` | 錯誤訊息文字，搭配淡紅背景 |
| 灰白背景 | `#F4F7F8` / `--background` | 頁面底色 |
| 次要底色 | `#EDF3F5` / `--surface-soft` | 未選取步驟、返回按鈕及地圖載入底色 |
| 次要文字 | `#647079` / `--muted` | 說明文字與輸入提示 |

青藍原色搭配深藍灰文字，對比約為 **5.11:1**；小字或白底圖示使用深青藍衍生色。`--accent` 沿用青藍主色，`--accent-dark` 沿用深藍灰，`--success` 沿用深青藍。新增元件應優先使用這些變數，維持一致配色。

## 開發

```bash
npm install
npm run build
```

本機全端測試使用 `npm run dev:pages`，會啟動 Pages 靜態頁面與 Functions，並以 `ROAD_REPORT_KV`、`road-report-db`、`road-report-r2` 這三個 binding 名稱建立本機 KV、D1、R2。資料保存在忽略版控的 `.wrangler/state`，與 Dashboard 的正式資源分開。首次送出前先在本機 D1 建表：

本機 Wrangler 執行環境目前支援的最新 compatibility date 是 `2026-05-22`，因此 `dev:pages` 與 `wrangler.local.jsonc` 使用這個日期；Dashboard 的 Production／Preview 設定仍為 `2026-09-14`。

```bash
npx wrangler d1 execute road-report-db --config=wrangler.local.jsonc --local --persist-to=.wrangler/state --file=migrations/0001_reports.sql
npm run dev:pages
```

建立 `.env` 並填入 CARTO API key：

```bash
CARTO_API_KEY=your-carto-api-key
VITE_DEBUG_OUTPUT=false
```

這裡使用的是 CARTO Basemaps API key；本站 tile proxy 會依 CARTO Basemaps 新規格把它轉送為 `key` query parameter。

需要檢查地圖 tile proxy 時，可暫時把 `VITE_DEBUG_OUTPUT=true` 後重新 build；production 預設應維持關閉。

## Cloudflare Pages

Cloudflare Pages 設定：

- Project name: `road-report`
- Build command: `npm run build`
- Build output directory: `dist`
- 在 Cloudflare Pages Dashboard 管理專案設定與資源 binding
- Production 與 Preview 分別設定 `CARTO_API_KEY`、`REPAIR_SUBMIT_ENABLED`，以及需要使用的 KV、D1、R2 binding
- Compatibility date: `2026-09-14`；Compatibility flag: `nodejs_compat`

Pages Functions 使用的 Dashboard binding **變數名稱**如下。名稱須完全一致，且 Production、Preview 都要設定：

| 類型 | 變數名稱 | 用途 |
| --- | --- | --- |
| D1 | `road-report-db` | `reports` 表，儲存回報內容與照片索引；`school_case_number` 欄位預留給學校案號。 |
| R2 | `road-report-r2` | 以 `reports/{id}/photo` 為 key 儲存原始照片。 |
| KV | `ROAD_REPORT_KV` | 以 `report:{id}` 為 key 儲存不含聯絡資訊的報修狀態索引。 |

D1 建表 SQL 在 [`migrations/0001_reports.sql`](migrations/0001_reports.sql)；**部署網站不會自動建表**。本機使用上方的 `--local` 指令。正式 D1 使用下列指令，這會修改 Cloudflare 上的資料庫；請先確認登入的帳號與資料庫名稱：

```bash
npx wrangler d1 execute road-report-db --remote --file=migrations/0001_reports.sql
```

`wrangler.local.jsonc` 只供本機 D1 建表使用，其中 `database_id` 是固定的本機識別值，不是正式資源 ID。正式與 Preview binding 仍由 Dashboard 管理。

目前 [`functions/_lib/feature-flags.ts`](functions/_lib/feature-flags.ts) 的寫死開關 `FORWARD_TO_NTU = false` 會開放資料庫模式送出：仍取得學校 session、顯示 captcha 並要求輸入 5 碼，但**不把報修表單 POST 到學校，也不向學校驗證答案**；回報直接寫入 D1、R2、KV，沿用 `submitted` 狀態。資料庫模式不受 Dashboard 的 `REPAIR_SUBMIT_ENABLED` 影響。之後改為 `true` 時，才會轉送學校並由 `REPAIR_SUBMIT_ENABLED` 控制送出；先前記錄的回報不會自動補送。

一般模式只在 NTU 表單接受送出後儲存。D1、R2、KV binding 或資料表缺失時，API 會在送給 NTU 前回傳錯誤；如果 NTU 已接受但本站寫入失敗，畫面會明確告知「學校已收到」並提醒不要重複送出。`CapAns`、NTU session 與 CSRF token 不會寫入 D1、R2 或 KV。

`npm run build` 會產生 Vite 靜態輸出到 `dist/`。API 由 Cloudflare Pages 自動讀取 `functions/`，不需要 `_worker.js`。

本站不將 Cloudflare 資源 ID 寫入公開 repo。Pages 專案設定與 KV、D1、R2 binding 由 Dashboard 管理；新增或調整 binding 後需重新部署。`CARTO_API_KEY` 的值也只放在 Dashboard secret 與本機未追蹤的 `.env`。

本專案刻意不自動破解 captcha，只把 NTU 原表單的 captcha 接到本站顯示，仍由使用者辨識輸入。
