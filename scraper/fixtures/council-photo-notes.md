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
