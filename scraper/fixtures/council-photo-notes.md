# 議會官網結構筆記

議員照片蒐集批次的頁面結構記錄，供 `scraper/photos-record.ts` 比對邏輯與日後重跑腳本參考。

## 花蓮縣議會

- 名單頁：`https://www.hlcc.gov.tw/councillor.php`（純靜態 HTML，一次抓完，免捲動/免 API）。
- 結構：頁面內有 10 個 `.row.row-40.align-items-sm-end` 容器，**每個選區各自一個容器**（不是共用一個大容器，選錯 selector 只會拿到第一選區）；每個容器第一個子節點是標題卡（`h3.text-normal` 選區名 + `p` 內含 `區域：`、`<br>` 分隔的鄉鎮/原住民類別、`議員人數：`），其餘子節點是議員卡（`.text-header a` 含姓名、`img` 照片、`a[href^=councillor-data.php]` 為 profile link）。
- 姓名格式為「姓+議員+名」如「魏議員 嘉賢」，需去掉「議員」與空白還原成「魏嘉賢」。
- 圖片：`upfile/*.jpg`，站方相對路徑，直接可下載，真實照片（非預設頭像）。
- 選區計數：官網「議員人數」加總為 33，實際抓到現任 32 人 — 第三選區（吉安鄉、壽豐鄉、鳳林鎮／光復鄉、豐濱鄉、萬榮鄉）少 1 人，判斷為懸缺（比對不到即留 null，不用特別處理）。
- 原住民選區（第五～十選區）在官網用「【鄉鎮清單】+平地原住民/山地原住民」表示，直接記錄整段文字即可，未特別另做代碼對應。

## 臺東縣議會

- 名單頁 `/1/member` 本身是空殼（Vue-ish 前端渲染），資料來自 JSON API `GET /api/member`，須帶查參：`?limit=100&page=1&lg=1&kind={1..16}&sortkey=&desk=front&search=`；**`kind` 必填**，留空或省略會 500。
- `kind` 對應官網地圖上的「選舉區」代碼 1～16（非行政鄉鎮），需迴圈抓完 16 個 kind 並用 `id` 去重（同一人可能因跨區地圖標示在多個 kind 出現，實測有此情況）。
- 每筆資料的 `type` 欄位就是完整選區名稱（如「第一選區(區域縣議員)」「第七選區(平地原住民)」），直接當 district 使用最準確。
- 圖片網址規則：`/upload/up/{guid}/{name}`（`name` 欄位是站方隨機檔名、無副檔名，不能用 `original` 欄位，那是原始上傳檔名不對應實際存放路徑）。
- profile_url 慣例：`/1/member/detail/{id}`（前端路由，實際內容仍靠 API，但作為 record 出處連結足夠）。
- 迴圈 16 個 kind 去重後總數 30 人，與縣議會應選席次相符。

## 澎湖縣議會

- 官網為舊式 frameless 靜態頁，注意新舊網域：`http://www.phcouncil.gov.tw` 會 301 到 `https://www.phcouncil.gov.tw`（webfetch/curl 建議直接用 https 版本省一次跳轉）。名單頁 `https://www.phcouncil.gov.tw/mop1.php`（原 `mop.php` 首頁選單連過去的是這頁）。
- 結構：整頁是一串 `<table>`，用「(區名) 應選N人」的 `<b>` 文字當作選區分節標題，之後緊接的 table 內 `<a href="mop2.php?no=...">` 即為每位議員（img 照片 + 姓名純文字），姓名文字包含職稱後綴（議長／副議長／議員），需要 strip 掉尾碼還原本名。
- 6 個選區（馬公市11、湖西鄉3、白沙鄉2、西嶼鄉1、望安鄉1、七美鄉1）加總 19，與抓到筆數一致，無懸缺。
- 圖片：`attachments/mop/M240800XX.jpg`，profile_url 為 `mop2.php?no=M240800XX`，皆可直接組對應絕對網址。

## 金門縣議會

