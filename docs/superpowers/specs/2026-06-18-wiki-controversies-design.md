# 維基百科爭議 adapter（客觀來源引用）— 設計規格

- 日期：2026-06-18
- 狀態：設計定稿（待 review）
- 所屬：legislator-background 爬蟲（phase 2）；補上目前全空的「媒體/爭議」資料，且改用**可達、客觀、可合法引用**的來源

## 1. 目標與定位

司法院搜尋站此環境連不到、商業法律庫不可爬（法律紅線）。改以**中文維基百科**這個客觀、開放（CC BY-SA）、API 可達的來源，抽取政治人物的「爭議/案件/訴訟」段落，產出**候選爭議項**供人工審核。

**核心定位：擷取＝預填候選，永不自動上架**。爭議資料敏感（涉真人指控），維基可能有誤/偏頗/被竄改，故一律 `approved:false` 經人工核對、標狀態、訂正後才匯入。每筆同時附**兩層出處**：維基條目連結 + 該段落內 `<ref>` 指向的新聞/判決原文。

可行性（已驗證）：`zh.wikipedia.org/w/api.php` 可達；黃國昌、高虹安等條目有「爭議/詐領立委助理費案/事件」等段落且附引用。

## 2. 範圍

### 做
- 新 adapter `wiki.ts`：依姓名抓中文維基條目 → 找爭議類段落 → 抽摘要 + 段內引用連結 → 候選爭議。
- 擴充爬蟲管線承載「爭議」此一新事實型別（types / review / toOfficial / import）。**沿用現有 `controversies` + `controversy_sources` 表，無 schema 變更。**
- 對全 1045 位適用；無維基條目者（多數議員）adapter 回空（graceful）。

### 不做（YAGNI）
- 自動判定法律狀態（偵查中/定讞…）與日期——交人工。
- 自動上架爭議（維持人工閘門）。
- 從新聞全網爬爭議（只用維基這個可引用聚合點 + 其 ref）。
- 改 controversies 資料表結構。

## 3. 資料模型與型別

- DB：沿用 `controversies(official_id, title, summary, status, event_date, report_date)` + `controversy_sources(controversy_id, source_id)`。
- 新型別 `scraper/lib/types.ts`：
  - `CandidateControversy { title; summary; status; eventDate; reportDate; sources: EvidenceSource[] }`
  - `AdapterResult` 增 `controversies?: CandidateControversy[]`。
- adapter 產出時：`status` 預設 `'other'`、`eventDate`/`reportDate` 盡量從段落/ref 推不到就留空（人工於審核時補；驗證 gate 會要求 reportDate + 至少一個 source，逼人工補齊才放行）。

## 4. wiki adapter 行為

- 端點：`https://zh.wikipedia.org/w/api.php`（MediaWiki API，UA 標示）。
- 流程：
  1. `action=parse&page=<name>&prop=sections` → 找標題含「爭議/爭論/事件/風波/訴訟/案/醜聞」的段落 index。
  2. 對每個命中段落 `action=parse&page=<name>&section=<i>&prop=wikitext|text` → 取段落內容。
  3. 抽：`title`=段落標題；`summary`=段落前段純文字（去 wiki 標記、截斷如 300 字）；`sources`=維基條目 URL +（段落內 `<ref>` 的外部連結 URL，type 依網域猜 news/court/gov，預設 news）。
- **消歧**：條目標題即姓名；以該頁 lead 是否含目標的政黨/選區/「立法委員/議員/市長」等關鍵字確認是本人，不符則回空（避免抓到同名他人或非政治人物條目）。
- 純解析（wikitext→summary、ref→urls）為**純函式**，可對 fixture 單元測試；抓取為整合。

## 5. 管線擴充

- `review.ts`：`buildReviewFile` 納入 controversies，預設 `approved:false` + `status:'needs_review'`（與判決一致）；`collectApproved` 收 approved 的 controversies。
- `toOfficial.ts`：map `CandidateControversy` → `Official.controversies`（含 sources）。
- `import.ts`：寫 `controversies` 列 + 每個 source 寫 `sources` 再關聯 `controversy_sources`；idempotent（自然鍵：official + title）。
- `planInserts`：納入 controversies，經 `validateOfficial`（缺 source/status/reportDate 會擋）。
- `run.ts`：把 `wikiAdapter` 加入 adapters。

## 6. 可靠性與法律

- 永不自動上架；人工核對維基與 ref 原文、標正確狀態與日期、用中立用字（「爭議/被控/一審…」非「定罪」）。
- 每筆附維基連結 + 底層 ref；於站上標明「整理自維基百科及所附報導，非司法定讞」。
- 消歧確認本人；維基可能過時/偏頗，人工為準。

## 7. 錯誤處理

- 無條目（404）/ API 失敗 / 無爭議段落 → 回 `{source:'wiki', ok:true, controversies:[]}`（或 ok:false on網路錯誤），不中止其他。
- 沿用禮貌抓取（延遲/UA）。

## 8. 測試

- `wiki.ts` 純解析（段落 wikitext → summary、ref → url list、消歧判斷）對存檔 fixture（某政治人物爭議段落）做 TDD。
- review/toOfficial/import 的 controversies 路徑：planInserts 純測（缺 reportDate 被擋、含 source 通過 + 自然鍵）。
- 抓取整合用 dry-run 驗證；測試不打真實網路。

## 9. 開放問題

- ref 日期解析做到多細（推 reportDate）——傾向不自動、留人工。
- summary 截斷長度與 wiki 標記清理程度（plan 階段定）。
