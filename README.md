# NTU Road Report

手機優先的臺大道路狀況回報工具。使用者可以用地圖標記位置、拍照或選擇照片、讀取 JPEG EXIF 拍攝日期與 GPS 座標，最後透過後端 proxy 將資料送到 NTU 公共設施報修表單。

本專案是單一 Cloudflare Worker：

- `src/`：Vite + React 前端，build 到 `dist/`，由 Worker 以 Static Assets 提供
- `worker/index.ts`：Worker 入口，`fetch` 處理 `/api/*`，`scheduled` 執行排程同步
- `worker/api/`：各 API handler；`worker/lib/`：NTU 表單、儲存與共用工具
- `worker/sync.ts`：Cron 同步臺大案件狀態
- `wrangler.toml`：Worker、Static Assets、KV、R2 與 Cron 設定

## 功能

- 地圖預設在臺大校園，支援手機定位與點選地圖更新座標
- 回報狀況總覽只讀本站 KV：顯示最新 100 件回報的位置、描述與 R2 照片，以及累計總件數
- 已連結臺大案件的回報，卡片下方以階段列標示校方狀態與不受理／退件說明（如有）；狀態由排程定期更新
- 手機拍照按鈕位於照片區下方，使用 `capture="environment"`
- 讀取 JPEG EXIF 的拍攝日期與 GPS 座標，沒有 EXIF 時改用檔案時間與手動定位
- 後端保留 NTU 表單 session、CSRF token 與 `CapId`
- Captcha 以 proxy 圖片顯示，使用者手動輸入 5 碼；目前資料庫模式仍顯示與要求輸入，但不送往 NTU 驗證
- 位置送出使用必填的 `LocationNote`、`Latitude`、`Longitude`，後端再格式化成 NTU 表單的 `Location`（例：`傅鐘前方柏油路：25.017340, 121.539750`）
- 送出欄位對應 NTU 表單的 `ApplicantPhone`、`Location`、`BrokenItemId`、`Reason`、`ImageFiles`、拍攝日期與 `CapAns`
- 送出後把回報存入 KV、照片存入 R2
- 轉送臺大成功時，擷取詳細頁 ID、正式案號與當下狀態；總覽可連到公開詳細頁
- 聯絡步驟可選擇是否讓本站儲存姓名、電話與 E-mail；預設關閉，關閉時三個欄位均存 `opt-out`

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
npm test          # build + typecheck + node:test
npm run lint
```

本機環境變數分成兩個檔案，皆不進版控：

- `.dev.vars`（範本 `.dev.vars.example`）：Worker 使用的 `CARTO_API_KEY`、`REPAIR_SUBMIT_ENABLED`
- `.env`（範本 `.env.example`）：Vite build 使用的 `VITE_DEBUG_OUTPUT`

`CARTO_API_KEY` 是 CARTO Basemaps API key；本站 tile proxy 會依 CARTO Basemaps 新規格把它轉送為 `key` query parameter。需要檢查地圖 tile proxy 時，可暫時把 `VITE_DEBUG_OUTPUT=true` 後重新 build；production 預設應維持關閉。

本機全端測試使用 `npm run dev:worker`：先 build 前端，再以 `wrangler dev` 啟動 Worker（`http://localhost:8787`）。KV 與 R2 都是本機模擬，資料保存在忽略版控的 `.wrangler/state`，不需要建表。手動觸發排程：

```bash
curl "http://localhost:8787/__scheduled?cron=17+*+*+*+*"
```

本機 wrangler 目前支援的最新 compatibility date 是 `2026-05-22`，`wrangler.toml` 本機與正式環境共用這個日期。

## 資料儲存

| 類型 | Binding | Cloudflare 資源 | 用途 |
| --- | --- | --- | --- |
| KV | `REPORTS` | `ROAD_REPORT_KV` | 回報資料與總覽索引 |
| R2 | `PHOTOS` | `road-report-r2` | 以 `reports/{id}/photo` 為 key 儲存原始照片 |

KV 內有兩種 key：

- `report:{id}`：單筆完整紀錄，包含回報欄位、照片 metadata、聯絡資訊（或 `opt-out`）、臺大案號／詳細頁 ID、校方狀態與 `schoolCheckedAt`
- `reports:index`：`{ reports: [...] }`，由新到舊排列，只放公開欄位與校方狀態；總覽每次只讀這一個 key