- 名單頁 `https://www.kmcc.gov.tw/8844/54357/55476/`：現代 CMS 頁，選區資訊完整（`div.area` 內 `h3` 為選區含鄉鎮說明，`ul > li > a` 為議員姓名+個人頁連結），**但列表頁本身沒有照片**，照片只在個人頁。
- 因此需對 19 個 profile_url 逐一 fetch（各自 1s 節流），從個人頁抓 `img[src^="/media/"]` 取得照片（檔名為中文姓名 URL-encode，如 `/media/24239/李養生.jpg`；少數是英數亂碼檔名如 `m_2.jpg`，不影響有效性）。
- 3 個選區（第一 10、第二 7、第三 2）加總 19，與抓到筆數一致，無懸缺。
- 站方另有舊網域重導 (`kccad.kinmen.gov.tw` 等)為政府機關頁，非議會官網，勿誤用。

## 連江縣議會

- 官網有新舊兩個網域：舊 `client.matsu.idv.tw` / `gov.matsu.idv.tw` 目前多數子頁已 404（連結會出現在搜尋結果但已失效）；現行官網是 `https://www.mtcc.gov.tw`（頁面內有自動 http→https 轉址 script，直接用 https 抓即可）。
- 名單頁：`https://www.mtcc.gov.tw/ch/counciler_introlist/7190`，用 `ul.legislatorbox > li` 依選區分節，`img[alt]` 帶選區文字（如「第一選區－南竿鄉」），`a.text-constituency` 文字格式「職稱：姓名」（如「副議長：林明揚」「議員：曹以標」），需取 `：` 後半當姓名。
- 該頁同樣不含照片，需逐一 fetch 個人頁 `.../ch/counciler_intro/7190?clid=N`（9 個 clid，各自 1s 節流），從 `img.legislator` 取得照片。
- 4 個選區（南竿鄉5、北竿鄉2、莒光鄉1、東引鄉1）加總 9，符合連江縣議會應選 9 席，無懸缺。
- 圖片網址組出來會有雙斜線（如 `https://www.mtcc.gov.tw//upload/xxx.jpg`，源自站方 base href 本身多一個斜線），實測仍可正常 200 下載，若日後改用正規化網址記得先驗證不要誤判失效。

## 基隆市議會

- 名單頁 `https://www.kmc.gov.tw/index.php/mac/mi`：Joomla 頁面，所有 8 個行政區（含平地原住民）一次全部列在同一頁，免翻頁/免 API。
- 結構：每個 `h3.sppb-addon-title`（如「信義區」）所在的 `.sppb-addon-wrapper` 之後緊接下一個 `.sppb-addon-wrapper`，裡面的 `.sppb-addon-article` 才是議員卡（`a.sppb-article-img-wrap` 為 profile link，`img` alt 格式「姓名議員大頭照」或少數順序顛倒「姓名大頭照議員」，用 `img.alt` 去掉「大頭照」「議員」字串還原姓名比用 `<h3><a>` 文字更乾淨——後者部分姓名中間混入全形空白（如「陳　宜」「秦　鉦」）疑為排版留白字元，非真名一部分）。
- 圖片：`images/member/2022/*.jpg`（少數 `.gif`），路徑內偶有雙斜線（`2022//km16.jpg`）仍可正常 200。
- 8 區加總 29 人，與抓到筆數一致，無懸缺（原住民席「平地原住民」1 人）。

## 新竹市議會

- 名單首頁 `https://www.hsinchu-cc.gov.tw/tc/councilors.aspx?mid=39` 是 ASP.NET UpdatePanel 頁，**只有預設選區（東區）在靜態 HTML 內**，其餘 5 區（南/西/北/香山/平地原住民）靠 `__doPostBack` 局部更新，純 curl 抓不到。
- 改用個人頁暴力遍歷：`councilor.aspx?mid=39&c={id}`，`id` 為流水號，實測 4～36 為有效範圍（1-3 空白，37+ 為空頁），逐一 fetch（1s 節流）取 `img#ltImg`（alt=「姓名 議員/副議長」）、`dt` 文字為「選區」後面的 `dd`（格式「第11屆 東區」，需去掉屆別前綴）。
- 沒有現成的「全員 id 清單」可先抓，只能靠遍歷；若下屆改版建議先看首頁有無 sitemap 或 JSON API 可用。
- 東12＋南3＋西2＋北9＋香山6＋平地原住民1＝33 人。
- **已知缺漏（2026-07-24 補記）**：議長許修睿（南區，本屆第11屆）不在 `councilor.aspx?mid=39&c={4..36}` 遍歷範圍內——議長有獨立的個人頁 `sir.aspx?mid=37`（非 `councilor.aspx?mid=39` 體系，id 也不在 4-36 序列），純遍歷 c=4..36 會完全跳過議長本人。已手動補上（img 取自 `sir.aspx?mid=37` 頁面），若下次重跑腳本記得額外抓這個固定網址，或檢查是否有副議長同樣落在別的固定頁面。

