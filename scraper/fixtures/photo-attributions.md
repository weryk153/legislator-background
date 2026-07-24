# 已解職議員照片來源（中選會選舉公報，2026-07-24；部分後續補彩色官網照）

## 2026-07-24 補記：10 位改用議會官網彩色照

發現部分縣市議會「個人頁」在議員解職/卸任後未從網站下架，只是從現任名單移除連結
（unlinked but not deleted）；直接組出/找出個人頁或圖檔網址仍可訪問，取得彩色照片
取代下方公報黑白照。逐一以視覺比對確認姓名/人像相符。

| 姓名 | 縣市 | 新來源 | 備註 |
| --- | --- | --- | --- |
| 吳亮慶 | 屏東縣 | https://www.ptcc.gov.tw/?Page=PersionalDetail&Guid=8c92b5b0-a1b9-4f8a-24ca-ea7b05b41a3f | 本屆（20屆）個人頁未下架 |
| 王景山 | 屏東縣 | https://www.ptcc.gov.tw/?Page=PersionalDetail&Guid=4e40d707-b879-d84b-2c78-767d5f090ce7 | 上屆（19屆）個人頁未下架，本屆頁不可得 |
| 潘連周 | 屏東縣 | https://www.ptcc.gov.tw/?Page=PersionalDetail&Guid=92238a9c-3157-c497-60ad-1b7c71fd1f06 | 上屆（19屆）個人頁未下架 |
| 王啟敏 | 屏東縣 | https://www.ptcc.gov.tw/?Page=PersionalDetail&Guid=6158867b-07e7-f889-ec14-0ab7a324de9a | 上屆（19屆）個人頁未下架 |
| 郭再添 | 屏東縣 | https://www.ptcc.gov.tw/?Page=PersionalDetail&Guid=78668f28-774f-8cdf-af44-ef0ddf22ac90 | 18屆個人頁未下架（19屆查無記錄） |
| 莊淑如 | 宜蘭縣 | https://www.ilcc.gov.tw/pictures/people/A2007.JPG | 代碼由 Wayback 2023-09-30 名單快照比對確認，圖檔本身仍在線上 |
| 李茂豐 | 宜蘭縣 | https://www.ilcc.gov.tw/pictures/people/A2030.JPG | 同上，代碼 A2030 |
| 黃碧妹 | 臺東縣 | `GET https://www.taitungcc.gov.tw/api/member/17?desk=front`（圖檔 `/upload/up/9a033565-37d1-4179-983e-0383620a1162/2309QKuhf925`） | 記錄 `vis:0`（已從名冊隱藏）但 API 仍可直接以 id 查得 |
| 嚴惠美 Simoy．Sapod | 臺東縣 | `GET https://www.taitungcc.gov.tw/api/member/30?desk=front`（圖檔 `/upload/up/9a1f1a3b-fe11-48cb-a53d-aea73f4ec280/2309rpbHT298`） | 同上，id=30 |
| 施嘉華 | 彰化縣 | https://www.chcc.gov.tw/df_ufiles/d/s_3_07施嘉華.jpg | 個人頁（id=158）已 404，但圖檔本身仍在 CDN 上（由 Wayback 2023-09-25 快照取得檔名後試出） |

**仍維持公報黑白照（5 位，官網結構性不可得，詳見 `council-photo-notes.md`）**：
張振亮（屏東，從未有 ptcc.gov.tw 個人頁存在跡象）、楊育菡（金門，個人頁 404 已刪除）、
張正治（花蓮，個人頁存在但照片欄位已被清空）、蕭慧敏（雲林，舊站 base64 內嵌無獨立圖檔、
新站 2026-04 才上線已來不及收錄她）、陳德木（新竹縣，比對多個快照與現網均無此人紀錄，
研判個人頁從未建立）。

---

# 已解職議員照片來源（中選會選舉公報，2026-07-24）

補充 `scraper/fixtures/council-photo-notes.md`「已解職議員照片（Wayback 歷史快照）補充」一節列出的
15 位 Wayback 結構性不可得者。全數以中選會選舉公報（`eebulletin.cec.gov.tw`）補齊，來源為
111年（2022）地方公職人員選舉 縣議員選舉公報 PDF——13 位為當選人本人的公報照片，
2 位（潘連周、楊育菡，見下方「解職註記」）取自解職前之當選公報，張振亮則取自其 2022 年
落選頭候選人公報照片（2023-11 遞補上任時尚無新照可用，以候選人時期公報照代替）。

