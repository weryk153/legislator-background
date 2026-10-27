# 2026 候選人審定與號次核對

核對日期：2026-10-27（臺灣時間，下午公告增補）。

## 來源與範圍

- [中選會 10/16 候選人資格審定公告](https://web.cec.gov.tw/central/article/65212)：81 位首長全部通過；議員 1,502 位登記者中 10 位未通過，現行名單為 1,492 位。
- [金門日報 10/24：金門縣長、縣議員候選人抽籤完成](https://www.kmdn.gov.tw/1117/1271/1272/591193/)：記錄 10/23 抽籤結果，縣長 7 位、議員第一選區 19 位、第二選區 11 位、第三選區 4 位，共 41 個號次。另以[台灣好新聞／蕃新聞](https://n.yam.com/Article/20261023139419)交叉核對。
- [公視 10/23 報導](https://news.pts.org.tw/article/832629)：除金門外，其餘縣市延期至 10/27 抽籤；另核對[南投選委會](https://web.cec.gov.tw/ntec)及[屏東選委會](https://web.cec.gov.tw/ptec)的延期公告。

金門號次來源明確標為金門日報，不冒稱是選委會公告檔案。

## 10/27 增補

本輪新增 644 個號次，累計 685／1,573 人：12／22 個首長選舉、88／221 個議員選區已收錄完整號次，888 人仍待核實。全國及各縣市的名冊仍為 10/16 審定版本；號次來源與日期按選舉／選區分開記錄。

| 縣市 | 首長號次人數 | 議員號次人數 | 已收錄議員選區數 | 來源 |
| --- | ---: | ---: | ---: | --- |
| 金門縣（既有） | 7 | 34 | 3 | [金門日報](https://www.kmdn.gov.tw/1117/1271/1272/591193/) |
| 新北市 | 3 | 111 | 13 | [首長公告](https://web.cec.gov.tw/tpcec/article/65360)、[議員公告](https://web.cec.gov.tw/tpcec/article/65361) |
| 臺中市 | 3 | 101 | 17 | [首長公告](https://web.cec.gov.tw/tcec/article/65353)、[議員公告](https://web.cec.gov.tw/tcec/article/65351) |
| 高雄市 | 5 | 101 | 15 | [選委會公告](https://web.cec.gov.tw/khec/article/65366) |
| 苗栗縣 | 2 | 56 | 8 | [選委會公告](https://web.cec.gov.tw/mlec/article/65362) |
| 屏東縣 | 2 | 87 | 16 | [選委會公告](https://web.cec.gov.tw/ptec/article/65365) |
| 澎湖縣 | 6 | 36 | 6 | [選委會公告](https://web.cec.gov.tw/phec/article/65367) |
| 新竹市 | 3 | 56 | 7 | [選委會公告](https://web.cec.gov.tw/hcec/article/65374) |
| 嘉義市 | 5 | 37 | 2 | [首長](https://web.cec.gov.tw/cyec/article/65350)、[議員第一選區](https://web.cec.gov.tw/cyec/article/65355)、[第二選區](https://web.cec.gov.tw/cyec/article/65382) |
| 臺北市 | 6 | 0 | 0 | [鏡報](https://www.mirrordaily.news/story/93969)，並以[壹蘋](https://news.nextapple.com/politics/20261027/7445D976FF86CC2875A9A1D1FA8AA955)交叉核對 |
| 桃園市 | 2 | 19 | 1 | [首長：壹蘋](https://news.nextapple.com/politics/20261027/66A9B4C7F53367997C4944620A378295)、[桃園區議員：聯合報](https://udn.com/vote2026/story/124652/9839154) |
| 基隆市 | 3 | 0 | 0 | [壹蘋](https://news.nextapple.com/politics/20261027/3A0A967F7CA60C0931E19DBE5F081BEA) |

已檢查各縣市選委會公告列表，本輪僅納入已能取得完整名單且逐名核對的選區。新聞只報部分人選時不依剩餘號碼推算；其餘 `number` 保持 `null`。媒體來源與官方公告清楚區分。高雄掃描 PDF 及屏東跨行原住民姓名另檢視原頁；苗栗公告省略的族名以同選區唯一對應核實，保留既有完整姓名。

部分縣市僅有個別議員選區先收錄，因此新增選區層級 `source`，縣市頁、選區頁、地圖側欄、分享圖卡與最新號次日期均使用相應來源。桃園市其餘選區保持待補，不把桃園區號次來源套用至全市。

## 可重現更新

- `scraper/candidate-ballots-2026-verified.json` 記錄審定來源、精確的縣市／選區／姓名及號次順序。
- `pnpm exec tsx scraper/scripts/apply-candidate-ballots.ts` 套用到既有資料；所有驗證通過後才寫檔。
- `build:candidates` 在重建原始名冊後套用相同核對資料，避免號次被清回空值。較新的正式名冊不被這批資料覆蓋。
- 單一選區必須姓名完全相符、沒有重複，且不得與已有號次衝突；不一致時停止。
- `pnpm run build:og-elections` 更新版本化的選舉分享縮圖；一般建置更新人物與選區圖卡。

## 歷史資料保留

10 位未通過審定者自現行候選名冊排除，但人物檔案與原始登記經歷保留，人物頁附審定公告連結。登記列保留在 `scraper/candidate-registrations-2026-excluded.json`，原學歷資料保留在 `scraper/candidate-education-2026-excluded.json`。首次參選查核的歷史紀錄也保留。

首長 81 人未增減，因此網站／社群及政見查核快照僅更新其對應名冊日期；個別來源的查核日期保持原值，並不代表重新查核全部外部頁面。


## 10/27 下午臺南增補

再新增臺南市 91 個號次（市長 4 人、13 個議員選區共 87 人），累計 776／1,573 人：13／22 個首長選舉、101／221 個議員選區已收錄完整號次，797 人待核實。

來源為[臺南市選委會正式抽籤結果與附件](https://web.cec.gov.tw/tnec/article/65387)，並以[同日選委會新聞稿](https://web.cec.gov.tw/tnec/article/65385)逐名交叉核對。第 13 選區姓名跨行，另檢視 PDF 原頁，保留施余興望 Tjakumay Tagaw、辛晴晴 Langui Tamapima 等完整名冊姓名。

本輪再查其餘待補縣市公告。臺北市公辦政見發表會日程只列出參加者，不能當作完整候選人號次表；未推算缺席者號次，其餘待補維持空值。