## 新竹縣議會

- 名單頁 `https://www.hcc.gov.tw/member?program=190`：純靜態列表，`a[href^="member-detail?program=190&S=22&C="]` 的 `title`/文字即姓名，但**列表頁本身沒有照片與選區**，只有 37 個 `C=` id 連結。
- 需逐一 fetch 個人頁 `member-detail?program=190&S=22&C={id}`（1s 節流），照片為 `img[src*="upload/Z_Councilor"]`，選區用全文字串 regex `選區[：:]\s*(\S+)` 取值（如「竹北市」「竹東鎮、五峰鄉」）；另有兩個特殊「山地原住民」性質選區顯示為「尖石區」「五峰區」（與一般選區「橫山鄉、尖石鄉」是不同席次，非重複/錯誤）。
- 列表 37 筆連結，逐一 fetch 後皆有效，無懸缺。

## 苗栗縣議會

- **整站編碼為 Big5**（`<meta charset="big5">`），curl 抓回來的 bytes 需用 Big5 解碼（Node `new TextDecoder('big5')` 即可，勿假設 UTF-8，否則姓名全部亂碼）。
- 名單頁分 8 選區各自一頁：`iframimgtxt_list.php?menu=2568&typeid=2580&typeid2={2599..2606}`（2599=第一選區…2606=第八選區，選區按鈕文字在頁面本身可交叉驗證編號）；每頁是舊式 table 版型，`a[href^="admin/upload/"]` 包住的 `img[alt]` 即姓名，`a.href` 本身就是全尺寸原圖網址（比 `img.src` 的縮圖更好，直接採用）。
- 沒有個人 profile 頁，`profile_url` 只能填該選區列表頁網址。
- 議長/副議長的 `img.alt` 會帶職稱前綴（如「議長　李文斌」「副議長　張淑芬」，職稱與姓名間是全形空白），另有姓名本身含全形空白的雜訊（如「翁　杰」→「翁杰」），寫入前需 strip 職稱前綴＋移除所有全半形空白。
- 8 選區加總 36 人（8+3+4+9+8+2+1+1）。

## 彰化縣議會

- 名單頁 `https://www.chcc.gov.tw/member/index.aspx?Parser=99,6,40`：純靜態，`a[href^="details.aspx?Parser=99,6,40,,,,{id}"]` 的連結文字即姓名，53 個不重複 id（id 序列本身不連續，中間有斷號，屬正常現象非漏抓）。
- 列表頁本身沒有照片與選區，需逐一 fetch 個人頁 `member/details.aspx?Parser=99,6,40,,,,{id}`（1s 節流），照片為 `img[src*="df_ufiles"]`（檔名為中文姓名 URL-encode），選區在 `div#member_title` 文字內用 regex `第[一二三四五六七八九十]+選區` 取值。
- 53 筆與官網「議員一覽表」總席次相符，無懸缺。

## 南投縣議會

