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
