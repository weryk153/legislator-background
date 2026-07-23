# 名冊稽核與修復（缺漏補入＋解職/遞補更新）設計

日期：2026-07-23
狀態：已核准（起因：戴瑋姍缺漏、黃俊哲當選無效未反映）

## 目標

以中選會**整批當選人名單**為基準全面稽核 officials 名冊，找出並修復：

1. **缺漏的現任者**（如戴瑋姍——CEC 姓名查詢 API 對她只回 107 年紀錄、111 年缺，證明原名冊建置所依賴的姓名查詢有資料洞，必須用整批名單稽核）。
2. **已解職未標記者**（如黃俊哲——2024-08 當選無效判決確定）與**遞補未補入者**（如石一佑——2024-09-25 宣誓就職）。

## 資料來源

- 基準名單：中選會選舉資料庫整批檔（data.cec.gov.tw／db.cec.gov.tw 開放資料，elcand 含當選註記），涵蓋：113年立委（區域＋原住民＋不分區）、111年直轄市長／縣市長／直轄市議員／縣市議員、現任屆議員補選。實際端點於實作時偵察記錄於 `scraper/fixtures/cec-bulk-notes.md`。
- 解職/遞補事實：逐案人工確認（新聞/議會公告），**寧缺勿錯**——稽核腳本只產差異報告，所有名冊變更經人工確認後才由記錄腳本寫入（比照 judgments-confirmed 流程）。

## 稽核邏輯（`scraper/roster-audit.ts`）

- 比對鍵：姓名＋選區（正規化：CEC 選區名 ↔ officials.district）。
- 輸出 `scraper/out-roster/audit-report.json`：
  - `missing`: 當選名單有、officials 無 → 候補入清單
  - `extra`: officials 現任有、當選名單無 → 需查證（遞補進來的人屬此類但合法；資料錯誤也屬此類）
  - `departed_candidates`: 需人工查證是否解職（本次已知：黃俊哲）
- 稽核不寫 DB。

## 修復流程（`scraper/roster-confirmed.json` ＋ `scraper/roster-record.ts`）

人工確認後的變更檔，三種操作：

- `add`：補入現任者（officials＋當選 career＋CEC source；photo/bio 留待既有 enrichment 腳本）。
- `depart`：`is_incumbent=false`＋`departed_reason`（**當選無效必須寫明**，如「2024年8月經法院判決當選無效確定（賄選案），由石一佑遞補」）＋新聞 source 掛為 career 或既有 departed 機制之出處。
- `add_successor`：遞補者補入（含遞補就職 career＋出處）。

腳本可重跑（以姓名＋選區去重）。

## 下游更新（名冊修復後依序）

1. `donations:record`（dup-skip，新增者的專戶會接上——戴瑋姍 111 新北市議員專戶 237 筆）
2. `donations:corp-record`（wipe-rebuild，official_id 連結自動更新）
3. `export:data`＋`export:donors`＋build

## 已確認事實（本次已查證，實作直接用）

- 戴瑋姍：現任新北市議員（第04選舉區，民進黨，2022 連任）。出處：新北市議會 https://www.ntp.gov.tw/councilor-detail?program=37&A=4&C=595
- 黃俊哲：2024-08-30 二審改判當選無效確定（父親與辦公室主任送禮賄選案）。出處：中央社 https://www.cna.com.tw/news/aipl/202408300201.aspx
- 石一佑：民進黨，2024-09-25 遞補宣誓就職新北市議員。出處：中央社 https://www.cna.com.tw/news/aloc/202409200222.aspx
- 黃俊哲 2026-06 另涉貪遭羈押屬偵查中，依「判決只記有罪」規則不入 judgments。

## 邊界

- `extra` 中查證不到解職事證者：不動、列報告請人工後續。
- 稽核發現的其他解職/遞補案：一律先查新聞確認再入 confirmed 檔，絕不自動判定。
- 黃俊哲既有獻金資料保留（任內公開資料，比照已解職者處理慣例）。

## 測試

- 比對鍵正規化與 diff 邏輯單元測試（fixtures）。
- 修復後驗證：戴瑋姍在站上且有獻金區塊；黃俊哲頁顯示解職說明（含當選無效字樣＋出處）；石一佑在站上；/donors 搜「戴瑋姍」可見。