- 名單頁 `https://www.ntcc.gov.tw/tw/rep/index.aspx`：單頁全部列出（含議長/副議長區塊＋8 選區區塊），免翻頁/免 API，照片也在同頁。
- 結構：議長/副議長在最上方一個沒有 `.cont`/`h6` 包裹的 `a.ho_trans` 區塊，其餘 8 選區各自一個 `div.cont#district{N}`，內含 `h6.h5` 標題（格式「第一選區：南投市、名間鄉」，取「：」前半當 district）；每位議員卡是 `a.ho_trans`，`href` 格式 `p02.aspx?district={N}&period=20#姓名`（**#後面的錨點文字就是最乾淨的姓名來源**，比卡片內 `p.sub`/`p.title` 文字更穩定，因為議長/副議長卡的職稱文字擠在 `p.title` 位置、姓名才是 `p.sub`，兩種卡版型不同容易取錯欄位）。議長/副議長卡沒有獨立 `.cont`，需靠 `href` 裡的 `district=N` 反查前面建好的「N→選區文字」map 才能補上選區。
- 圖片：`App_Script/MDisplayCut.ashx?file=member/xxx.jpg&w=140&h=170`（動態裁切服務，非靜態檔案路徑，但可直接下載）。
- 34 人（含議長何勝豐＝第四選區、副議長潘一全＝第五選區＋8 選區 32 人），其中原住民選區姓名含族語括號（如「林庭秝(Ali Walis)」），原樣保留未拆解。

## 雲林縣議會

- 名單頁 `https://www.ylcc.gov.tw/cp.aspx?n=22126`：單頁全部列出（6 個選區各自一個 `div.news-card` 區塊，選區標題在 `div.hd a[title]`），照片也在同頁，免翻頁/免 API。
- 每位議員是 `li > a.div`，`href` 為 `Congress_Detail.aspx?n=...&sms=...&s=...` 個人頁連結，`.img img[src]` 為照片、`.caption` 純文字姓名（無職稱前綴混入，議長/副議長也是純姓名）。
- 6 選區加總 42 人（10+6+9+6+7+4），官網掛牌應選 43 席，少 1（判斷為懸缺，比對不到即留 null，不用特別處理）。

## 嘉義市議會

- 名單頁 `.../web/UnitStaff_New/listUnitStaff.aspx?c0=3716` 本身只是選區入口（2 個選區圖示連結），實際名單要進 `.../web/UnitStaff_New/Default.aspx?c0=3716&d0=3680&p0={0,1}`（p0=0 第一選區、p0=1 第二選區）各自一頁。
- 每位議員是 `li > img` + 相鄰 `a#a_font`（`href` 為 `Default2.aspx?c0=3716&p0={id}` 個人頁），**姓名藏在 `a` 的 `title`/文字裡且格式是「姓+職稱+名」**（如「張副議長榮藏」「陳議長姿妏」），需用正則整段移除「副議長」「議長」「議員」字串（不能只 strip 開頭，職稱在姓名中間）還原本名。
- 圖片路徑為站方相對路徑 `/_admin/_upload/UnitStaff/.../*.jpg`，需補 `https://www.cycc.gov.tw` 前綴。
- 2 選區加總 20 人（8+12），與嘉義市議會應選席次相符，無懸缺。

## 嘉義縣議會

- 名單頁 `https://www.cyscc.gov.tw/Parliamentary_index/315/` 是前端 Vue 頁殼，資料來自乾淨的 JSON API：`GET https://api.cyscc.gov.tw/1/Parliamentary_index/315?handler=News&PageIndex=1&PageSize=100`（一次拿全部，免分頁迴圈）。
- 回傳欄位直接是中文鍵（`姓名`、`選區`、`FirstPicFullPath`、`Path`），照片是完整絕對網址可直接用，`Path` 拼 `https://www.cyscc.gov.tw` 前綴即 profile_url。
- 唯一例外：議長（張明達）的 `姓名` 欄位同樣混入職稱變成「張議長明達」，其餘 36 人姓名皆乾淨，寫入前對全體跑一次「移除副議長/議長/議員」正則即可安全處理。
- `DataCount` 回報 37，與抓到筆數一致，無懸缺（7 個選區，含第七選區山地原住民 1 席）。

## 屏東縣議會