送出時依序寫入 R2 照片、`report:{id}`、`reports:index`。紀錄寫入失敗會刪除剛上傳的照片；索引寫入失敗只記 log，由排程補回。KV 為最終一致，新回報可能需要約一分鐘才在其他地區的總覽出現。

公開 API `GET /api/reports` 只回傳回報項目、描述、位置、狀態、時間與校方進度，不回傳姓名、電話、Email、NTU session 或驗證碼；照片由 `GET /api/reports/{id}/photo` 直接讀 R2。

## 校方進度排程

`wrangler.toml` 的 Cron（`17 * * * *`）每小時執行 [`worker/sync.ts`](worker/sync.ts)：

1. 列出所有 `report:` key，把不在 `reports:index` 裡的紀錄補回索引（略過缺少必要欄位的舊格式 key）。
2. 挑出有臺大案件 ID、尚未結束（不是 `已結案`、`專簽結案`、`已不受理`）、且超過 23 小時未查詢的案件，每次最多 20 筆、同時 2 筆，讀取臺大公開詳細頁。
3. 狀態有變才改寫 `report:{id}`；索引只在有變動時寫回一次。讀取失敗時保留舊狀態，只更新查詢時間。

因此每件進行中的案件約一天查一次，總覽本身不會連到臺大網站。階段列中「已不受理」走獨立的結束分支，「專簽結案」保留校方原文；階段列不表示完成百分比或歷史時間。尚未取得狀態的案件顯示臺大詳細頁連結；未連結臺大案件的回報顯示本站的「已送出」。

## 送出模式

[`worker/lib/feature-flags.ts`](worker/lib/feature-flags.ts) 的寫死開關 `FORWARD_TO_NTU = false` 會開放資料庫模式送出：仍取得學校 session、顯示 captcha 並要求輸入 5 碼，但**不把報修表單 POST 到學校，也不向學校驗證答案**；回報直接寫入 KV 與 R2，沿用 `submitted` 狀態，沒有臺大案號或進度連結。資料庫模式不受 `REPAIR_SUBMIT_ENABLED` 影響。之後改為 `true` 時，才會轉送學校並由 `REPAIR_SUBMIT_ENABLED` 控制送出；先前記錄的回報不會自動補送。

一般模式只在 NTU 表單接受送出後儲存。成功回應會重新導向 `/repairservice2/PublicRepair/Details?caseId=...`；本站從詳細頁讀取案號與狀態，並保存 ID。詳細頁暫時讀不到時仍保存 ID，由排程補上其餘資料。KV 或 R2 binding 缺失時，API 會在送給 NTU 前回傳錯誤；如果 NTU 已接受但本站寫入失敗，畫面會明確告知「學校已收到」並提醒不要重複送出。`CapAns`、NTU session 與 CSRF token 不會寫入 KV 或 R2。

## 部署

本站不將 Cloudflare 資源 ID 寫入公開 repo：`wrangler.toml` 的 R2 以 bucket 名稱指定；KV 不寫 id，第一次 `wrangler deploy` 時在互動提示中選擇既有的 `ROAD_REPORT_KV`，之後的部署會沿用已部署 Worker 上的同名 binding。

```bash
npm run deploy                          # build 後 wrangler deploy
npx wrangler secret put CARTO_API_KEY   # 第一次部署後設定
```

`REPAIR_SUBMIT_ENABLED` 寫在 `wrangler.toml` 的 `vars`。也可在 Dashboard 以 Workers Builds 連接 GitHub，Build command 設為 `npm run build`、Deploy command 設為 `npx wrangler deploy`（第一次互動部署後再接上，KV binding 才能沿用）。

從舊版（Pages + D1）搬資料時，[`scripts/migrate-local-report.mjs`](scripts/migrate-local-report.mjs) 會把本機 `.wrangler/state` 裡舊 D1 的回報轉成 KV 格式、匯出照片，並印出上傳用的 `wrangler --remote` 指令；腳本本身不連線到 Cloudflare。

總覽使用 `?view=overview` 記錄目前視圖；重新整理會留在總覽，瀏覽器上一頁／下一頁也會同步切換視圖。

本專案刻意不自動破解 captcha，只把 NTU 原表單的 captcha 接到本站顯示，仍由使用者辨識輸入。
