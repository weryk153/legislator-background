# 人物關係圖 設計 spec

**目標**：在 legislator-background 加上「公眾人物關係網路圖」——以政治人物為主軸，將公職人員與外部公眾人物之間的家族、政治關係連結並視覺化呈現。

**架構**：延伸現有 Astro SSG + Svelte + 本地 Supabase 管線。新增兩張表（entities、relationships），build 時匯出成 committed `graph.json`，前端以 Cytoscape.js 在 Svelte island 渲染。零 runtime DB，完全沿用現有模式。

**技術棧**：Astro + Svelte、Supabase(Postgres)、Cytoscape.js（含 cytoscape-dagre 佈局擴充）。

---

## 1. 範圍與定位

- **重心**：政治人物為主軸。現有公職人員（~1000 筆，office_type = legislator / mayor_magistrate / councilor）是圖的骨幹；非政治人物因為「連到政治人物」才出現。
- **公眾人物 ≠ 政治人物**：節點包含外部公眾人物（企業家、宗教領袖、藝人、媒體人、純家屬、組織），他們只有姓名＋簡介、無完整檔案頁。
- **關係類型**：家族 ＋ 政治（不含純商業；商業關聯先歸 other 或延後）。
- **資料原則**：沿用網站「每筆附來源、寧缺勿濫」精神，每條關係都要有 source。
- **呈現**：①檔案頁內嵌 ego 關係網；②獨立全局關係圖頁。
- **視覺**：網路圖（force / 分群佈局），非嚴格族譜樹狀。

## 2. 資料模型

不動現有 `officials` 表。新增：

### `entities`（外部非公職公眾人物）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid PK | |
| name | text | 姓名 |
| entity_type | enum | businessperson / religious / celebrity / media / family_member / organization / other |
| description | text | 簡短介紹（一兩句） |
| photo_url | text null | |
| wikipedia_url | text null | |
| created_at | timestamptz | |

### `relationships`（人與人的連線）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid PK | |
| from_type | enum ('official','entity') | 端點 A 種類 |
| from_id | uuid | 端點 A id（對應 officials.id 或 entities.id；app 層保證完整性） |
| to_type | enum ('official','entity') | 端點 B 種類 |
| to_id | uuid | 端點 B id |
| relation_type | enum | 見 §2.1 |
| directed | bool | 父子=true(from 父 → to 子)；夫妻/兄弟=false |
| note | text null | 自由說明，如「2014–2018 任其助理」 |
| source_id | uuid → sources | 每條都要有來源（沿用現有 sources 表 / SourceType） |
| created_at | timestamptz | |

約束：`from` 與 `to` 不可相同（無自連）；對稱關係（directed=false）在匯出時去重，避免 A–B、B–A 重覆。

### 2.1 關係類型分類（relation_type enum）
- **家族**：`spouse` 配偶、`parent_child` 親子、`sibling` 兄弟姊妹、`relative` 其他親屬（翁婿、叔姪等）
- **政治**：`faction` 同派系、`mentor` 師徒/提拔、`party_bloc` 同黨團、`aide` 助理→參選、`backer` 金主/政治獻金、`co_case` 共同被告/司法關聯

### 2.2 Migration
`supabase/migrations/0006_relationships.sql`：建立兩個 enum、entities、relationships，必要索引（from_id、to_id、relation_type）。

## 3. 匯出格式（`src/data/graph.json`）

build 時由 export 腳本產生並 commit，結構：
```json
{
  "nodes": [
    { "key": "official:<uuid>", "name": "...", "kind": "official",
      "subtype": "councilor", "slug": "...", "party": "...", "officeType": "councilor" },
    { "key": "entity:<uuid>", "name": "...", "kind": "entity",
      "subtype": "businessperson", "description": "..." }
  ],
  "edges": [
    { "source": "official:<uuid>", "target": "entity:<uuid>",
      "type": "spouse", "directed": false, "note": "...", "sourceUrl": "..." }
  ]
}
```
- node `key` = `<type>:<id>`，全圖唯一。
- 只匯出至少有一條關係的節點（孤點不入圖）。
- official 節點帶 slug → 可連回檔案頁；entity 節點無 slug。

型別定義加進 `src/lib/types.ts`：`GraphNode`、`GraphEdge`、`RelationType`、`EntityType`。