- 名單頁 `https://www.ptcc.gov.tw/?Page=Persional&Guid=1c445ed1-8f2f-4c7f-75f6-6d6aafa3516e`：16 個選區（含 9 個原住民鄉個別選區）的 table，`td.list.evacategory` 為選區文字、隨後 `td.list.borderleft` 內一串 `a[href*="Guid="]` 即議員姓名＋個人頁連結，**但列表頁本身沒有照片**。
- 需對全部 51 個 `?Page=PersionalDetail&Guid=...` 個人頁逐一 fetch（1s 節流），照片為 `img[src^="./upload/upimage/"][alt$="相片"]`（檔名格式 `{guid}-S.jpg`），需用 `new URL(相對路徑, 站根)` 解出絕對網址。
- 16 選區加總 51 人（12+6+10+7+3+3+9×1），與抓到筆數一致，無懸缺；其中一位原住民選區議員姓名含族語（「李紀財 Mulaneng Paliuliu」），原樣保留未拆解。

## 宜蘭縣議會

- **整站為舊式 frameset + Big5 編碼**（`<meta charset="big5">`），curl 需用 `iconv -f big5 -t utf-8` 或等效解碼，否則姓名全亂碼。
- 名單頁在 `Html/H_05/H_05.asp`（從首頁 `left.htm` 選單「議員便民服務」→ `Incfiles/PBrowse.aspx?Sys_id=PH_05` 轉址過去），13 個選區（含山地/平地原住民各自獨立選區）依序列出，每位議員的連結是 `href="../../Incfiles/PBrowse.aspx?Sys_id=PMZ{姓名},{選區號},{黨籍},{代碼},"`（**Sys_id 裡直接編碼了姓名/選區號/代碼**，等於列表頁本身已含全部所需欄位，不用再逐一開個人頁）。
- **關鍵發現**：照片網址可用代碼直接組出，不必真的訪問個人頁——`https://www.ilcc.gov.tw/pictures/people/{代碼}.JPG`（如 `A2001.JPG`），實測全部 33 筆皆為 200 真實圖片；`PBrowse.aspx` 轉址本身依賴 session cookie 才能跳轉到正確個人頁（純 curl 不帶 cookie 會 500），但既然照片路徑可直接構造，可完全略過這一步。
- 姓名內偶有全形空白排版雜訊（如「林　麗」需清成「林麗」，經 Web 查證確認本名為二字）。
- 13 選區加總 33 人（單號選區為區域、11/12 為山地原住民、13 為平地原住民），代碼序號 A2001~A2036 中有缺號（如 A2007/A2012/A2030 未出現），判斷為卸任/從缺席次，比對不到即留 null，不用特別處理。

## 臺北市議會

- 名單頁 `https://www.tcc.gov.tw/cp.aspx?n=13898`：純靜態 HTML（非 iframe/JS），一次抓完整頁即含全部 8 選區。頁面內選區標題（如「第一選區<br>北投/士林」）出現兩次——一次在頁首快速跳轉選單（`<a href="#GroupXXX" ... target="_self">`，跳轉錨點連結，非內容分節）、一次在真正內容區塊（`<div data-index="0"><span><a title="..." id="">`，無 `target` 屬性）；用 regex 分節時務必只匹配後者，否則會把導覽選單也算進某個選區導致人數對不上。
- 每位議員卡：`<li><a class="div" href="Councilor_Content.aspx?n=13898&s={id}" title="{姓名}"><div class="img"><span style="background-image: url('{img_url}')">`，img_url 為 `ws.tcc.gov.tw` 絕對網址可直接用。
- 頁面另有 `議員人數：` 標記可佐證官方選區應選席次（12+9+9+8+8+13+1+1=61，與臺北市議會法定 61 席一致），但實際抓到現任僅 53 人（各選區均有缺額，缺額最多的第三選區 松山/信義 應選 9 僅見 6 人），研判為多人於 2024 立委選舉後轉任、遞補/補選尚未完成或未更新於此頁，屬正常現象，比對不到的席次留 null 即可，不用特別處理。

## 新北市議會

