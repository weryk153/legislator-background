# 人物關係圖 維基擴充 設計 spec

**目標**：（一）補上有維基條目的外部人物照片；（二）以既有外部人物為起點，從維基百科擴充關係到 **2 度**（公職 → 外部人物 → 外部人物的關係人）。

**前置**：延續 `2026-06-24-relationship-graph-design.md`（schema、匯入、匯出）與 `2026-07-29-relationship-graph-visual-design.md`（視覺化，已全部交付）。後者 §4.2 把外部人物照片列為另案，本 spec 即該另案。

**技術棧**：不新增依賴。沿用 `scraper/lib/wiki.ts` 的 zh.wikipedia API 存取、`sharp` 縮圖、vitest。

---

## 1. 範圍

- **照片**：所有在 `entities-wiki.json`（§3）中對到維基條目的外部人物，**不分 entity_type**。「有條目」即視為公眾人物；標為 `family_member` 但本身是政治人物者（張榮味、徐振興…）一樣補。沒有條目的一般民眾家屬不補、也不去找。
- **關係擴充**：只以 `entities-wiki.json` 名單為 subject 往外抓**一跳**，不遞迴。新出現的關係人若沒有條目就停在那裡；若有條目也不再往下抓（除非日後把他加進 `entities-wiki.json`，那是下一輪的事）。
- 1 度關係（subject 為立委／首長）本輪**不**重做，也不擴到議員。
- 所有關係仍然**逐筆人工審定後才入 curated**，腳本只產候選，絕不自動入庫。

### 1.1 資料現況（2026-08-25 快照）

- graph.json：352 節點（150 公職 ＋ 202 外部人物）／262 邊。
- 外部人物：family_member 139、other 48、organization 8、businessperson 4、media 3；**照片 0 張**；`entities.wikipedia_url` 全為 null。
- `relationships-curated.json` 260 列，subject 全為立委／首長（`import-relationships.ts` 用 `officialId(subject, restrict=true)` 限制）；DB 內 entity→entity 的邊為 0。
- 關係來源：219 條 zh.wikipedia，其餘新聞。

### 1.2 完成後（2026-08-25）

- **對照表**：202 位外部人物中 114 位維基搜尋有候選，逐筆比對描述與導言後收 **100 位**；
  拒絕 16 筆同名不同人（楊明哲＝羽球選手、李婷婷／王慧玲／王春梅等中國人物、林三郎＝日本
  畜牧學家、蔡宗佑＝棒球選手…），蘇系為消歧義頁不收。同名不同人以 `distinct` 區分 2 筆
  （李佳芬＝韓國瑜之妻、李傑＝海軍上將）。
- **照片**：**66 張**（Attribution 48、CC 系列 16、公有領域 2），33 人條目無主圖、1 個派系
  主圖為 SVG 徽章跳過；縮圖總表逐張目視確認皆為單人肖像。實作時發現台灣政府機關依
  《政府資料開放授權條款》上傳的官方肖像在 Commons 只標 `Attribution`，佔近半數，故
  §5 的允許清單納入該值。
- **2 度關係**：infobox 家族欄位 170 項、關鍵句 676 句逐筆審定，新增 **99 筆**（另 35 筆與
  既有 1 度關係重複，由既有資料涵蓋）。收錄準則：家族關係只收 counterpart 本身有維基條目
  或在本站名冊者；政治關係只收條目明確陳述的現任成員／任職事實，已退流、已除名、已退出
  與轉述指控一律不收。
- **graph.json**：352 → **416 節點**（157 公職 ＋ 259 外部人物）、262 → **361 邊**，其中
  entity→entity 的第二層邊 **77 條**。測試 310 筆。

## 2. 關鍵限制：entity 沒有穩定身分

`pnpm run import:relationships` 每次重跑會刪掉所有非判決來源的關係、回收孤立 entity、再從 curated 全部重建（新 UUID）。因此：

- **任何寫在 DB `entities` 上的資料（photo_url、wikipedia_url）重匯即消失**。
- 本 spec 的真相來源一律是版控檔案：`scraper/entities-wiki.json`（§3）。`import-relationships.ts` 在建 entity 時從這份檔案套上 `wikipedia_url` 與 `photo_url`（§6）。照片腳本只下載檔案並更新 json，不碰 DB。
- entity 的識別鍵沿用 import 既有規則：`name`，或人工標記同名不同人時為 `name::distinct`（對應 curated 的 `counterpartDistinct`）。

## 3. 對照表 `scraper/entities-wiki.json`（新，進版控）

