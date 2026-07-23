# 中選會整批選舉資料（votedata.zip）筆記（2026-07-23）

來源：`https://data.cec.gov.tw/選舉資料庫/votedata.zip`（110MB，Last-Modified 2026-01-26）。
zip 內檔名為 Big5（Python 讀法：`info.filename.encode('cp437').decode('big5')`）。
已解壓所需部分至 `scraper/out-roster/cec/`（gitignored；下載腳本重跑即可重建）。

## 稽核用資料夾

| 路徑（scraper/out-roster/cec/ 下） | 內容 |
| --- | --- |
| `voteData/2022-111年地方公職人員選舉/C1/{city,prv}/` | 縣市長(city)／直轄市長(prv) |
| `voteData/2022-111年地方公職人員選舉/T1/{city,prv}/` | 區域議員：縣市(city)／直轄市(prv) |
| `voteData/2022-111年地方公職人員選舉/T2/{city,prv}/` | 平地原住民議員 |
| `voteData/2022-111年地方公職人員選舉/T3/{city,prv}/` | 山地原住民議員 |
| `voteData/2024總統立委/{區域立委,平地立委,山地立委,不分區政黨}/` | 113 立委 |
| `鄉鎮市長及議員補選(2023年後)/2024{宜蘭縣,新竹縣,臺中市,臺東縣}*議員*補選/` | 現任屆議員補選（4 場） |
| `2022年_嘉義市長重行選舉/` | 嘉義市長（cand.csv/prof.csv，欄位同 elcand） |

（D1=鄉鎮市長、R1=鄉鎮市民代表、V1=村里長、R2/R3=原民代表 — 非本站範圍。）

## elcand.csv 格式（UTF-8、無 header）

```
prv_code,city_code,area_code,dept_code,li_code,號次,姓名,政黨代號,性別,出生日期,年齡,出生地,學歷,現任註記(Y/N),當選註記(*),副手註記
```

- 當選 = 第 15 欄（index 14）trim 後 == `*`。
- 選區 = elbase.csv 對應 (prv,city,area,dept,li) → 名稱；officials.district 格式為「新北市第05選舉區」（議員，補零）／「臺北市第2選舉區」（立委，不補零）／「基隆市」（首長）。比對時數字去前導零。
- prv_code 例：63=臺北市、64=高雄市、65=新北市、66=臺中市、67=臺南市、68=桃園市、10+city=省轄縣市、09+city=金馬。以 elbase.csv 為準，勿硬編。
- 政黨代號 → elpaty.csv（代號,名稱）。

## 已知資料陷阱

- **異體字**：CEC 拼「戴瑋姗」(U+59D7)，議會/媒體/ardata 拼「戴瑋姍」(U+59CD)。比對必須先過異體字映射（姍↔姗、台↔臺、峯↔峰、恆↔恒、犇 等）。
- CEC 姓名查詢 API（db.cec.gov.tw）用「姍」查只回 107 年紀錄——整批檔才可靠。
- 不分區立委 elcand（不分區政黨/elcand.csv）為政黨提名名單，當選註記標示實際上任者；就任後辭職/遞補不反映在此檔。
