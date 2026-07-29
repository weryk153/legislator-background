# 人物關係圖 視覺化 設計 spec

**目標**：把檔案頁的「人物關係」由文字清單升級為**頭像關係圖**（圓形頭像節點 ＋ 曲線連線 ＋ 線上標註關係詞），並補上 `/graph` 全局關係圖頁。

**前置**：延續 `2026-06-24-relationship-graph-design.md`（Phase 1 已完成：schema、萃取、種子資料、export、檔案頁文字清單）。本 spec 是該文件的 Phase 2 視覺化部分，並補做一批 Phase 1 遺留的資料校對。

**技術棧**：不新增依賴。沿用既有 Astro + Svelte + Cytoscape.js。

---

## 1. 範圍

- 檔案頁 ego 關係圖（1053 頁自動生成）**與** `/graph` 全局關係圖頁 —— 兩者共用同一元件、同一套視覺語言，只差 `mode`。
- 圖涵蓋**所有關係類型**（家族 167 條 ＋ 政治 110 條），不限家族。
- 節點**不限本站收錄的公職**；外部政治人物（柯文哲、朱立倫等）同為完整節點。
- 附帶完成一批資料校對：合併被重複建立的節點。

### 1.1 期望管理（重要）

參考範例是**人工排版的海報**：每個節點的位置、每條線如何繞開其他節點，都是人手工決定的。本 spec 交付的是**同一套視覺語言 ＋ 自動排版**，兩者必然有差距：

- 線會有交叉，節點位置由演算法決定。
- 合併後 **157 / 361 個節點有照片（43%，不到一半）**。第一層鄰居多為配偶／父母等家屬，本就無照片，因此多數檔案頁會是「中間一張臉、周圍數個文字圈」。

這是資料現實，非實作缺陷。驗收時以此為準。

## 2. 資料現況（2026-07-29 快照）

| 項目 | 數值 |
|---|---|
| graph.json 節點 | 364（official 154 / entity 210） |
| graph.json 邊 | 277 |
| 有任何關係的官員 | 154 / 站上 1053 |
| 圖中官員能對到站內照片 | **154 / 154** |
| entity 有照片 | **0 / 210** |
| entity 組成 | family_member 140、other 53、organization 10、businessperson 4、media 3 |
| 最大節點連線數 | 7（派系節點最大 6） |

ego 子圖大小分布（154 位有關係的官員）：

| 節點數 | 1 跳 | 2 跳 |
|---|---|---|
| 2（只有 1 個關係人） | 65 | 41 |
| 3 | 51 | 37 |
| 4–5 | 32 | 32 |
| 6–9 | 6 | 35 |
| 10–20 | 0 | 9 |

**決策：ego 圖採 2 跳。** 1 跳有 65 頁只剩兩個圓，做成頭像圖反而比文字清單單薄；最大樞紐僅 7 條，2 跳不會失控。

## 3. 資料校對：合併重複節點

畫成圖會把資料問題放大為肉眼可見（同一人出現兩個圓）。有 6 個 entity 與本站公職撞名。

### 3.1 待合併清單（已人工確認）

依既有原則「不能只靠轄區，須職務／屆別佐證，常見名寧缺勿錯」，**只合併職務描述吻合者**。

**entity → official（5 組）**

| 姓名 | entity id | entity 描述 | official id | 本站職務 |
|---|---|---|---|---|
| 韓國瑜 | `0dc9c98f-1822-4467-b073-eae3a65fef76` | 前高雄市長、立法院院長 | `2934ac93-29eb-4e28-90a0-9a2c093c7345` | 國民黨・不分區立委 |
| 侯友宜 | `4c935497-9f90-4e2f-b293-36812423f864` | 前新北市長、國民黨總統候選人 | `0fe86bde-9363-4cf4-a293-bf2199575b79` | 國民黨・新北市長 |
| 蔡咏鍀 | `20c7d78d-a760-4fb6-a73f-850cf22211f8` | 雲林縣議會副議長、北港朝天宮董事長 | `cb52edb8-ac4f-4a44-9533-b733e86955f3` | 雲林縣議員 |
| 謝典霖 | `47d3e254-3556-48d1-bbe7-c13e5d1db7a2` | 彰化縣議會議長 | `c1357d9e-724d-4351-810d-5156446f7700` | 彰化縣議員 |
| 許家蓓 | `e2b07369-96b1-4dae-9c52-d88044227375` | 民進黨籍臺北市議員（已故） | `b3392a2c-1b4b-4978-bb02-0653c500e4a2` | 臺北市議員 |

