# 廉政專刊 PDF → 逐項財產申報 — 設計規格

- 日期：2026-06-17
- 狀態：設計定稿（待 review）
- 所屬：legislator-background 爬蟲（phase 2）的增強；補上目前缺的「真實財產金額」

## 1. 目標與定位

監察院財產申報的**金額在「廉政專刊」公報 PDF 裡**（cy adapter 目前只抓到索引、金額為 0）。本功能解析公報 PDF，抽出各類別金額，**預填**進審核檔。

**核心定位：擷取是「預填、輔助」，不是權威**。財產（assets）本來就 `approved:false`、需人工核可；PDF 擷取只是把數字先填好讓審核者核對 PDF 連結後確認／修正。因此擷取**不需完美**，可靠性由既有的人工審核閘門保證。

可行性（已驗證）：
- 公報 PDF 可用一般 UA 從 `www-ws.cy.gov.tw/Download.ashx?u=<base64>` 公開下載（非 WAF 保護的 getFile）。
- `pdftotext`（poppler）能抽出乾淨中文，**非掃描影像、不需 OCR**。

## 2. 範圍

### 做
- 解析廉政專刊電子書清單，建立 `期別 → 公開 PDF 網址` 對應。
- 抓 PDF、`pdftotext` 指定頁範圍、以姓名定位某人申報區塊。
- 抽出各類別金額（逐項靜態），掛進 CandidateAsset 的 items。
- 資料模型加 `asset_items`；站台檔案頁顯示逐項金額。
- import 寫入 declaration + items。

### 不做（YAGNI）
- 持股每日市值估算（legislator-wealth 式的 TWSE 定價、每日排程）— 之後可獨立增強。
- 自動計算「淨值總額」（申報書無乾淨總額、加總判斷易失真）。
- OCR（公報為文字 PDF，不需要）。
- 自動核可財產（維持人工把關）。

## 3. 資料模型（migration `0003_asset_items.sql`）

- `asset_declarations`：保留 `id`、`official_id`、`year`、`source_id`。`total_amount` 改為 nullable（不再強制；逐項金額存在 `asset_items`）。
- 新增 `asset_items`：
  - `id` uuid pk
  - `declaration_id` uuid not null references `asset_declarations(id)` on delete cascade
  - `category` text not null（enum 值：`land` 土地 / `building` 建物 / `cash` 現金 / `deposit` 存款 / `securities` 有價證券 / `investment` 事業投資 / `claim` 債權 / `debt` 債務 / `other` 其他）
  - `amount` bigint not null
  - `label` text（原始描述，選填）
- RLS：比照其他表，public read。

## 4. 型別與資料流

- `scraper/lib/types.ts`：`CandidateAsset` 改為 `{ year, items: AssetItem[], source }`（移除 `totalAmount`）；新增 `AssetItem { category, amount, label? }`。
- 站台 `src/lib/types.ts`：`AssetDeclaration` 改為 `{ id, year, items: AssetItem[], source }`。
- 流程：
  1. cy 索引（已運作）→ 每筆申報的 `期別`、`機關`、`公報頁次`、姓名。
  2. `gazette.resolvePdfUrl(期別)` → 公開 PDF 網址（爬電子書清單，結果快取）。
  3. 抓 PDF → `pdftotext -f <頁> -l <頁+N>` → 取得該頁文字。
  4. `gazette.parseDeclaration(pdfText, name) → AssetItem[]`（純函式）。
  5. cy adapter 把 items 掛進 CandidateAsset。
  6. → 審核檔（assets approved:false）→ 人工確認 → import 寫 declaration + items。

## 5. 元件（檔案）

| 路徑 | 責任 |
|---|---|
| `supabase/migrations/0003_asset_items.sql` | asset_items 表 + total_amount 改 nullable |
| `scraper/lib/gazette.ts` | `parseDeclaration(text,name): AssetItem[]`（純，可測）；`resolvePdfUrl(期別)`、`pdfPageText(url,page)`（整合） |
| `scraper/adapters/cy.ts`（改） | 索引後對每筆申報呼叫 gazette 抽 items，回傳含 items 的 CandidateAsset |
| `scraper/lib/toOfficial.ts`（改） | 對應新 CandidateAsset → Official.assets（items） |
| `scraper/import.ts`（改） | 寫 asset_declarations 後寫 asset_items；idempotent（declaration 自然鍵 official+year，items 隨之） |
| `src/lib/types.ts`、`transform.ts`、`data.ts`（改） | AssetDeclaration 帶 items；list row 的 `latestAssetTotal` 改為「最新年度 items 金額加總（僅正資產）」或顯示筆數 |
| `src/pages/officials/[id].astro`（改） | 財產申報區塊逐項顯示 |
| `scraper/fixtures/gazette-sample.txt` | 146期某人 pdftotext 抽出的真實文字片段（測試用） |
| `scraper/test/gazette.test.ts` | parseDeclaration 對 fixture 的單元測試 |

## 6. 解析策略（gazette.parseDeclaration）

- 輸入：某人申報區塊的 pdftotext 文字 + 姓名。
- 以類別關鍵字（土地、建物、現金、存款、有價證券、事業投資、債權、債務）定位段落，抽其後的金額（`parseAmount` 去逗號）。
- 同類別多筆則加總或保留多列（label 帶原始描述）。
- 抽不到的類別略過（不捏造）。
- 無法定位姓名區塊 → 回傳空陣列（該筆 asset 仍進審核檔，items 空，人工處理）。

## 7. 可靠性與法律

- 每筆 declaration 強制有來源（公報 PDF 連結 + 頁次）；驗證 gate 不變。
- assets 維持 `approved:false`：擷取的 items 是預填，人工核對 PDF 後才 `approved:true`。
- 站台逐項顯示時，每年附公報出處連結。

## 8. 錯誤處理

- 期別對應不到 PDF、抓取失敗、pdftotext 失敗：該筆 declaration 仍輸出（items 空 + 記錄錯誤於 report），不中止其他。
- 禮貌抓取（沿用 fetchPolite 的延遲/UA）；PDF 下載快取避免重複抓同一期。

## 9. 測試策略

- `parseDeclaration`：對 `gazette-sample.txt`（真實抽出文字）做多類別 TDD（存款、有價證券、土地…命中；無該類別則不出現）。
- `parseAmount`：沿用既有去逗號邏輯（或共用）。
- 抓取/期別對應/pdftotext：整合，dry-run 驗證；測試不打真實網路。
- import 寫 items：planInserts 仍純測；DB 寫入以本地 Supabase 驗證。

## 10. 待實作前先確認

- **期別 → 公開 PDF 網址對應**：廉政專刊電子書清單頁（sunshine.cy.gov.tw 一帶）的結構需在實作第一步確認；若清單不易爬，備案是用 cy 索引記錄推導 Download.ashx 的 base64 參數。
- `公報頁次` 與 PDF 實際頁碼是否一致（可能有封面/目次偏移）需以 146期實測校準。

## 11. 開放問題

- list 頁的 `latestAssetTotal` 改為「正資產加總」還是改顯示「有 N 筆申報」？實作時定（傾向正資產加總當概略指標，並在檔案頁才看細項）。