- 名單頁 `https://www.ntp.gov.tw/councilor-all?program=37`：純靜態 HTML，13 選區一次全部列在同頁（`<h4><span>第N選區議員介紹</span></h4>` 分節），免翻頁/免 API。
- 每位議員卡：`<a href="councilor-detail?program=37&A={area}&C={id} "><img src="{img_url}"/><p>{姓名}</p></a>`（注意 href 尾端與 `<p>` 內文字前後都帶多餘空白，需 trim）。
- 少數原住民選區姓名含族語，且**姓名內含空白**（如「宋雨蓁 Nikar‧Falong」「馬見Lahuy．Ipin」），regex 抓取時不能用 `[^\s<]+`（會漏掉這類姓名），需改用 `[^<]+` 再對整段 trim/正規化空白。
- 13 選區加總 64 人，與新北市議會應選 66 席（扣 2 缺額）大致相符，無明顯異常。

## 桃園市議會

- 名單頁 `councilor-info.aspx?mid=39` 本身是空殼（`iframe`/前端渲染），純 curl 抓不到任何議員資料，**需改抓分選區列表頁**：`https://www.tycc.gov.tw/tc/councilor-all.aspx?mid=39&area={1..14}`（14 個選區各自一頁，逐一 fetch，1s 節流）。
- 每位議員卡：`<a id="ltLink" href="councilor-detail.aspx?mid=39&num={id}"><b><img id="ltImage" title="{姓名} {職稱}" src="{img_url}" border="0" /></b>`，`title` 屬性格式為「姓名 職稱」（職稱為「議員」「副議長」或「議長」），需 strip 職稱尾碼還原姓名。
- **img src 內含反斜線 `\`**（如 `/tc/file\person\app\a635836...jpg`，站方 Windows 路徑風格未轉換），必須手動把 `\` 換成 `/` 才是合法 URL，否則抓不到圖（實測直接請求含反斜線的原始字串瀏覽器/curl 仍可 200，但保險起見統一轉換）。
- 選區標題在 `<h4><span>第一選區 桃園區 介紹</span></h4>`，需去掉尾端「介紹」字樣。
- 14 選區加總 61 人（12+3+5+4+2+2+11+6+3+3+1+2+4+3），與桃園市議會應選 63 席（扣 2 缺額）相符。

## 臺中市議會

- `main.asp?uno=16`（選單標示的「議員一覽表」）與 `main.asp?uno=92&zno={id}`（分選區頁）本身都是外殼頁，真正內容在 `<iframe src="wb_introductionNN.asp?...">` 內；**議員一覽表的 iframe 固定指向 `wb_introduction01.asp`（不帶查參）**，直接 fetch 這支頁面即可拿到全部 17 選區內容（單頁全列出，免逐選區迴圈）。
- 每位議員卡：`<div class="Mcouncillor_title">第N選區<span>鄉鎮清單</span></div>` 分節，卡片為 `<div class="list_img"><a href="main.asp?uno=14&cno={id}"><img src="{img_url}" .../></a></div><div class="list_note"><a ...>{姓名}</a>`。
- 圖片走站方縮圖服務 `Conn2/ConnThumb.asp?F={檔名}&P=Pic\Councillor&U=1&LW=100&LH=130`（P 參數同樣含反斜線，需轉正斜線）；**移除 `&LW=&LH=` 兩個尺寸參數會回傳原圖尺寸**（實測 content-length 從 12150 漲到 19670 bytes），比列表頁預設的 100x130 縮圖更適合當 img_url 來源。
- 17 選區（含第十五~十七選區為原住民選區）加總 62 人，與臺中市議會應選 65 席（扣 3 缺額）相符。

## 臺南市議會

- 名單首頁 `subhome.asp?orcaid=C56635AE-3C35-4233-8561-7B2CAA2DF01F`（不帶 `orcaid2`）只會顯示**預設的第一選區**內容，其餘 12 選區需帶 `&orcaid2={district_guid}` 逐一 fetch（district_guid 從首頁選單的 `<a href="subhome.asp?orcaid=...&orcaid2=...">` 取得，1s 節流）。
- 每位議員卡：`<a href="councilorpage.asp?mainid={guid}"><div class="rounded-circle overlay-container" style="...background-image:url({img_url});..."></div><div class="body..."><div class="title"><span class="peoplebold"...>{姓名}</span>`，img_url 為站方相對路徑（`warehouse/{district_guid}/{姓名}.jpg`），需用 `new URL()` 解出絕對網址。
- 少數原住民選區姓名內含 `<br/>` 換行（如「施余興望<br/>Tjakumay Tagaw」），regex 抓取 `<span>` 內容時要用 `.*?` 非貪婪並允許跨標籤，取到後再把 `<br/>` 換成空白、正規化空白。
- 13 選區加總 57 人（6+5+3+1+5+6+7+6+6+5+5+1+1），與臺南市議會第四屆現任總席次一致，無明顯異常。

## 高雄市議會

- 名單頁 `Member_List1.aspx?n=39&sms=9028` 有分頁（`PageSize=20`，共 4 頁：`&page={1..4}`），需逐頁 fetch（1s 節流）合併，單頁只有 20~25 筆不是完整名單。
- 每位議員卡：`<a title="{姓名}_ContentPage" href="MemberInfo_New.aspx?n=39&sms=9028&msn={id}"><div class="img"><img alt="{姓名}_大頭照" src="{img_url}"></div><div class="name">{姓名}</div><div title="{黨籍}" class="detail ..."`>第 <span>{選區號}</span> 選區</div>`，選區與姓名皆結構化欄位，不需另外解析選區標題文字。
- 圖片為 PNG（`ws.kcc.gov.tw/.../xxx@190x260.png`），非 jpg，記錄時勿假設副檔名。
- 4 頁加總 65 人，剛好等於高雄市議會法定 65 席，**目前無缺額**（與設計文件預估的「65-3缺」不同，以實際抓到結果為準）。