## 4. 前端元件與頁面

### `RelationshipGraph.svelte`（核心，client-only island）
- props：`nodes: GraphNode[]`、`edges: GraphEdge[]`、`mode: 'ego' | 'global'`、`centerKey?: string`
- 在 `onMount` 動態 import Cytoscape（避免 SSR）；Astro 端用 `client:visible`。
- 節點樣式：公職人員＝實心（點擊→檔案頁）、外部 entity＝外框；色彩帶政黨/類型暗示。
- 連線樣式：每種 relation_type 不同顏色/線型（家族實線、政治虛線），directed 邊帶箭頭。
- hover → tooltip：關係說明 + 來源連結。

### 情境一：檔案頁 ego 網（Phase 1）
- 在現有官員頁（`src/pages/officials/[id].astro` 或對應路由）加「人物關係」區塊。
- 從 graph.json 取出 centerKey 的 1–2 跳子圖（前端或 build 期計算）。
- 無任何關係的人 → 不顯示此區塊。
- 佈局：concentric（本人置中）。

### 情境二：獨立全局圖頁（Phase 2）
- 新頁 `src/pages/graph.astro`（路由 /graph）。
- 全圖 + 篩選（關係類型 / 縣市 / 政黨）+ 搜尋。
- 佈局：cose（力導向）預設；家族/派系用 Cytoscape compound node 框成群組；可切 dagre 看家族階層感。

## 5. 資料建立流程（半自動萃取 + 人工校對）

### 萃取腳本 `scraper/extract-relationships.ts`
- 掃現有 judgments / controversies 內文的關係關鍵字（夫、妻、配偶、父、子、兄、弟、姊、妹、助理、共同被告、同案、樁腳…）→ 產出候選關係（含來源＝該判決/爭議）。
- 撈維基百科官員頁的 配偶 / 親屬 / 派系 欄位 → 候選關係。
- **只輸出候選清單（JSON / 表格），不直接寫入 DB**。

### 人工校對
- 逐筆確認候選關係（身分、方向、關係類型、來源），確認者存進 DB。
- Phase 1 種子資料（判決裡已現成）：
  - 孫韻璇 —配偶→ 李雲強（前桃園縣/市議員，夫妻）
  - 陳重文 —配偶→ 白惠萍（共同被告）
  - 陳怡君 —同居伴侶→ 張惠霖（共同被告）
  - 王又民 / 沈宗隆 —co_case→（雲林 113 矚訴 1 同案）
  - 再補一個已知政治家族作為示範
- 校對後 export → graph.json。

## 6. 分階段交付

**Phase 1（端到端打通）**
1. migration 0006（schema）
2. 萃取腳本 → 候選清單
3. 人工校對種子資料 → DB
4. export 擴充產生 graph.json + types
5. 檔案頁 ego 關係區塊 + RelationshipGraph.svelte（ego mode）
- 成果：少量已查證資料，檔案頁關係圖可運作。

**Phase 2（擴展）**
1. `/graph` 全局圖頁 + 篩選/搜尋
2. 家族/派系 compound 分群、dagre 階層
3. 擴大校對、補更多關係

## 7. 測試

- **萃取/export 單元測試**：節點/邊解析、對稱邊去重、有向邊方向正確、懸空邊偵測。
- **validate.ts 擴充**：邊兩端可解析、每邊有 source、無自連。
- **build smoke test**：graph.json 正確生成、檔案頁與 /graph 建得起來。

## 8. 邊界與錯誤處理

- 懸空邊（端點解析不到）→ build 時 validate 報錯擋下。
- 無關係的人 → 不顯示關係區塊。
- 對稱關係（directed=false）匯出去重；有向關係保留 from→to 方向。
- 自連（from==to）禁止。
- 重複邊去重。
- Cytoscape 純前端載入失敗 → 區塊顯示降級訊息，不影響其餘頁面。

## 9. 非目標（YAGNI）

- 不做關係的時間軸/歷史版本。
- 不做使用者自行編輯關係的前端介面（校對走 DB / 腳本）。
- 商業利益關係先不獨立分類（歸 other 或延後）。
- 全自動 LLM 大量抽取（與寧缺勿濫衝突）先不做。
