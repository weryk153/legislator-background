# ardata.cy.gov.tw 整批下載端點（2026-07-23 偵察）

入口：政府開放資料 → 選舉資料（https://ardata.cy.gov.tw/data/downloads/election ，SPA，
首次進站有驗證碼同意彈窗，但下載 API 本身**免 session、curl 可直接打**）。

## 下載 API（GET）

```
https://ardata.cy.gov.tw/api/v1/Search/download
  ?ElectionName=<選舉名稱>      # 例：113年立法委員選舉、111年縣(市)議員選舉
  &ElectionArea=<縣市別>        # 例：臺北市；原住民立委用 平地原住民/山地原住民
  &AccountNumber=
  &YearOrSerial=1               # 申報序號：1=首次，2..6=第N次賸餘
  &Version=
  &SearchType=2
  &DownloadType=3               # 1=收支結算表PDF 2=收支結算表CSV 3=會計報告書CSV(整批明細ZIP)
```

回傳 `application/zip`，內含（UTF-8 with BOM、CRLF）：

- `incomes.csv` — 收入逐筆明細
- `expenditures.csv` — 支出逐筆明細
- `election_incomes and expenditures_first.csv` — 每專戶收支結算表（官方分類小計，可當核對用）
- `manifest.csv`、`schema_*.csv`

查無資料的組合回傳非 zip 或缺 incomes.csv → 下載腳本（`scraper/scripts/ardata-download.sh`）跳過。

## 明細 CSV 實際欄名（incomes.csv / expenditures.csv 同）

```
序號,擬參選人／政黨,選舉名稱,申報序號／年度,交易日期,收支科目,捐贈者／支出對象,身分證／統一編號,收入金額,支出金額,捐贈方式,存入專戶日期,返還/繳庫,支出用途,金錢類,地址,聯絡電話,應揭露之支出對象,支出對象之內部人員姓名,支出對象之內部人員職稱,政黨之內部人員姓名,政黨之內部人員職稱,關係,更正註記,資料更正日期
```

注意：**全形斜線**（擬參選人／政黨）；**金額為小數字串**（`162000.00`）；匿名捐贈的捐贈者欄
是「匿名1」等佔位；交易日期為 ROC 純數字（`1130507`）；身分證/地址/電話已遮罩。

## 本專案抓取範圍（現任席次，YearOrSerial=1 首次申報）

| 選舉名稱 | 縣市別 |
| --- | --- |
| 113年立法委員選舉 | 22 縣市＋平地原住民＋山地原住民 |
| 111年縣(市)議員選舉 | 16 縣市 |
| 111年直轄市議員選舉 | 6 直轄市 |
| 111年縣(市)長選舉 | 16 縣市 |
| 111年直轄市市長選舉 | 6 直轄市 |
| 第20屆臺東縣議員補選 | 臺東縣 |
| 第4屆臺中市議員補選 | 臺中市 |

（截至偵察日，平台上沒有第11屆立委補選的資料包；其餘補選均非本站涵蓋職務或非現任屆。）

人類可核對入口（source.url 用）：https://ardata.cy.gov.tw/data/downloads/election

## 已知限制（殘餘風險，未觀測到實例）

同姓名、同縣市、同職務類型，但一位是現任、一位是落選人：ardata-match.ts 的比對邏輯以
`姓名 + office_type + district 前綴 + is_incumbent` 篩選 officials，落選人本來就不在
officials 的現任名單裡，理論上不會被選進候選池，故不會混淆。但彙總（aggregateAccounts）
本身是「依姓名/選舉名稱/年度/area 分組」，若監察院整批檔裡剛好也有同姓名的落選人專戶
被下載進同一批來源檔（現況抓取範圍限縮在現任該屆選舉，理論上不會發生），兩人的收支會被
併成同一筆、無法從遮罩後的 CSV 資料反查區分。目前驗證未發現任何實際案例，僅記錄為
殘餘風險，供未來擴大抓取範圍或發現異常彙總數字時排查方向。
