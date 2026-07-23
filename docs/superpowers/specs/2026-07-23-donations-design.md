# 政治獻金（監察院 ardata）設計

日期：2026-07-23
狀態：已核准

## 目標

為現任 officials（1,034 位：立委／議員／縣市長）加上政治獻金資料：每人「現任那一席」選舉的收支摘要＋大額捐贈者，顯示在 official 頁面。

## 資料來源

監察院政治獻金公開查閱平臺 https://ardata.cy.gov.tw （Angular SPA）。

- 涵蓋範圍：2018 年修法後的選舉。本案只取「現任席次」對應的選舉：
  - 議員／縣市長 → 2022 九合一（111年地方公職人員選舉）
  - 立委 → 2024 第11屆立委選舉（113年）
  - 補選當選者 → 該次補選
- 取得方式：平台「整批下載」功能，一個選舉一包電子檔（CSV）。**實作第一步需以瀏覽器驅動 SPA 抓 XHR API／下載連結**（比照 priso.cy.gov.tw 的做法，見 `scraper/adapters/cy.ts` 註解）。
- 2018 年資料有 g0v 鏡像（ronnywang/ardata.cy-2018），本案用不到，留作未來擴充參考。

## 方案選擇

採「整批下載＋本地比對」：只下載 2–3 個選舉包，本地解析後比對，請求量個位數。
否決「逐人查詢 adapter」（1,034 次 XHR，對平台不禮貌、API 破解成本相同）。

## 資料流

```
ardata 整批電子檔 (CSV per 選舉)
  → scraper/adapters/ardata.ts        下載＋解析＋彙總
  → 比對 officials                     選舉名稱＋選區＋姓名（寧缺勿錯）
  → supabase migration 0007_donations.sql
  → scraper/export-officials.ts        officials.json 加 donations 欄位
  → src/pages/officials/[slug]         新增政治獻金區塊
```

## Schema（migration 0007_donations.sql）

### donation_reports（每人每選舉專戶一列）

- `id` uuid pk
- `official_id` → officials
- `election_name` text（如「113年第11屆立法委員選舉」）
- `report_seq` text（申報序次／年度）
- `total_income` bigint、`total_expense` bigint（單位：元）
- `income_by_type` jsonb（個人／營利事業／政黨／人民團體／匿名／其他 各小計）
- `expense_by_type` jsonb（宣傳／人事／租用／雜支等小計）
- `source_id` → sources（ardata 查詢頁 URL 作 provenance）
- RLS：public read（比照既有表）

### donation_top_donors（大額捐贈者）

- `id` uuid pk
- `report_id` → donation_reports
- `donor_name` text
- `donor_type` text（個人／營利事業／政黨／人民團體）
- `amount` bigint（同一捐贈者多筆加總後金額）
- `rank` int
- 收錄規則：**營利事業全列；個人加總後取前 20**。

## 身分比對（寧缺勿錯）

- 獻金資料的「選舉名稱」含選舉區；officials 的 careers 已有 CEC 選舉區字串（如「111年縣市議員（南投縣第02選舉區）」）。
- 比對鍵：姓名＋選舉屆次＋選舉區。三者齊備才掛；同名不同選區自然分離。
- 比對不到或模糊 → 不入庫，輸出 review 清單（比照 judgments 流程）人工確認。

## 邊界處理

- **不分區立委**：獻金掛政黨名下，無個人專戶。officials.json 標記 `donations: { type: 'party-list' }`，頁面顯示說明文字。
- **未設專戶／查無申報**：不顯示區塊（不是零，是無資料）。
- **補選**：以該次補選的專戶為準。
- 金額一律整數「元」，ROC 年份轉西元（沿用 `cy.ts` 的 `toGregorianYear` 模式）。

## 前端呈現

official 頁新增「政治獻金」區塊：

- 標題列：選舉名稱＋總收入／總支出。
- 收入分類小計（長條或表格，沿用站內既有樣式）。
- 大額捐贈者表：名稱／類別／金額，附 ardata 來源連結。

## 測試

- 解析器：以實際 CSV 樣本做 fixtures（放 `scraper/fixtures/`），單元測試欄位解析、金額、ROC 年轉換、捐贈者加總。
- 比對邏輯：測同名跨選區案例（必須分離）、選區字串正規化。
- 沿用 vitest。