**entity → entity（1 組）**

| 保留 | 併入 |
|---|---|
| 新潮流系 `04c84ea2-4cd2-4cb5-a3e7-8ce335f8aba5`（5 條） | 民主進步黨新潮流系 `2a5bc90c-21c9-4cbe-8094-ca0bc9ca09ec`（6 條） |

合併後該派系節點為 11 條。保留較通用的「新潮流系」為正式名稱。

### 3.1.1 合併後的節點數變化

其中韓國瑜、侯友宜的 official 節點**原本就已在圖中**（各自另有邊），合併為既有節點；蔡咏鍀、謝典霖、許家蓓的 official 節點原不在圖中，合併後新增。

```
364 − 6（5 個重複 entity ＋ 1 個重複派系）＋ 3（新入圖的 official）= 361 節點
有照片節點：154 ＋ 3 = 157 / 361（43%）
```

### 3.2 明確不合併

**張美慧** —— entity 為「張國策略傳播集團董事長暨執行長」（businessperson），本站有花蓮縣議員張美慧（民進黨）。**僅縣市相符，職務完全不同**，無從斷定同一人。依「寧缺勿錯」保持兩個獨立節點，不做任何處理。

### 3.3 合併腳本 `scraper/merge-duplicate-entities.ts`

不寫成 SQL migration —— 這是資料校對而非 schema 變更，與既有 `import-relationships.ts` 的人工校對流程一致。

- 對照表**寫死在腳本內**（即 §3.1 的 6 組），不做任何自動比對或模糊匹配。
- 支援 `--dry-run`：印出將改寫的 relationship 筆數與將刪除的 entity，不寫入。
- 執行步驟（每組）：
  1. `UPDATE relationships SET from_type=<新type>, from_id=<新id> WHERE from_type='entity' AND from_id=<舊entity id>`
  2. 同上處理 `to_type` / `to_id`
  3. 刪除自連（改寫後 `from` 與 `to` 相同者）
  4. 依 `buildGraphData` 的同一套規則去重（有向 `from|to|type`；無向排序後配對）
  5. `DELETE FROM entities WHERE id=<舊entity id>`
- 步驟 3、4 必須在刪除 entity **之前**完成，否則會留下懸空邊。
- 腳本結束後印出合併摘要，再由使用者手動跑 `pnpm run export:graph`。

**副作用（正面）**：5 位併入 officials 後自動取得站內照片，且節點變為可點進檔案頁（其中 3 位為新入圖節點，淨增 3 張臉）。

## 4. 照片

### 4.1 官員照片管線

154/154 對得到，僅缺欄位傳遞：

- `src/lib/types.ts`：`GraphNode` 新增 `photoUrl?: string`
- `src/lib/graph.ts`：`buildGraphData` 的 `RawOfficialNode` 加 `photo_url`，寫入節點的 `photoUrl`
- `scraper/export-graph.ts`：officials 查詢的 select 加 `photo_url`

entity 節點不帶 `photoUrl`（`photo_url` 欄位全為 null）。

### 4.2 外部人物照片：本輪不做

- 140 個 `family_member` 是一般民眾家屬，基於隱私本就不應貼臉。
- 10 個 `organization` 是派系，沒有臉。
- 值得補的僅柯文哲、朱立倫、吳敦義等全國知名政治人物，數量少，另案單獨處理。

無照片節點依 §5 的文字圓處理。

## 5. 視覺規格

**用色一律沿用站上既有 token 與慣例**，不另創調色盤。`--accent`（#b3271e 朱紅）在本站是強調／hover 色，**不作為內文色使用**。

### 5.1 節點

| | 直徑 | 說明 |
|---|---|---|
| 本人（中心） | 88px | 姓名加 `--accent-wash` 底色塊 ＋ `--line-strong` 框 |
| 第一層 | 64px | |
| 第二層 | 48px | opacity ≈ 0.6，細線 |

- **有照片**：`shape: ellipse` ＋ `background-image` ＋ `background-fit: cover` 圓形裁切。
- **無照片**：`--surface` 底色圓 ＋ 圓內置姓名文字。
- **邊框**：本站收錄者實線、外部人物虛線（沿用文字清單既有的 `.rel-kind.pol` 虛線語彙）。
- **標籤**：圓下方兩行（`text-valign: bottom`）。第一行姓名，第二行職稱或關係類別。

