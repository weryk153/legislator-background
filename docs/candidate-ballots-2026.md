# 2026 候選人審定與號次核對

核對日期：2026-10-24（臺灣時間）。

## 來源與範圍

- [中選會 10/16 候選人資格審定公告](https://web.cec.gov.tw/central/article/65212)：81 位首長全部通過；議員 1,502 位登記者中 10 位未通過，現行名單為 1,492 位。
- [金門日報 10/24：金門縣長、縣議員候選人抽籤完成](https://www.kmdn.gov.tw/1117/1271/1272/591193/)：記錄 10/23 抽籤結果，縣長 7 位、議員第一選區 19 位、第二選區 11 位、第三選區 4 位，共 41 個號次。另以[台灣好新聞／蕃新聞](https://n.yam.com/Article/20261023139419)交叉核對。
- [公視 10/23 報導](https://news.pts.org.tw/article/832629)：除金門外，其餘縣市延期至 10/27 抽籤；另核對[南投選委會](https://web.cec.gov.tw/ntec)及[屏東選委會](https://web.cec.gov.tw/ptec)的延期公告。

金門號次來源明確標為金門日報，不冒稱是選委會公告檔案。其他縣市的 `number` 保持 `null`，不把登記順序當成號次。

## 可重現更新

- `scraper/candidate-ballots-2026-verified.json` 記錄審定來源、精確的縣市／選區／姓名及號次順序。
- `pnpm exec tsx scraper/scripts/apply-candidate-ballots.ts` 套用到既有資料；所有驗證通過後才寫檔。
- `build:candidates` 在重建原始名冊後套用相同核對資料，避免號次被清回空值。較新的正式名冊不被這批資料覆蓋。
- 單一選區必須姓名完全相符、沒有重複，且不得與已有號次衝突；不一致時停止。
- `pnpm run build:og-elections` 更新版本化的選舉分享縮圖；一般建置更新人物與選區圖卡。

## 歷史資料保留

10 位未通過審定者自現行候選名冊排除，但人物檔案與原始登記經歷保留，人物頁附審定公告連結。登記列保留在 `scraper/candidate-registrations-2026-excluded.json`，原學歷資料保留在 `scraper/candidate-education-2026-excluded.json`。首次參選查核的歷史紀錄也保留。

首長 81 人未增減，因此網站／社群及政見查核快照僅更新其對應名冊日期；個別來源的查核日期保持原值，並不代表重新查核全部外部頁面。
