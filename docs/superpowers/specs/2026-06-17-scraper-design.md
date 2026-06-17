# 公開資料爬蟲 + 人工審核匯入 — 設計規格

- 日期：2026-06-17
- 狀態：設計定稿（待 review）
- 所屬：legislator-background 專案的 phase 2 子專案（接續已完成的 MVP）

## 1. 目標

為**首批 13 位已確認的現任第 11 屆立委**，從公開來源抓取資料，產出帶「人別比對信心分數」的 JSON 待審檔；經人工核可後，由 `import` 指令重用既有驗證 gate 寫入 Supabase。

**最高原則仍是可靠性**：司法判決等敏感資料**永不自動上架**，一律經人工確認人別與出處後才寫入。

### 首批名單（13 人）
- 國民黨：韓國瑜、傅崐萁、徐巧芯、江啟臣、羅智強、王鴻薇、葉元之
- 民進黨：沈伯洋、王世堅、吳思瑤
- 民眾黨：黃國昌、黃珊珊
- 無黨籍／原住民：高金素梅

（選區、屆別等以爬到的官方資料為準。）

## 2. 範圍

### 做
- 自動抓取四類來源：立法院（經歷/委員會）、中選會（學經歷、候選財產）、監察院陽光法令（財產申報）、裁判書（候選司法判決）。
- 人別比對評分器，為候選判決計算信心分數與命中訊號。
- 檔案式人工審核流程（JSON 審核檔 + `approved` 標記）。
- `import` 指令：驗證後寫入 Supabase，idempotent。

### 不做（YAGNI）
- 排程／cron 自動定期更新（日後）。
- 站內審核後台（日後由檔案式升級）。
- 媒體爭議自動化（維持純手動輸入）。
- 首批 13 人以外的立委／首長／議員。

## 3. 架構與檔案結構（`scraper/`，TypeScript）

| 路徑 | 責任 |
|---|---|
| `scraper/targets.json` | 13 人名單與用於比對的已知屬性（姓名、政黨、選區、職業、學經歷關鍵字、別名） |
| `scraper/adapters/ly.ts` | 立法院開放資料 → 經歷/委員會 |
| `scraper/adapters/cec.ts` | 中選會 → 候選人學經歷、候選時財產申報 |
| `scraper/adapters/cy.ts` | 監察院陽光法令查詢平臺 → 財產申報 |
| `scraper/adapters/judgments.ts` | 裁判書查詢系統（Playwright）→ 候選判決 |
| `scraper/match/score.ts` | **純函式**人別比對評分器（可單元測試） |
| `scraper/lib/normalize.ts` | adapter 輸出 → 專案的 source/career/judgment/asset 形狀 |
| `scraper/lib/fetchPolite.ts` | 共用的禮貌抓取（延遲、重試、UA、尊重 robots） |
| `scraper/run.ts` | 編排：每人跑各 adapter → 輸出 `scraper/out/<id>.json` |
| `scraper/import.ts` | 讀 `approved` 項 → 重用 `validate.ts` 驗證 → 寫入 Supabase（idempotent） |
| `scraper/test/` | parser/normalizer/scorer 對 fixture 的單元測試 |
| `scraper/fixtures/` | 存檔的 HTML/JSON 樣本（測試用，不打真實網路） |

每個 adapter 是一個獨立單元：輸入一個 target，輸出正規化候選記錄；可獨立理解與測試。

## 4. 資料流

1. `run`（可帶 `--only=<id>`、`--source=<name>`、`--dry-run`）→ 對每位 target 跑各 adapter。
2. 每位 target 產出 `scraper/out/<id>.json`：含 careers、assets（來自官方結構化來源，預設信任較高）與 judgments（一律 `status: "needs_review"`，附候選清單、信心分數、命中訊號、來源 URL 與摘要）。
3. 人工編輯審核檔：對每筆設定 `approved: true/false`，必要時修正欄位、確認人別。
4. `import`（可帶 `--dry-run`）→ 只讀 `approved: true` 的項 → 跑驗證（重用 `validate.ts`，缺出處即拒絕）→ 寫入 Supabase（sources + 事實表），idempotent（依自然鍵去重，重複略過）。
5. 下次 `npm run build` 自動帶入新資料。

## 5. 人別比對（安全核心）

`score.ts` 提供純函式 `scoreMatch(candidate, target): { confidence: number; signals: string[] }`：

- 輸入：候選判決的可得欄位（當事人姓名、法院、日期、判決書文字摘要）+ target 的已知屬性（政黨、選區、職業、學經歷關鍵字、別名）。
- 輸出：`confidence`（0–1）與命中的 `signals`（例如「姓名完全相符」「判決書提及選區地名」「提及其任職機構」）。
- 規則：
  - 判決一律標 `needs_review`，**永不**因高分自動核可。
  - 同名是預設風險：僅姓名相符時 confidence 維持低分，需有額外訊號才升高。
  - 評分器與抓取分離，可用 fixture 單元測試。

## 6. 可靠性與法律

- 判決/爭議**永不自動上架**；`import` 只處理人工 `approved: true` 的項。
- 每筆事實強制有來源 URL；`import` 重用既有 `validate.ts` 驗證 gate（缺出處即拒絕、不寫入）。
- 禮貌抓取：請求間延遲、合理重試、設定 UA、尊重 robots.txt。
- 裁判書遇驗證碼／反爬：`judgments.ts` 偵測到即停下並提示人工介入（半自動），不硬闖。
- 審核檔保留完整證據（來源 URL、摘要、信心分數）以利追溯。

## 7. 錯誤處理

- adapter 各自獨立 try/catch：單一來源失敗只記錄該來源錯誤，不中止其他來源或其他 target。
- `run` 輸出部分結果與一份摘要（每位 target × 每個來源：成功/失敗/筆數）。
- `import` 對單筆驗證失敗：跳過該筆並記錄原因，不中止整批；最後報告寫入/略過/拒絕筆數。

## 8. 測試策略

- **評分器**：`scoreMatch` 純函式，多組 fixture（同名干擾、命中選區、命中機構等）做單元測試。
- **normalizer**：adapter 原始輸出 → 專案形狀的轉換，對 fixture 測試。
- **parser**：各 adapter 的 HTML/JSON 解析對 `fixtures/` 存檔樣本測試。
- **import 驗證**：缺出處的 approved 項必須被拒絕（重用驗證 gate 的行為）。
- 測試一律不打真實網路；真實試跑用 `run --dry-run`。

## 9. 實作前置

各政府來源的確切 API／網址需在實作各 adapter 的**第一步先探查確認**，再寫 parser 與存 fixture：
- 立法院開放資料（data.ly.gov.tw 一帶）
- 中選會選舉資料庫
- 監察院陽光法令查詢平臺
- 司法院裁判書查詢系統

## 10. 開放問題（實作前可再定）

- `import` 的自然鍵去重規則（判決以法院+字號、財產以人+年度、經歷以人+機構+起始）。
- 審核檔格式細節（欄位命名）於 plan 階段定稿。
