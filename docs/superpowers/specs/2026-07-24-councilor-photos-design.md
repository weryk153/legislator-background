# 議員照片補齊設計

日期：2026-07-24
狀態：已核准

## 目標

903 位現任議員 photoUrl 全為 null（立委/縣市長已有）。以各縣市**議會官網議員介紹頁**為來源補齊，沿用立委照片慣例：下載 → sharp 縮至寬 320px → `public/photos/councilors/<slug>.jpg` → `officials.photo_url` 設本地路徑。

## 架構（兩階段，manifest 中介）

```
22 個議會官網 →（分批 agent 蒐集）→ scraper/out-photos/<縣市>.json   (manifest, gitignored)
  manifest 條目: { name, district?, img_url, profile_url, note? }
→ scraper/photos-record.ts（共用）: 比對→下載→縮圖→落地→更新 DB
→ export:data → build
```

## 比對規則（寧缺勿錯）

- officials（該縣市現任議員）↔ manifest：姓名經 `normalizeNameChars`（異體字）後完全相等。
- 同議會同名多人：manifest 有選區且能對上 → 掛；否則跳過入 skipped 清單。
- 議會官網名單以「現任」為準，天然含遞補/補選者；比對不到的 officials（如懸缺選區）留 null。
- 絕不跨縣市比對。

## photos-record.ts 行為

- 讀全部 manifest → 逐縣市比對 → 下載（帶站方 UA、1s 間隔、3 次重試）→ sharp resize 320 寬 jpg → 寫 `public/photos/councilors/<slug>.jpg` → `photo_url='/photos/councilors/<slug>.jpg'`。
- 冪等：已有 photo_url 且檔案存在者跳過（`FORCE=1` 覆蓋）；`DRY_RUN=1` 只報告。
- 輸出統計：每縣市 matched/skipped/failed；skipped 附原因。
- 圖檔進 git（public/，與立委照片同）。

## 蒐集批次（agent 每批 4-6 議會，能用 fetch 就不用瀏覽器）

臺北/新北/桃園/臺中/臺南/高雄 ｜ 基隆/新竹市/新竹縣/苗栗/彰化/南投 ｜ 雲林/嘉義市/嘉義縣/屏東/宜蘭 ｜ 花蓮/臺東/澎湖/金門/連江。
每批 agent 產 manifest 並回報各議會的頁面結構筆記（記入 `scraper/fixtures/council-photo-notes.md`）。

## 測試

- 比對邏輯（同名跳過/異體字/選區消歧）單元測試。
- 記錄後抽查：3 個議會各 1 人開頁面確認照片正確；總覽列表顯示照片。

## 授權註記

議會官網議員肖像為政府網站公開資訊，本站以標註出處之方式使用（about 頁資料來源已列議會官網者不需另補；若未列則加一條）。
