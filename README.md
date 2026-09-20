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
- Captcha 以 proxy 圖片呈現在本站，使用者手動輸入後送出
- 位置送出強制使用 `Latitude`、`Longitude`，後端再格式化成 NTU 表單的 `Location`
- 送出欄位對應 NTU 表單的 `ApplicantPhone`、`Location`、`BrokenItemId`、`Reason`、`ImageFiles`、拍攝日期、相片說明與 `CapAns`

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
- Wrangler config: `wrangler.toml`
- Secret: `CARTO_API_KEY`

`npm run build` 會產生 Vite 靜態輸出到 `dist/`。API 由 Cloudflare Pages 自動讀取 `functions/`，不需要 `_worker.js`。

`wrangler.toml` 會把 `CARTO_API_KEY` 宣告成 required secret。請在 Cloudflare Pages 對應環境設定 secret 後重新部署；若 production 與 preview 都會用地圖，兩個環境都需要設定。

未來若要接 Cloudflare D1、KV 或 R2，先建立正式/preview 資源，再把 `wrangler.toml` 內的範例 binding 取消註解並填入實際 ID。

本專案刻意不自動破解 captcha，只把 NTU 原表單的 captcha 接到本站顯示，仍由使用者辨識輸入。