```jsonc
[
  {
    "name": "柯文哲",
    "distinct": "",                          // 同名不同人時填，值須與 curated 的 counterpartDistinct 一字不差
    "wikiTitle": "柯文哲",                   // 維基條目標題（API 用）
    "wikipediaUrl": "https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2",
    "photo": {                               // 由 enrich:entity-photos 寫入；沒抓到就沒有此欄位
      "file": "/photos/entities/柯文哲.jpg",
      "author": "…",                         // Commons extmetadata Artist（去 HTML）
      "license": "CC BY-SA 4.0",             // extmetadata LicenseShortName
      "commonsUrl": "https://commons.wikimedia.org/wiki/File:…"
    }
  }
]
```

- 唯一鍵：`name` ＋ `distinct`。
- **只收人工確認過的對照**。產生流程見 §4；任何「查無條目」「導言與 description 對不上」「消歧義頁」都不寫進來。
- 這份名單同時是 §5 照片與 §7 萃取的**唯一**輸入。

## 4. 對照候選腳本 `wiki:resolve-entities`（`scraper/wiki-resolve-entities.ts`）

- 撈 DB 全部 `entities(name, entity_type, description)`。
- 每人呼叫 `action=query&list=search&srsearch=<name>&srlimit=5`，對每個命中再取導言（`action=parse&prop=wikitext&section=0`，走既有 `wikitextToSummary`，200 字）。
- 輸出 `scraper/out-wiki-relations/resolve.json`（目錄 gitignored）：`{ name, distinct, description, candidates: [{ title, lead }] }`。已在 `entities-wiki.json` 的人跳過。
- **人工步驟**：逐筆比對 description 與 lead，確認同一人才寫入 `entities-wiki.json`。判斷原則沿用「常見名寧缺勿錯」——導言若無法佐證職務／身分，不收。
- 派系組織（新潮流系、正國會…）也可對到條目，一樣收；它們沒有臉，但 §7 抓成員／召集人關係時需要。

## 5. 照片 `enrich:entity-photos`（`scraper/enrich-entity-photos.ts`）

- 輸入 `entities-wiki.json`；已有 `photo` 且檔案存在者跳過（`FORCE=1` 重抓；`DRY_RUN=1` 只報告不寫）。
- 取圖：`action=query&prop=pageimages&piprop=original|name&titles=<wikiTitle>`。無主圖 → 列報「無主圖」，不寫 `photo`。
- 授權：`action=query&prop=imageinfo&iiprop=extmetadata&titles=File:<name>`，讀 `LicenseShortName`、`Artist`、`Credit`。**只收** `LicenseShortName` 符合 `/^(CC|Public domain|CC0|PD|Attribution$)/i` 者；其他（含 fair use、無授權資訊）列報「授權不符」並跳過。（2026-08-25 實作時發現：台灣政府機關依《政府資料開放授權條款》上傳的官方肖像，Commons 只標 `Attribution`，屬署名即可使用的自由授權，49／100 人的主圖都是這類，故納入。）
- 下載 → sharp 縮 320px 寬 jpg → `public/photos/entities/<name>.jpg`（有 `distinct` 時為 `<name>-<distinct 前 8 字>.jpg`；檔名用中文比照 `public/photos/councilors/` 慣例）。
- 寫回 `entities-wiki.json` 的 `photo` 欄位。腳本以 `fetchPolite` 存取，每次請求間隔 ≥ 500ms。
- 授權呈現（CC BY 系列要求可見署名）：
  - graph.json entity 節點帶 `photoCredit: "作者／授權"`（§8）。
  - 關係圖 tooltip：hover 有照片的外部人物時，在名稱／描述下多一行「照片：作者 · 授權」，並附條目連結。
  - `src/pages/about.astro` 資料來源清單加一條：「外部人物照片：維基百科條目主圖（Wikimedia Commons），逐張作者與授權見資料庫附註」。

## 6. `import-relationships.ts` 改動

### 6.1 curated 格式擴充（`scraper/relationships-curated.json`）

新增兩個選填欄位，舊列一律不動：

- `subjectKind?: 'official' | 'entity'`（省略 ＝ `official`）。
- `subjectDistinct?: string`：subject 為 entity 且同名不同人時填，值與該 entity 建立時的 `counterpartDistinct` 一字不差。

### 6.2 端點解析抽成純函式 `scraper/lib/relEndpoints.ts`

從 import 腳本搬出、不改行為：

- `resolveSubject(row, roster, entityCache) → { type, id } | { skip: reason }`
  - `subjectKind` 省略／`official`：沿用 `officialId(name, restrict=true)`（限立委／首長、唯一匹配）。
  - `subjectKind === 'entity'`：從 entityCache 找 `name` 或 `name::subjectDistinct`；找不到 → skip，理由「subject entity 尚未建立」。
