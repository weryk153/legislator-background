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
