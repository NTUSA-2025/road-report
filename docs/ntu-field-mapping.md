# NTU 表單欄位對應

本文件說明本站送出道路狀況回報時，如何將前端資料轉成台大公共設施報修表單 `https://my.ntu.edu.tw/repairservice2/PublicRepair/Create` 接收的欄位。

## 流程摘要

1. 前端載入後呼叫 `POST /api/repair/session`。
2. Pages Function 連到 NTU `PublicRepair/Create`，取得 NTU session cookies、`__RequestVerificationToken`、`CapId` 與報修項目清單。
3. 本站將 NTU session 資訊存在 HttpOnly cookie `rr_ntu_repair`。
4. 前端透過 `/api/repair/captcha` 顯示 NTU captcha 圖片，使用者手動輸入答案。
5. 前端送出 `POST /api/repair/submit`。
6. Pages Function 讀取 `rr_ntu_repair`，組成 multipart `FormData` 後轉送到 NTU `PublicRepair/Create`。

## 前端到本站 API

前端送到 `POST /api/repair/submit` 的欄位如下：

| 前端欄位 | 來源 | 必填 | 說明 |
| --- | --- | --- | --- |
| `ApplicantName` | 聯絡步驟姓名欄位 | 否 | 申請人姓名，可留空。 |
| `ApplicantPhone` | 聯絡步驟電話欄位 | 是 | NTU 表單必填電話。 |
| `ApplicantEmail` | 聯絡步驟 email 欄位 | 否 | 申請人 email，可留空。 |
| `Location` | 位置步驟地點文字 | 是 | 預設由地圖座標產生，使用者可手動修改。 |
| `BrokenItemId` | 現況步驟報修類型 | 是 | 選項來自 NTU 表單 `BrokenItemId`；連線失敗時使用本站 fallback 選項。 |
| `Reason` | 現況步驟問題描述 | 是 | 回報原因與道路狀況描述。 |
| `ImageDescription` | 現況步驟照片補充說明 | 否 | 補充照片角度、附近地標等資訊。 |
| `CapAns` | 驗證步驟 captcha 答案 | 是 | 使用者手動輸入的 NTU captcha。 |
| `ImageTakenYear` | 照片 EXIF 日期或送出當下日期 | 否 | 拍攝年份。 |
| `ImageTakenMonth` | 照片 EXIF 日期或送出當下日期 | 否 | 拍攝月份，1 到 12。 |
| `ImageTakenDay` | 照片 EXIF 日期或送出當下日期 | 否 | 拍攝日期。 |
| `Latitude` | 地圖、裝置定位或照片 EXIF GPS | 否 | 本站輔助欄位，不直接送成 NTU 獨立欄位。 |
| `Longitude` | 地圖、裝置定位或照片 EXIF GPS | 否 | 本站輔助欄位，不直接送成 NTU 獨立欄位。 |
| `ImageFiles` | 拍照或上傳照片 | 是 | 實際照片檔案。 |

## 本站 API 到 NTU 表單

`functions/api/repair/submit.ts` 會建立新的 multipart `FormData`，並送到 NTU `PublicRepair/Create`。

| NTU 欄位 | 來源 | 轉換邏輯 |
| --- | --- | --- |
| `__RequestVerificationToken` | `rr_ntu_repair.requestVerificationToken` | 從 NTU `PublicRepair/Create` 頁面 hidden input 取得，送出時原樣帶回。 |
| `ApplicantName` | 前端 `ApplicantName` | `textValue()` trim 後送出，可空白。 |
| `ApplicantPhone` | 前端 `ApplicantPhone` | `textValue()` trim 後送出；本站送出前檢查必填。 |
| `ApplicantEmail` | 前端 `ApplicantEmail` | `textValue()` trim 後送出，可空白。 |
| `Location` | 前端 `Location`、`Latitude`、`Longitude` | 由 `withCoordinates()` 組合。若有經緯度且 `Location` 尚未包含緯度字串，會附加 `；座標 {lat}, {lng}`。 |
| `BrokenItemId` | 前端 `BrokenItemId` | 對應 NTU `BrokenItemId` select option value；本站送出前檢查必填。 |
| `Reason` | 前端 `Reason` | `textValue()` trim 後送出；本站送出前檢查必填。 |
| `ImageFiles` | 前端 `ImageFiles` | 以原檔案與原檔名送出。 |
| `ImageTakenYear` | 前端 `ImageTakenYear` | 來自照片 EXIF 日期；若沒有 EXIF 日期，使用目前日期。 |
| `ImageTakenMonth` | 前端 `ImageTakenMonth` | 來自照片 EXIF 日期；若沒有 EXIF 日期，使用目前日期。 |
| `ImageTakenDay` | 前端 `ImageTakenDay` | 來自照片 EXIF 日期；若沒有 EXIF 日期，使用目前日期。 |
| `ImageDescription` | 前端 `ImageDescription` | `textValue()` trim 後送出，可空白。 |
| `CapId` | `rr_ntu_repair.capId` | 從 NTU `PublicRepair/Create` 頁面 hidden input 取得；刷新 captcha 時更新。 |
| `CapAns` | 前端 `CapAns` | 使用者輸入的 captcha 答案；本站送出前檢查必填。 |

## 不直接送到 NTU 的欄位

| 本站欄位 | 用途 |
| --- | --- |
| `Latitude` | 僅用來附加到 NTU `Location` 文字，不作為獨立 NTU 欄位。 |
| `Longitude` | 僅用來附加到 NTU `Location` 文字，不作為獨立 NTU 欄位。 |
| `photoMeta.coordinates` | 前端狀態，用於從照片 EXIF 更新地圖位置。 |
| `captchaUrl` | `POST /api/repair/session` 與 captcha refresh 回傳給前端，用於顯示本站 captcha proxy 圖片。 |

## NTU session 與 captcha

| 資料 | 來源 | 保存位置 | 用途 |
| --- | --- | --- | --- |
| NTU cookies | NTU `PublicRepair/Create` response `Set-Cookie` | 本站 HttpOnly cookie `rr_ntu_repair` 內的 `cookies` | 取得 captcha 圖片、刷新 captcha、送出 NTU 表單。 |
| `__RequestVerificationToken` | NTU `PublicRepair/Create` hidden input | `rr_ntu_repair.requestVerificationToken` | NTU 表單 CSRF 驗證。 |
| `CapId` | NTU `PublicRepair/Create` hidden input，或 `/repairservice2/Captcha/Change` response | `rr_ntu_repair.capId` | 取得對應 captcha 圖片，並在送出時與 `CapAns` 一起送回 NTU。 |
| `CapAns` | 使用者輸入 | 不保存，只在送出時轉送 | NTU captcha 答案。 |

## 目前必填檢查

本站在轉送到 NTU 前會檢查：

- `ApplicantPhone`
- `Location`
- `BrokenItemId`
- `Reason`
- `CapAns`
- `ImageFiles` 必須是非空檔案

若缺少上述欄位，本站會回傳 `400`，不會送到 NTU。若 NTU 回覆驗證錯誤或回到表單頁，本站會回傳 `422`，並嘗試重新建立 NTU session 與 captcha。