### 5.2 用色對照

| 元素 | token | 對應站上既有樣式 |
|---|---|---|
| 本站收錄者姓名 | `--fg` | `.rel-name` |
| 外部人物姓名 | `--muted` | `.rel-name.plain` |
| 職稱／類別（第二行） | `--faint` | `.rel-ext` |
| 節點邊框 | `--line-strong` | |
| 無照片節點底 | `--surface` | |
| 連線 | `--faint` | |
| 線上關係詞 | `--muted`，`--bg` 打底 | |
| hover 該條線 | `--accent` | `a.rel-name:hover` |

整張圖為紙色底、墨色字、灰線；朱紅僅出現在 hover 與中心人物。沿用既有元件的 `MutationObserver`，亮／暗模式自動換色。

### 5.3 連線

- `curve-style: bezier`。
- **家族實線／政治虛線**，沿用既有 `FAMILY_RELATIONS` 集合判定。
- 關係詞置於線中央，以 `--bg` 作 `text-background-color` 蓋住線段。
- `directed: true`（親子等）帶箭頭。
- hover 顯示 tooltip：關係、note、出處連結（沿用既有 `.rg-tip` 實作）。

### 5.4 佈局

- ego 模式：`concentric` —— 本人置中、第一層內圈、第二層外圈。取代現行 `breadthfirst`。
- global 模式：`cose` 力導向。

### 5.5 第二層的防誤讀

第二層節點與本人**無直接關係**（例：配偶的父親）。以尺寸小一級、opacity ≈ 0.6、細線與第一層區隔，使外圈一眼可辨為間接關係。

## 6. 頁面整合

### 6.1 檔案頁 `src/pages/officials/[id].astro`

- `egoSubgraph(graph, key, 1)` 改為 `2`。
- 「人物關係」區塊改為：**圖在上、現有文字清單留在下**。
- 文字清單完整保留（含 note 與「出處 ↗」）。線上只放得下四個字的關係詞，承載不了說明與出處；本站「每筆附出處」是核心原則，不因改畫圖而失去。清單同時保障 SEO 與行動裝置可用性。
- 無關係者（899 頁）仍不顯示此區塊，維持現狀。
- 元件以 `client:visible` 載入。

### 6.2 全局圖頁 `src/pages/graph.astro`

- 路由 `/graph`，載入完整 graph.json。
- 同一元件的 `global` 模式。
- 篩選：關係類型（家族／政治）、政黨。搜尋：姓名。

## 7. 測試

- `test/graph.test.ts` 擴充：
  - `buildGraphData` 正確帶出 official 的 `photoUrl`；entity 節點無此欄位。
  - 合併後的資料不產生自連、不產生重複邊。
- `scraper/merge-duplicate-entities.ts` 的去重／自連邏輯抽為純函式並單元測試（不觸 DB）。
- build smoke test：檔案頁與 `/graph` 皆可建置。

## 8. 邊界與錯誤處理

- 照片 404 → 退化為文字圓（`background-image` 載入失敗時的 fallback）。
- Cytoscape 載入失敗 → 圖區塊不顯示，下方文字清單不受影響（清單為 SSG 靜態 HTML，不依賴 JS）。
- 合併腳本必須可重複執行（第二次跑時對照表中的 entity 已不存在 → 略過，不報錯）。
- 節點數為 2 的 ego 圖仍照常渲染（視覺單薄但不是錯誤）。

## 9. 交付階段

**Stage 1（可驗收）**
1. `merge-duplicate-entities.ts` ＋ dry-run 確認 ＋ 實際合併
2. photoUrl 管線（types / graph.ts / export-graph.ts）
3. `RelationshipGraph.svelte` 依 §5 重寫
4. 檔案頁掛圖、改 2 跳、清單留下方
5. 測試

**Stage 2**
6. `/graph` 全局圖頁 ＋ 篩選／搜尋

## 10. 非目標（YAGNI）

- 不補外部人物照片（見 §4.2，另案）。
- 不處理張美慧等無從確認的撞名（見 §3.2）。
- 不做手工排版的專題海報圖。
- 不做關係的時間軸／歷史版本。
- 不做前端編輯關係的介面。