- `resolveCounterpart(row, roster) → { type: 'official', id } | { type: 'entity' }`
  - 沿用：`counterpartDistinct` 有值 → 一律 entity；否則 `counterpartKind === 'official'` 且名冊唯一匹配（不限層級）→ official；其餘 → entity，且 `counterpartKind === 'official'` 者記入 fell-through 報告。
- `roster` 為 `{ id, name, office_type }[]`，`entityCache` 為 `Map<string, string>`；兩者都由呼叫端注入，函式無 I/O。

### 6.3 兩輪匯入

1. 先處理所有 official-subject 列（現行流程），建出所有 entity。
2. 再處理 entity-subject 列：subject 從 entityCache 取；counterpart 走 `resolveCounterpart`，需要時 `ensureEntity`。
3. 方向規則不變：`parent_child` 有向、`parentName` 決定 from；其餘無向。自連由 DB check 擋，import 端也預先 skip 並列報。

### 6.4 `ensureEntity` 套用對照表

建 entity 時以 `name`／`name::distinct` 查 `entities-wiki.json`，有則寫入 `wikipedia_url` 與 `photo_url`（`photo.file`）。沒有對照的 entity 兩欄維持 null。

### 6.5 報告

匯入結尾新增兩段：
- entity-subject 列中 subject 找不到的清單（代表 curated 拼字或 distinct 不一致，必須人工處理）。
- `entities-wiki.json` 中有、但本次匯入沒建出對應 entity 的名單（代表該人已從 curated 消失，對照表該清掉）。

## 7. 2 度關係萃取 `wiki:discover-relations`（`scraper/wiki-discover-relations.ts`）

### 7.1 純函式（`scraper/lib/wikiRelations.ts`）

- `parseInfoboxRelations(wikitext) → InfoboxRelation[]`
  - 找最外層 `{{Infobox …}}` 模板，讀欄位 `配偶|伴侶|spouse|父母|父親|母親|parents|子女|兒女|children|親屬|親戚|relatives|家族`。
  - 值可能是多行、`{{ubl|…}}`／`{{plainlist|…}}`／`<br>` 分隔、`[[連結|顯示]]`、`-{}-` 轉換標記、附註括號（「（1995年結婚）」）。每個值拆成 `{ field, name, wikilinkTitle?, raw }`。
  - 沿用 `wiki.ts` 現有的 `-{}-` 與模板處理邏輯（必要時把該段抽成可共用的小函式，不複製）。
- `extractRelationSentences(wikitext) → SentenceCandidate[]`
  - 去 ref／模板／連結後切句（。！？），保留句中出現的 `[[wikilink]]` 標題清單。
  - 命中關鍵字才留：家族 `妻|夫|配偶|之子|之女|之兄|之弟|之姊|之妹|長子|次子|女兒|兒子|父親|母親|胞兄|胞弟|胞姊|胞妹|兄長|弟弟|姊姊|妹妹|姪|甥|岳父|女婿|媳`；政治 `師承|恩師|門生|子弟兵|提拔|拔擢|幕僚|助理|辦公室主任|派系|新潮流|正國會|湧言會|蘇系|英系|支持|力挺|接班`。
  - 輸出 `{ sentence, keywords[], wikilinks[] }`。
- 兩者都是純字串處理，無 I/O。

### 7.2 腳本

- 輸入 `entities-wiki.json`；每人抓整頁 wikitext（`action=parse&prop=wikitext`）。
- 輸出 `scraper/out-wiki-relations/<name>[-<distinct>].json`：
  ```jsonc
  { "subject": "柯文哲", "distinct": "", "wikipediaUrl": "…", "retrievedAt": "2026-08-25",
    "infobox": [ { "field": "配偶", "name": "陳佩琪", "wikilinkTitle": "陳佩琪", "raw": "[[陳佩琪]]" } ],
    "sentences": [ { "sentence": "…", "keywords": ["幕僚"], "wikilinks": ["…"] } ] }
  ```
- 已有輸出檔者跳過（`FORCE=1` 重抓）。同樣走 `fetchPolite`。

### 7.3 人工審定（我做，規則與上一輪一致）

- 逐筆對照 excerpt／原條目，決定 `relationType`、方向、`note`（寫事實與年份，不推論）、`counterpartKind`（名冊有這個人且唯一 → `official`；否則 `entity` 並給 `counterpartEntityType` 與 `counterpartRole`）。
- `sourceUrl` 為 subject 的條目 URL（關係在誰的條目上查到就附誰的）。
- 不收：模糊的「支持」「合作」「同黨」；只在單一新聞句出現、條目本身沒有 ref 的說法；無法確認身分的常見名。
- 同名不同人：counterpart 若與名冊或既有 entity 撞名且確認不同人，寫 `counterpartDistinct`。
- 結果直接追加到 `relationships-curated.json`，`subjectKind: "entity"`。

