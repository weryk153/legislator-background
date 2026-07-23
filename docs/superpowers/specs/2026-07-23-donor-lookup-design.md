# 政治獻金查詢頁（企業反查＋雙向搜尋）設計

日期：2026-07-23
狀態：已核准
前置：docs/superpowers/specs/2026-07-23-donations-design.md（已上線）

## 目標

新增 `/donors` 頁「政治獻金查詢」：單一搜尋框雙向查詢——輸入政治人物名找到其檔案頁獻金區塊；輸入公司名或統編反查該企業捐給哪些候選人。營利事業捐贈**全量**入庫（含捐給落選人者）；個人捐贈不做。

## 資料規模（2026-07-23 實測 out-ardata 原始檔）

- 營利事業捐贈 20,288 列；統編 8 碼明碼 20,287 列（1 列無效以名稱為鍵）
- distinct 統編 12,719（247 家同統編多名稱變體 → 以統編合併，取最長名稱為正規名）
- 公司→候選人配對 18,956；受贈候選人 1,249（含落選人）

## Schema（migration 0008_corp_donations.sql）

`corp_donations`（每列＝公司×候選人×選舉，金額加總）：

- `id` uuid pk
- `donor_uid` text（8 碼統編；無效統編列以 `name:<公司名>` 為鍵）
- `donor_name` text（正規名＝同統編變體中最長者）
- `recipient_name` text（擬參選人姓名，原文）
- `election_name` text
- `official_id` uuid nullable → officials：**該 (recipient_name, election_name) 已存在 donation_report 時取其 official_id**（沿用既有寧缺勿錯比對結果，不做新比對）；NULL＝落選人或未收錄
- `amount` bigint（整數元，同公司×同人×同選舉多筆加總）
- `source_id` → sources（全表共用一筆 ardata 整批下載頁 source）
- index：`donor_uid`、`official_id`
- RLS public read（同既有表）

## 資料流

```
out-ardata/*_incomes.csv（收支科目=營利事業捐贈收入）
  → scraper/donations-corp-record.ts   統編合併變體、加總、連結official_id、寫表（可重跑：全刪重建）
  → scraper/export-donors.ts           → src/data/donors.json
  → src/pages/donors.astro             client-side 搜尋（lazy fetch，比照 graph.json 模式）
```

`donors.json` 結構：
```json
{
  "generatedAt": "...",
  "officials": [ { "name", "slug", "party", "officeType", "district", "totalIncome" } ],  // 798位有獻金報告者
  "donors": [ { "uid", "name", "total", "recipients": [ { "name", "election", "amount", "slug"|null, "party"|null, "officeType"|null } ] } ]
}
```
（recipients 依 amount 降冪；slug 非 null 表示現任可連結。整檔約 2–3MB。）

## /donors 頁

- 導覽列標籤「政治獻金」；H1「政治獻金查詢」；副標：可輸入政治人物姓名，或營利事業名稱／統一編號反查其捐贈對象。
- 單一搜尋框，≥2 字元即時篩選（統編允許數字前綴比對）。
- 結果兩區：
  - **政治人物**：姓名＋政黨＋職務＋選區＋該屆獻金總收入，整列連到 `/officials/<slug>`。
  - **營利事業**：公司卡片＝正規名＋統編＋捐贈總額＋受贈者列表（現任：可點姓名連檔案頁＋政黨/職務；非現任：名字＋灰字「非本站收錄之現任者」）。
- **預設顯示（未輸入時）**：統計列（收錄 N 家企業／捐贈總額／資料選舉範圍）＋「捐給最多位現任政治人物」排行前 50（公司名、現任受贈人數、總額；點卡片展開受贈者）。
- 頁尾方法說明：資料來源監察院整批電子檔、僅營利事業、涵蓋選舉範圍、同統編名稱變體已合併；附平臺出處連結。

## 邊界

- 個人捐贈完全不入此表、不出現在此頁。
- 落選人只顯示姓名，不做任何身分連結或推斷（寧缺勿錯延伸）。
- 現任連結**只**沿用 donation_reports 既有 (official_id, election_name) 配對；corp_donations 不自行比對。
- officials.json 與 official 頁不變動。

## 測試

- 彙總單元測試：統編變體合併（取最長名）、金額加總、無效統編 fallback 鍵。
- export：donors.json 結構與 798 officials 索引數。
- build＋頁面三狀態（預設排行／查到政治人物／查到公司）驗證。
