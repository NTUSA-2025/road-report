# NTU Road Report

手機優先的臺大道路狀況回報工具。使用者可以用地圖標記位置、拍照或選擇照片、讀取 JPEG EXIF 拍攝日期與 GPS 座標，最後透過後端 proxy 將資料送到 NTU 公共設施報修表單。

## 功能

- 地圖預設在臺大校園，支援手機定位與點選地圖更新座標
- 手機拍照按鈕位於照片區中下方，使用 `capture="environment"`
- 讀取 JPEG EXIF 的拍攝日期與 GPS 座標，沒有 EXIF 時改用檔案時間與手動定位
- 後端保留 NTU 表單 session、CSRF token 與 `CapId`
- Captcha 以 proxy 圖片呈現在本站，使用者手動輸入後送出
- 送出欄位對應 NTU 表單的 `ApplicantPhone`、`Location`、`BrokenItemId`、`Reason`、`ImageFiles`、拍攝日期、相片說明與 `CapAns`

## 開發

```bash
npm install
npm run build
```

## Cloudflare Pages

Cloudflare Pages 設定：

- Build command: `npm run build`
- Build output directory: `dist/client`
- Wrangler config: `wrangler.toml`

`npm run build` 會先執行 vinext build，再由 `scripts/prepare-pages-output.mjs` 將 server bundle 整理成 Pages advanced mode 使用的 `dist/client/_worker.js`。不要手動修改 `dist/` 內的檔案。

未來若要接 Cloudflare D1、KV 或 R2，先建立正式/preview 資源，再把 `wrangler.toml` 內的範例 binding 取消註解並填入實際 ID。

本專案刻意不自動破解 captcha，只把 NTU 原表單的 captcha 接到本站顯示，仍由使用者辨識輸入。