## 8. 匯出與前端

- `src/lib/types.ts`：`GraphNode` 的 `photoUrl` 註解改為「official 或有照片的 entity」；新增 `photoCredit?: string`、`wikipediaUrl?: string`（皆 entity 專用、null 時省略）。
- `src/lib/graph.ts` `buildGraphData`：entity 節點帶 `photoUrl`（來自 `entities.photo_url`）、`wikipediaUrl`；`photoCredit` 由 `export-graph.ts` 讀 `entities-wiki.json` 組成「作者／授權」後傳入（DB 不存授權欄位，避免 migration）。DB entity 沒有 `distinct` 欄位，所以對照表與 DB 列的配對鍵用 `wikipedia_url`（匯入時已從對照表寫入，每條目唯一），不用姓名。
- `scraper/export-graph.ts`：查詢已含 `photo_url, wikipedia_url`，只需讀對照表補 credit。
- `src/lib/graphView.ts`：`avatar: n.photoUrl ?? avatarDataUri(n.name)` 已不分 kind，預期不用改；實作時以測試確認 entity 帶 photoUrl 時輸出照片。
- `RelationshipGraph.svelte`：節點 tooltip 對 entity 顯示描述、「條目 ↗」連結（有 `wikipediaUrl` 時）、「照片：`photoCredit`」（有時）。連線 tooltip 不變。
- `egoSubgraph(…, 2)`、`/graph` 篩選與搜尋不改；entity→entity 的邊在檔案頁自然落在第二層（既有「關係人的關係人」說明已涵蓋），在 `/graph` 直接顯示。

## 9. 測試

- `test/wikiRelations.test.ts`：infobox 多值（ubl／br／逗號）、`-{}-` 轉換、巢狀模板、無 infobox；句子抽取的關鍵字命中與 wikilink 保留、去 ref 後不殘留 URL。
- `test/relEndpoints.test.ts`：subject 限立委／首長；`subjectKind: entity` 從快取找 name／name::distinct、找不到 skip；`counterpartDistinct` 強制 entity；counterpart 名冊唯一匹配、多筆同名降級 entity 並記 fell-through。
- `test/entitiesWiki.test.ts`：`entities-wiki.json` 結構驗證——name＋distinct 唯一、`wikipediaUrl` 為 zh.wikipedia、有 `photo` 者 `file`／`license`／`commonsUrl` 齊全且 `file` 指向 `/photos/entities/`。
- `test/graph.test.ts` 補：entity 帶 photo_url → 節點有 `photoUrl`；null → 無此欄位；`photoCredit`、`wikipediaUrl` 同理。
- `test/graphView.test.ts` 補：entity 有 `photoUrl` 時 avatar 為該 URL。

## 10. 邊界與錯誤處理

- 維基 API 錯誤／查無頁面：該人列報並跳過，腳本不中斷。
- 主圖是 SVG／非點陣（少見，多為徽章）：跳過，列報。
- 條目主圖不是本人（合照、建築）：腳本無法判斷；`DRY_RUN` 報告列出圖檔名，人工看一遍再正式跑，發現錯的把該筆 `photo` 刪掉並加 `"noPhoto": true` 讓下次跳過。
- 重匯後 entity UUID 全變：graph.json 節點 key 跟著變，屬既有行為；照片路徑以檔名為準，不受影響。
- curated 的 `subjectDistinct` 與建立該 entity 的 `counterpartDistinct` 拼字不一致：import 列報「subject entity 尚未建立」，不靜默建新節點。

## 11. 交付階段

**Stage 1（可獨立驗收）：對照表與照片**
1. `wiki:resolve-entities` ＋ 人工審定 → `entities-wiki.json`
2. `enrich:entity-photos` ＋ DRY_RUN 目視核對 → 照片落地
3. `ensureEntity` 套用對照表（§6.4）＋ 匯出／前端（§8）＋ about 頁
4. 重匯 → `export:graph` → 驗收：/graph 上有條目的外部人物出現頭像與授權

**Stage 2：2 度關係**
5. `relEndpoints.ts` 抽出＋測試、兩輪匯入（§6.2–6.3、6.5）
6. `wikiRelations.ts` ＋ `wiki:discover-relations`
7. 人工審定 → curated 追加 → 重匯 → `export:graph` → 驗收：檔案頁第二層出現外部人物的關係人

## 12. 非目標（YAGNI）

- 不遞迴到 3 度；新出現的關係人不自動加進 `entities-wiki.json`。
- 不補 1 度關係、不把議員納為 subject。
- 不用 Wikidata。
- 不做 entity 的獨立檔案頁；tooltip 的條目連結已足夠。
- 不為授權資訊加 DB 欄位或 migration。
- 不自動判斷照片是否為本人。
