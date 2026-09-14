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

## 開發

```bash
npm install
npm run build
```

建立 `.env` 並填入 CARTO API key：

```bash
CARTO_API_KEY=your-carto-api-key
```

這裡使用的是 CARTO Basemaps API key；本站 tile proxy 會依 CARTO Basemaps 新規格把它轉送為 `key` query parameter。

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