處理方式：以 PyMuPDF 將公報 PDF 頁面轉為 PNG（2x 解析度），人工比對候選人姓名確認相片欄位，
以 Pillow 精確裁切、轉為 320px 寬 jpg，覆蓋 `public/photos/councilors/<slug>.jpg` 並更新
`officials.photo_url`（見 `scraper/set-bulletin-photos.ts`）。所有裁切均已用視覺比對確認
姓名與照片相符（寧缺勿錯：僅收錄姓名可明確對應者）。

版權說明：選舉公報為政府依《公職人員選舉罷免法》第47條刊登之候選人法定公開資料，
候選人個人資料（含照片）依規定由候選人自行提供並公開刊登，非受著作權限制之第三方肖像。

## 屏東縣（6 位）

| 姓名 | 公報 PDF |
| --- | --- |
| 吳亮慶 | https://eebulletin.cec.gov.tw/111/14屏東縣/02縣議員/第2選區.pdf |
| 張振亮 | https://eebulletin.cec.gov.tw/111/14屏東縣/02縣議員/第2選區.pdf（候選人時期公報照，2023-11 遞補上任） |
| 王景山 | https://eebulletin.cec.gov.tw/111/14屏東縣/02縣議員/第2選區.pdf |
| 潘連周 | https://eebulletin.cec.gov.tw/111/14屏東縣/02縣議員/第3選區.pdf |
| 郭再添 | https://eebulletin.cec.gov.tw/111/14屏東縣/02縣議員/第4選區.pdf |
| 王啟敏 | https://eebulletin.cec.gov.tw/111/14屏東縣/02縣議員/第5-7選區.pdf（第五選舉區） |

## 宜蘭縣（2 位）

| 姓名 | 公報 PDF |
| --- | --- |
| 莊淑如 | https://eebulletin.cec.gov.tw/111/15宜蘭縣/02縣議員/宜蘭縣議員第1選舉區選舉公報.pdf |
| 李茂豐 | https://eebulletin.cec.gov.tw/111/15宜蘭縣/02縣議員/第10選舉區選舉公報.pdf |

## 金門縣（1 位）

| 姓名 | 公報 PDF |
| --- | --- |
| 楊育菡 | https://eebulletin.cec.gov.tw/111/19金門縣/02縣議員/02議員第二選區公報.pdf |

## 臺東縣（2 位）

| 姓名 | 公報 PDF |
| --- | --- |
| 黃碧妹 | https://eebulletin.cec.gov.tw/111/17臺東縣/02縣議員/臺東縣第1、8、16選舉區.pdf（第十六選舉區‧山地原住民） |
| 嚴惠美 Simoy．Sapod | https://eebulletin.cec.gov.tw/111/17臺東縣/02縣議員/臺東縣第3、11、12選舉區.pdf（第十一選舉區‧平地原住民） |

## 花蓮縣（1 位）

| 姓名 | 公報 PDF |
| --- | --- |
| 張正治 | https://eebulletin.cec.gov.tw/111/16花蓮縣/02縣議員/花蓮縣第3選舉區.pdf |

## 彰化縣（1 位）

| 姓名 | 公報 PDF |
| --- | --- |
| 施嘉華 | https://eebulletin.cec.gov.tw/111/10彰化縣/02縣議員/彰化縣第03選舉區.pdf |

## 雲林縣（1 位）

| 姓名 | 公報 PDF |
| --- | --- |
| 蕭慧敏 | https://eebulletin.cec.gov.tw/111/12雲林縣/02縣議員/雲林縣議員第06選區.pdf |

## 新竹縣（1 位）

| 姓名 | 公報 PDF |
| --- | --- |
| 陳德木 | https://eebulletin.cec.gov.tw/111/08新竹縣/02縣議員/新竹縣第02選舉區.pdf |

## 解職註記（供交叉核對）

潘連周、楊育菡兩人依 `scraper/restore-departed.ts` 記錄為「當選無效之訴判決確定，依法解職」——
本次照片取自其當選時（尚未解職）之公報，與其他 13 位相同均為 2022 年候選人身分公報照，
非解職後另行拍攝的照片。

## 未使用：維基百科

本批 15 位全數在中選會選舉公報中尋獲，未使用維基百科來源（Source 2 fallback 未觸發）。