## 已解職議員照片（Wayback 歷史快照）補充（2026-07-24）

以 `archived-<縣市>議會.json` manifest（Wayback 快照、離任前時點）補得 19 位已解職議員照片。
**以下 15 位經完整查證後結構性不可得**（供未來重試者免重工；唯一可能剩餘來源：中選會選舉公報）：

- 屏東縣 6 位（吳亮慶/張振亮/王景山/潘連周/郭再添/王啟敏）：ptcc.gov.tw 全網域 2022-07-05 後零快照（CDX 全查證），本屆任期完全無存檔。
- 宜蘭縣 莊淑如/李茂豐：名單頁有存檔，但 pictures/people/A2007.JPG、A2030.JPG 圖檔本身從未被抓存（CDX 零筆）。
- 金門縣 楊育菡：個人頁有存檔，media/24323 圖檔未被抓存。
- 臺東縣 嚴惠美/黃碧妹：官網為 Vue SPA，/api/member 從未被存檔，HTML 殼無資料。
- 花蓮縣 張正治：在任窗口（2022-12-25〜2023-01-19）無任何快照。
- 彰化縣 施嘉華：唯一個人頁快照（2023-09-25）引用之圖檔未被抓存。
- 雲林縣 蕭慧敏：舊版頁照片為 inline base64（無獨立圖檔 URL），新版 CMS 快照始於 2026-04（已離任）。
- 新竹縣 陳德木：離任前僅兩次全站掃描（2022-12-30/2023-02-14），其個人頁皆未被涵蓋。

**2026-07-24 補記：以上 15 位已全數用中選會選舉公報補齊**（`eebulletin.cec.gov.tw/?dir=111/<縣市>`
→ `02縣議員` 分類 → 對應選舉區 PDF，B/W 掃描但姓名可精確比對）。逐一來源與裁切方式見
`scraper/fixtures/photo-attributions.md`；照片已直接寫入 `public/photos/councilors/` 並更新
`officials.photo_url`（`scraper/set-bulletin-photos.ts`，因 photos-record.ts 的下載器僅支援
http(s) 而非本機檔案，故未走 manifest 比對流程）。此公報站點無 API/清單頁，只能靠「先列出
`?dir=` 目錄結構找到縣市/選區 PDF 檔名，再用 PyMuPDF 轉圖、人工比對姓名鎖定相片格」的方式取得，
若日後重跑同類任務可直接沿用此站點與流程。
