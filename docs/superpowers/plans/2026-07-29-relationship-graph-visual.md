# 人物關係圖 視覺化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把檔案頁的「人物關係」文字清單升級為頭像關係圖（圓形節點＋曲線連線＋線上關係詞），並補上 `/graph` 全局關係圖頁。

**Architecture:** 所有可測邏輯抽成純函式模組（`scraper/lib/mergeNodes.ts`、`src/lib/graphView.ts`），Svelte 元件只負責掛 Cytoscape 與樣式。資料校對走一次性腳本（比照既有 `import-relationships.ts`），非 schema migration。

**Tech Stack:** Astro 5 + Svelte 5（runes）＋ Cytoscape.js 3 ＋ Supabase(Postgres) ＋ vitest。**不新增任何依賴。**

**Spec:** `docs/superpowers/specs/2026-07-29-relationship-graph-visual-design.md`

## Global Constraints

- **不新增 npm 依賴。** Cytoscape、Svelte、Astro 皆已在 `package.json`。
- **用色一律使用 `src/styles/tokens.css` 既有 token**，不得硬寫色碼（唯一例外是 Task 5 的 `AVATAR_FG`，該處已註明理由：色值畫在 SVG data URI 內，無法隨主題重新上色）。`--accent`（#b3271e）僅用於 hover 與中心人物，不作內文色。
- **Cytoscape 忽略色彩的 rgba alpha**（既有元件已註明）。需要半透明時用獨立的 `*-opacity` 屬性，不要傳 rgba 進 color 屬性。
- 註解、commit message 用繁體中文，比照既有 commit 風格（`feat(graph): …`、`fix(ui): …`）。
- 每個 task 結束都要 commit。
- 測試指令：`pnpm test`（vitest run）。

## 已知的 spec 偏離（實作限制）

**spec §5.2 要求節點第二行（職稱／類別）用 `--faint`、姓名用 `--fg`。Cytoscape 一個節點只有一個 label，無法對 label 內不同段落套不同樣式。**

本計畫的處理：兩行同色同字級，第二行加上全形括號（`王〇〇` 換行 `（立委）`）以讀出次要感。要真正分色必須引入 `cytoscape-node-html-label`，違反「不新增依賴」的約束，故不做。

## 檔案結構

| 檔案 | 責任 | 動作 |
|---|---|---|
| `scraper/lib/mergeNodes.ts` | 節點合併的純運算（改寫端點、去自連、去重）。無 I/O。 | 新增 |
| `scraper/merge-duplicate-entities.ts` | 合併腳本：讀 DB → 套用純函式 → 寫回。含寫死的對照表與 `--dry-run`。 | 新增 |
| `src/lib/graphView.ts` | GraphData → Cytoscape elements 的純轉換；深度計算；無照片頭像 SVG 生成。無 DOM。 | 新增 |
| `src/lib/types.ts` | `GraphNode` 加 `photoUrl?` | 修改 |
| `src/lib/graph.ts` | `buildGraphData` 帶出 `photo_url`；新增 `OFFICE_LABEL` | 修改 |
| `scraper/export-graph.ts` | officials 查詢加 `photo_url` | 修改 |
| `src/components/RelationshipGraph.svelte` | 掛載 Cytoscape、樣式、tooltip、佈局。無資料轉換邏輯。 | 重寫 |
| `src/pages/officials/[id].astro` | 掛圖、ego 改 2 跳、文字清單留在圖下方 | 修改 |
| `src/pages/graph.astro` | 全局關係圖頁 | 新增 |
| `test/mergeNodes.test.ts` | 合併純函式測試 | 新增 |
| `test/graphView.test.ts` | 轉換純函式測試 | 新增 |
| `test/graph.test.ts` | 補 photoUrl 案例 | 修改 |

---

## Stage 1

### Task 1: 合併重複節點的純函式

**Files:**
- Create: `scraper/lib/mergeNodes.ts`
- Test: `test/mergeNodes.test.ts`

**Interfaces:**
- Consumes: 無（本 task 為起點）
- Produces:
  - `type NodeType = 'official' | 'entity'`
  - `interface Endpoint { type: NodeType; id: string }`
  - `interface RelRow { id: string; from_type: NodeType; from_id: string; to_type: NodeType; to_id: string; relation_type: string; directed: boolean }`
  - `interface MergePair { label: string; from: Endpoint; to: Endpoint }`
  - `interface MergeResult { updates: RelRow[]; deletes: string[] }`
  - `function planMerges(rows: RelRow[], pairs: MergePair[]): MergeResult`

`planMerges` 的語意：`pairs` 中每組把 `from` 端點改寫為 `to` 端點。回傳 `updates`（端點確實有變、且不會被刪除的列）與 `deletes`（改寫後變成自連、或與別列重複的 relationship id）。Task 2 的腳本負責實際寫 DB。

- [ ] **Step 1: 寫失敗測試**

建立 `test/mergeNodes.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { planMerges, type RelRow, type MergePair } from '../scraper/lib/mergeNodes';

const row = (over: Partial<RelRow>): RelRow => ({
  id: 'r1', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B',
  relation_type: 'faction', directed: false, ...over,
});

// entity E（重複建立的韓國瑜）→ official O（本站收錄的韓國瑜）
const pairs: MergePair[] = [
  { label: '韓國瑜', from: { type: 'entity', id: 'E' }, to: { type: 'official', id: 'O' } },
];

describe('planMerges', () => {
  it('改寫 from 端點', () => {
    const { updates, deletes } = planMerges([row({ id: 'r1' })], pairs);
    expect(deletes).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: 'r1', from_type: 'official', from_id: 'O', to_type: 'official', to_id: 'B' });
  });

  it('改寫 to 端點', () => {
    const rows = [row({ id: 'r1', from_type: 'official', from_id: 'B', to_type: 'entity', to_id: 'E' })];
    const { updates } = planMerges(rows, pairs);
    expect(updates[0]).toMatchObject({ to_type: 'official', to_id: 'O' });
  });

  it('端點沒被改到的列不產生 update', () => {
    const rows = [row({ id: 'r1', from_type: 'official', from_id: 'X', to_type: 'official', to_id: 'Y' })];
    expect(planMerges(rows, pairs)).toEqual({ updates: [], deletes: [] });
  });

  it('改寫後變成自連 → 刪除，不 update', () => {
    // E 與 O 之間原本有一條邊；E 併入 O 後兩端相同
    const rows = [row({ id: 'r1', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'O' })];
    const { updates, deletes } = planMerges(rows, pairs);
    expect(updates).toEqual([]);
    expect(deletes).toEqual(['r1']);
  });

  it('改寫後與既有列重複 → 保留 id 較小者，刪除較大者', () => {
    const rows = [
      row({ id: 'r1', from_type: 'official', from_id: 'O', to_type: 'official', to_id: 'B' }), // 既有
      row({ id: 'r2', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B' }),   // 改寫後撞上 r1
    ];
    const { updates, deletes } = planMerges(rows, pairs);
    expect(deletes).toEqual(['r2']);
    expect(updates).toEqual([]);
  });

  it('無向邊的重複判定不分方向', () => {
    const rows = [
      row({ id: 'r1', from_type: 'official', from_id: 'B', to_type: 'official', to_id: 'O' }), // B–O
      row({ id: 'r2', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B' }),   // 改寫後 O–B，與 r1 同組
    ];
    expect(planMerges(rows, pairs).deletes).toEqual(['r2']);
  });

  it('有向邊的重複判定要分方向', () => {
    const dir = { relation_type: 'parent_child', directed: true };
    const rows = [
      row({ id: 'r1', from_type: 'official', from_id: 'B', to_type: 'official', to_id: 'O', ...dir }), // B→O
      row({ id: 'r2', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B', ...dir }),   // 改寫後 O→B，方向相反不算重複
    ];
    const { updates, deletes } = planMerges(rows, pairs);
    expect(deletes).toEqual([]);
    expect(updates).toHaveLength(1);
  });

  it('關係類型不同不算重複', () => {
    const rows = [
      row({ id: 'r1', from_type: 'official', from_id: 'O', to_type: 'official', to_id: 'B', relation_type: 'mentor' }),
      row({ id: 'r2', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B', relation_type: 'faction' }),
    ];
    expect(planMerges(rows, pairs).deletes).toEqual([]);
  });

  it('可重複執行：已合併完的資料不再產生任何異動', () => {
    const rows = [row({ id: 'r1', from_type: 'official', from_id: 'O', to_type: 'official', to_id: 'B' })];
    expect(planMerges(rows, pairs)).toEqual({ updates: [], deletes: [] });
  });

  it('支援 entity → entity 合併（派系去重）', () => {
    const facPairs: MergePair[] = [
      { label: '新潮流系', from: { type: 'entity', id: 'DUP' }, to: { type: 'entity', id: 'KEEP' } },
    ];
    const rows = [row({ id: 'r1', from_type: 'entity', from_id: 'DUP', to_type: 'official', to_id: 'B' })];
    const { updates } = planMerges(rows, facPairs);
    expect(updates[0]).toMatchObject({ from_type: 'entity', from_id: 'KEEP' });
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/mergeNodes.test.ts`
Expected: FAIL — `Failed to resolve import "../scraper/lib/mergeNodes"`

- [ ] **Step 3: 寫實作**

建立 `scraper/lib/mergeNodes.ts`：

```ts
// 合併重複建立的節點：把 `from` 端點改寫成 `to` 端點，並清掉因此產生的自連與重複邊。
// 純運算、無 I/O，供 merge-duplicate-entities.ts 使用並可單元測試。
export type NodeType = 'official' | 'entity';

export interface Endpoint { type: NodeType; id: string }

export interface RelRow {
  id: string;
  from_type: NodeType; from_id: string;
  to_type: NodeType; to_id: string;
  relation_type: string; directed: boolean;
}

export interface MergePair { label: string; from: Endpoint; to: Endpoint }

export interface MergeResult { updates: RelRow[]; deletes: string[] }

const keyOf = (type: NodeType, id: string) => `${type}:${id}`;

// 與 src/lib/graph.ts 的 buildGraphData 同一套去重規則：
// 有向邊比對 from|to|type；無向邊把兩端排序後比對，使 A–B 與 B–A 視為同一條。
function dedupKey(r: RelRow): string {
  const from = keyOf(r.from_type, r.from_id);
  const to = keyOf(r.to_type, r.to_id);
  const pair = r.directed ? `${from}|${to}` : [from, to].sort().join('|');
  return `${pair}|${r.relation_type}|${r.directed}`;
}

export function planMerges(rows: RelRow[], pairs: MergePair[]): MergeResult {
  const remap = new Map<string, Endpoint>();
  for (const p of pairs) remap.set(keyOf(p.from.type, p.from.id), p.to);

  // 依 id 排序，讓「重複時保留哪一筆」有穩定結果（保留 id 較小者）。
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));

  const updates: RelRow[] = [];
  const deletes: string[] = [];
  const seen = new Set<string>();

  for (const r of sorted) {
    const nf = remap.get(keyOf(r.from_type, r.from_id));
    const nt = remap.get(keyOf(r.to_type, r.to_id));
    const next: RelRow = {
      ...r,
      from_type: nf?.type ?? r.from_type, from_id: nf?.id ?? r.from_id,
      to_type: nt?.type ?? r.to_type, to_id: nt?.id ?? r.to_id,
    };
    const changed = Boolean(nf || nt);

    // 改寫後兩端相同 → 自連，刪掉。
    if (keyOf(next.from_type, next.from_id) === keyOf(next.to_type, next.to_id)) {
      deletes.push(r.id);
      continue;
    }

    // 與先前保留的列重複 → 刪掉。未改寫的列也要參與比對，
    // 因為改寫後的列可能撞上原本就存在的邊。
    const k = dedupKey(next);
    if (seen.has(k)) {
      deletes.push(r.id);
      continue;
    }
    seen.add(k);

    if (changed) updates.push(next);
  }

  return { updates, deletes };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run test/mergeNodes.test.ts`
Expected: PASS（10 個測試全過）

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/mergeNodes.ts test/mergeNodes.test.ts
git commit -m "feat(graph): 節點合併純函式(改寫端點/去自連/去重)"
```

---

### Task 2: 合併腳本與實際執行

**Files:**
- Create: `scraper/merge-duplicate-entities.ts`
- Modify: `package.json`（scripts 區塊）

**Interfaces:**
- Consumes: `planMerges`、`RelRow`、`MergePair`（Task 1）
- Produces: 合併後的 DB 狀態。無程式介面。

**前置**：本機 Supabase 需在跑（OrbStack）。`.env` 需有 `PUBLIC_SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`。

- [ ] **Step 1: 寫腳本**

建立 `scraper/merge-duplicate-entities.ts`：

```ts
// 合併被重複建立的節點（同一人／同一派系存在兩個節點）。對照表為人工查證後寫死，
// 不做任何自動比對——依本站「常見名寧缺勿錯」原則，僅職務描述吻合者才合併。
// 見 docs/superpowers/specs/2026-07-29-relationship-graph-visual-design.md §3
//   pnpm run merge:entities -- --dry-run   先看要動什麼
//   pnpm run merge:entities                實際執行
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';
import { planMerges, type MergePair, type RelRow } from './lib/mergeNodes';

loadEnv();

// entity → official（5 組）＋ entity → entity（1 組派系）。
// UUID 取自 2026-07-29 的 graph.json / officials.json 快照。
const MERGES: MergePair[] = [
  { label: '韓國瑜',
    from: { type: 'entity', id: '0dc9c98f-1822-4467-b073-eae3a65fef76' },
    to:   { type: 'official', id: '2934ac93-29eb-4e28-90a0-9a2c093c7345' } },
  { label: '侯友宜',
    from: { type: 'entity', id: '4c935497-9f90-4e2f-b293-36812423f864' },
    to:   { type: 'official', id: '0fe86bde-9363-4cf4-a293-bf2199575b79' } },
  { label: '蔡咏鍀',
    from: { type: 'entity', id: '20c7d78d-a760-4fb6-a73f-850cf22211f8' },
    to:   { type: 'official', id: 'cb52edb8-ac4f-4a44-9533-b733e86955f3' } },
  { label: '謝典霖',
    from: { type: 'entity', id: '47d3e254-3556-48d1-bbe7-c13e5d1db7a2' },
    to:   { type: 'official', id: 'c1357d9e-724d-4351-810d-5156446f7700' } },
  { label: '許家蓓',
    from: { type: 'entity', id: 'e2b07369-96b1-4dae-9c52-d88044227375' },
    to:   { type: 'official', id: 'b3392a2c-1b4b-4978-bb02-0653c500e4a2' } },
  { label: '新潮流系（併入通用名稱節點）',
    from: { type: 'entity', id: '2a5bc90c-21c9-4cbe-8094-ca0bc9ca09ec' },
    to:   { type: 'entity', id: '04c84ea2-4cd2-4cb5-a3e7-8ce335f8aba5' } },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  // 分頁撈全部關係（PostgREST 預設上限 1000）
  const rows: RelRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('relationships')
      .select('id, from_type, from_id, to_type, to_id, relation_type, directed')
      .range(from, from + 999);
    if (error) throw new Error(`relationships query failed: ${error.message}`);
    const page = (data ?? []) as RelRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  const { updates, deletes } = planMerges(rows, MERGES);

  console.log(`關係總數 ${rows.length}`);
  console.log(`將改寫 ${updates.length} 筆、刪除 ${deletes.length} 筆（自連／重複）`);
  for (const m of MERGES) {
    const n = updates.filter((u) =>
      (u.from_type === m.to.type && u.from_id === m.to.id) ||
      (u.to_type === m.to.type && u.to_id === m.to.id)).length;
    console.log(`  ${m.label}: ${n} 筆改寫`);
  }

  if (dryRun) {
    console.log('--dry-run：未寫入任何資料');
    return;
  }

  // 順序重要：先刪除（自連／重複），再改寫，最後才刪 entity。
  // 反過來會留下端點解析不到的懸空邊，export 時會被 validate 擋下。
  if (deletes.length > 0) {
    const { error } = await supabase.from('relationships').delete().in('id', deletes);
    if (error) throw new Error(`delete relationships failed: ${error.message}`);
  }

  for (const u of updates) {
    const { error } = await supabase.from('relationships')
      .update({ from_type: u.from_type, from_id: u.from_id, to_type: u.to_type, to_id: u.to_id })
      .eq('id', u.id);
    if (error) throw new Error(`update relationship ${u.id} failed: ${error.message}`);
  }

  // 刪掉被併掉的 entity。已不存在者（重跑）不視為錯誤。
  const staleEntityIds = MERGES.filter((m) => m.from.type === 'entity').map((m) => m.from.id);
  const { error: delErr } = await supabase.from('entities').delete().in('id', staleEntityIds);
  if (delErr) throw new Error(`delete entities failed: ${delErr.message}`);

  console.log(`完成：改寫 ${updates.length}、刪除關係 ${deletes.length}、刪除 entity ${staleEntityIds.length}`);
  console.log('接著請執行 pnpm run export:graph 重新產生 src/data/graph.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 加 package.json script**

在 `scripts` 區塊 `"import:relationships"` 那一行之後加入：

```json
    "merge:entities": "tsx scraper/merge-duplicate-entities.ts",
```

- [ ] **Step 3: 跑 dry-run 確認要動的資料**

Run: `pnpm run merge:entities -- --dry-run`

Expected: 印出關係總數 **280**；6 組各自的改寫筆數；「--dry-run：未寫入任何資料」。
（280 是 DB 實際列數；graph.json 只有 277 條邊，差額為 3 列既有重複——匯出時由 `buildGraphData` 去重，
不會被本腳本刪除，因為 `planMerges` 只刪端點被改寫過的列。）
**檢查點：若改寫總數為 0，表示 UUID 對不上（DB 與 2026-07-29 快照不同步），停下來查清楚，不要硬跑。**

- [ ] **Step 4: 實際執行合併**

Run: `pnpm run merge:entities`
Expected: 印出「完成：改寫 N、刪除關係 M、刪除 entity 6」

- [ ] **Step 5: 重跑確認冪等**

Run: `pnpm run merge:entities -- --dry-run`
Expected: 改寫 0 筆、刪除 0 筆（對照表中的 entity 已不存在，無可改寫者）

- [ ] **Step 6: Commit**

```bash
git add scraper/merge-duplicate-entities.ts package.json
git commit -m "feat(graph): 合併重複節點腳本(韓國瑜/侯友宜等5人+新潮流系)"
```

---

### Task 3: photoUrl 匯出管線

**Files:**
- Modify: `src/lib/types.ts`（`GraphNode`）
- Modify: `src/lib/graph.ts`（`RawOfficialNode`、`buildGraphData`；新增 `OFFICE_LABEL`）
- Modify: `scraper/export-graph.ts`（officials 查詢）
- Test: `test/graph.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `GraphNode.photoUrl?: string`
  - `const OFFICE_LABEL: Record<OfficeType, string>` from `src/lib/graph.ts`（值：`legislator: '立委'`、`mayor_magistrate: '縣市首長'`、`councilor: '議員'`）
  - `RawOfficialNode` 型別新增 `photo_url` 欄位（Task 4 的 graphView 與 Task 6 的 [id].astro 會用到 `OFFICE_LABEL`）

- [ ] **Step 1: 寫失敗測試**

在 `test/graph.test.ts` 中，先把既有 fixture 補上 `photo_url`（`RawOfficialNode` 即將要求此欄位）：

```ts
const officials = [
  { id: 'a', slug: 'wang', name: '王又民', party: '無', office_type: 'councilor' as const, photo_url: '/photos/councilors/a.jpg' },
  { id: 'b', slug: 'shen', name: '沈宗隆', party: '無', office_type: 'councilor' as const, photo_url: null },
];
```

`describe('egoSubgraph')` 區塊裡沒有另外宣告 officials，沿用上面同一個常數，不需改動。

接著在 `describe('buildGraphData')` 內新增兩個測試：

```ts
  it('帶出 official 的 photoUrl', () => {
    const { data } = buildGraphData(officials, entities, [rel({})]);
    expect(data.nodes.find((n) => n.key === 'official:a')).toMatchObject({ photoUrl: '/photos/councilors/a.jpg' });
  });

  it('photo_url 為 null 的 official 不帶 photoUrl 欄位', () => {
    const { data } = buildGraphData(officials, entities, [rel({})]);
    expect(data.nodes.find((n) => n.key === 'official:b')).not.toHaveProperty('photoUrl');
  });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/graph.test.ts`
Expected: FAIL — 新增的兩個測試中，第一個因 `photoUrl` 為 undefined 而失敗

- [ ] **Step 3: 改 types.ts**

`src/lib/types.ts` 的 `GraphNode`，在 `officeType` 那行之後加入：

```ts
  photoUrl?: string;      // official 才有；photo_url 為 null 時不帶此欄位
```

- [ ] **Step 4: 改 graph.ts**

`src/lib/graph.ts` 頂端的 `RawOfficialNode` 改為：

```ts
type RawOfficialNode = Pick<RawOfficial, 'id' | 'slug' | 'name' | 'party' | 'office_type' | 'photo_url'>;
```

`buildGraphData` 內的 officials 迴圈改為：

```ts
  for (const o of officials) {
    allNodes.set(keyOf('official', o.id), {
      key: keyOf('official', o.id), name: o.name, kind: 'official',
      subtype: o.office_type, slug: o.slug, party: o.party, officeType: o.office_type as OfficeType,
      // photo_url 為 null 時整個欄位省略，讓 graph.json 不長出一堆 "photoUrl":null
      ...(o.photo_url ? { photoUrl: o.photo_url } : {}),
    });
  }
```

在 `ENTITY_LABEL` 宣告之後加入（供關係圖節點第二行與檔案頁共用）：

```ts
// 公職類別 → 白話標籤。供關係圖節點標籤與檔案頁標題共用。
export const OFFICE_LABEL: Record<OfficeType, string> = {
  legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員',
};
```

- [ ] **Step 5: 改 export-graph.ts**

`scraper/export-graph.ts` 內 officials 的型別宣告與查詢各改一處：

```ts
  const officials: { id: string; slug: string; name: string; party: string; office_type: string; photo_url: string | null }[] = [];
```

```ts
      .from('officials').select('id, slug, name, party, office_type, photo_url').range(from, from + pageSize - 1);
```

- [ ] **Step 6: 跑測試確認通過**

Run: `pnpm test`
Expected: PASS（全部測試檔案，含既有的 graph.test.ts 案例）

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/graph.ts scraper/export-graph.ts test/graph.test.ts
git commit -m "feat(graph): graph.json 帶出官員大頭照 URL 與 OFFICE_LABEL"
```

---

### Task 4: 重新匯出 graph.json 並驗收資料

**Files:**
- Modify: `src/data/graph.json`（由腳本產生）

**Interfaces:**
- Consumes: Task 2 的 DB 狀態、Task 3 的匯出管線
- Produces: 合併且帶 photoUrl 的 `src/data/graph.json`，供 Task 5 之後使用

- [ ] **Step 1: 重新匯出**

Run: `pnpm run export:graph`
Expected: 印出 `exported graph: 361 nodes, ... edges → src/data/graph.json`

- [ ] **Step 2: 驗收數字**

Run:

```bash
node -e "
const g=require('./src/data/graph.json');
const withPhoto=g.nodes.filter(n=>n.photoUrl).length;
const names=g.nodes.map(n=>n.name);
const dup=[...new Set(names.filter((n,i)=>names.indexOf(n)!==i))];
console.log('nodes',g.nodes.length,'edges',g.edges.length);
console.log('有照片',withPhoto);
console.log('圖中同名節點',dup);
const merged=['韓國瑜','侯友宜','蔡咏鍀','謝典霖','許家蓓','新潮流系','民主進步黨新潮流系'];
merged.forEach(n=>console.log('  '+n+' 出現',names.filter(x=>x===n).length,'次'));
"
```

Expected:
- `nodes 361`
- `edges 277`
- `有照片 157`
- `圖中同名節點 []` —— 圖內不應有任何同名節點。

  注意：spec §3.2 刻意不合併的張美慧**不會**出現在這裡。花蓮縣議員張美慧沒有任何關係，
  依 `buildGraphData` 的規則（孤點不入圖）不會成為節點，圖中只有企業界那位張美慧一個。
  兩人仍是 DB 中的兩筆獨立資料，未被誤併——這才是 §3.2 的重點，而非圖中可見。

- 逐名檢查應為：韓國瑜／侯友宜／蔡咏鍀／謝典霖／許家蓓各出現 **1 次**；
  `新潮流系` 出現 **1 次**；`民主進步黨新潮流系` 出現 **0 次**（已併入前者）。
  **任一項不符即表示 Task 2 沒生效，停下來回頭查。**

- [ ] **Step 3: Commit**

```bash
git add src/data/graph.json
git commit -m "data(graph): 重新匯出(361節點/157張照片,已合併重複節點)"
```

---

### Task 5: Cytoscape 資料轉換純函式

**Files:**
- Create: `src/lib/graphView.ts`
- Test: `test/graphView.test.ts`

**Interfaces:**
- Consumes: `GraphData`、`GraphNode`（types.ts）；`RELATION_LABEL`、`FAMILY_RELATIONS`、`ENTITY_LABEL`、`OFFICE_LABEL`（graph.ts，Task 3）
- Produces:
  - `function nodeDepths(data: GraphData, centerKey: string): Map<string, number>` —— 中心為 0，逐層 +1
  - `function avatarDataUri(name: string): string` —— 無照片節點的姓氏字 SVG data URI
  - `function toCytoscapeElements(data: GraphData, centerKey: string | null): { nodes: CyNode[]; edges: CyEdge[] }`
  - `interface CyNode { data: { id: string; label: string; slug: string; kind: string; depth: number; center: 0 | 1; size: number; avatar: string } }`
  - `interface CyEdge { data: { id: string; source: string; target: string; label: string; fam: 0 | 1; dir: 0 | 1; note: string; sourceUrl: string } }`

Task 6 的 Svelte 元件只呼叫 `toCytoscapeElements`，不自行組裝 elements。

- [ ] **Step 1: 寫失敗測試**

建立 `test/graphView.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { nodeDepths, avatarDataUri, toCytoscapeElements } from '../src/lib/graphView';
import type { GraphData } from '../src/lib/types';

const data: GraphData = {
  nodes: [
    { key: 'official:a', name: '王又民', kind: 'official', subtype: 'councilor', slug: 'wang', party: '無', officeType: 'councilor', photoUrl: '/photos/a.jpg' },
    { key: 'entity:e1', name: '白惠萍', kind: 'entity', subtype: 'family_member', description: '配偶' },
    { key: 'official:c', name: '陳某某', kind: 'official', subtype: 'legislator', slug: 'chen', party: '無', officeType: 'legislator' },
  ],
  edges: [
    { id: 'r1', source: 'official:a', target: 'entity:e1', type: 'spouse', directed: false, note: '2014 結婚', sourceUrl: 'https://x' },
    { id: 'r2', source: 'entity:e1', target: 'official:c', type: 'parent_child', directed: true, note: null, sourceUrl: 'https://y' },
  ],
};

describe('nodeDepths', () => {
  it('中心為 0，逐層遞增', () => {
    const d = nodeDepths(data, 'official:a');
    expect(d.get('official:a')).toBe(0);
    expect(d.get('entity:e1')).toBe(1);
    expect(d.get('official:c')).toBe(2);
  });

  it('中心不存在時回傳空 map', () => {
    expect(nodeDepths(data, 'official:zzz').size).toBe(0);
  });
});

describe('avatarDataUri', () => {
  it('用姓名第一個字產生 SVG data URI', () => {
    const uri = avatarDataUri('白惠萍');
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(uri)).toContain('>白<');
  });

  it('跳脫 XML 特殊字元', () => {
    expect(decodeURIComponent(avatarDataUri('<x'))).toContain('&lt;');
  });

  it('空字串不產生破格 SVG', () => {
    expect(decodeURIComponent(avatarDataUri('  '))).toContain('>·<');
  });
});

describe('toCytoscapeElements', () => {
  it('有照片的節點用照片，沒照片的用姓氏字頭像', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.find((n) => n.data.id === 'official:a')!.data.avatar).toBe('/photos/a.jpg');
    expect(nodes.find((n) => n.data.id === 'entity:e1')!.data.avatar.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('標籤為兩行：姓名 + 括號職稱／類別', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.find((n) => n.data.id === 'official:a')!.data.label).toBe('王又民\n（議員）');
    expect(nodes.find((n) => n.data.id === 'entity:e1')!.data.label).toBe('白惠萍\n（家屬）');
  });

  it('尺寸依深度遞減：中心 88 / 第一層 64 / 第二層 48', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    const size = (id: string) => nodes.find((n) => n.data.id === id)!.data.size;
    expect(size('official:a')).toBe(88);
    expect(size('entity:e1')).toBe(64);
    expect(size('official:c')).toBe(48);
  });

  it('只有中心節點 center=1', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.filter((n) => n.data.center === 1).map((n) => n.data.id)).toEqual(['official:a']);
  });

  it('entity 節點的 slug 為空字串（不可點）', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.find((n) => n.data.id === 'entity:e1')!.data.slug).toBe('');
    expect(nodes.find((n) => n.data.id === 'official:a')!.data.slug).toBe('wang');
  });

  it('邊帶白話關係詞、家族旗標與方向旗標', () => {
    const { edges } = toCytoscapeElements(data, 'official:a');
    expect(edges[0].data).toMatchObject({ label: '配偶', fam: 1, dir: 0, note: '2014 結婚', sourceUrl: 'https://x' });
    expect(edges[1].data).toMatchObject({ label: '親子', fam: 1, dir: 1, note: '' });
  });

  it('政治類關係 fam=0', () => {
    const pol: GraphData = { ...data, edges: [{ ...data.edges[0], type: 'faction' }] };
    expect(toCytoscapeElements(pol, 'official:a').edges[0].data).toMatchObject({ label: '同派系', fam: 0 });
  });

  it('global 模式（centerKey 為 null）所有節點同尺寸、無中心', () => {
    const { nodes } = toCytoscapeElements(data, null);
    expect(nodes.every((n) => n.data.size === 64)).toBe(true);
    expect(nodes.every((n) => n.data.center === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/graphView.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/graphView"`

- [ ] **Step 3: 寫實作**

建立 `src/lib/graphView.ts`：

```ts
// GraphData → Cytoscape elements 的純轉換。無 DOM、無 Cytoscape 依賴，可單元測試。
// RelationshipGraph.svelte 只負責掛載與樣式，不在元件內組裝資料。
import type { EntityType, GraphData, OfficeType } from './types';
import { RELATION_LABEL, FAMILY_RELATIONS, ENTITY_LABEL, OFFICE_LABEL } from './graph';

export interface CyNode {
  data: {
    id: string; label: string; slug: string; kind: string;
    depth: number; center: 0 | 1; size: number; avatar: string;
  };
}
export interface CyEdge {
  data: {
    id: string; source: string; target: string; label: string;
    fam: 0 | 1; dir: 0 | 1; note: string; sourceUrl: string;
  };
}

// 無照片節點的頭像文字色。刻意寫死而非用 token：這個字是畫在 SVG data URI 裡的，
// 換亮/暗模式時無法重新上色。--faint 在兩種模式下相近（#8c887f / #7d7a72），
// 取中間值即可雙模式通用。真正的姓名在圓形下方，用 --fg，不受影響。
const AVATAR_FG = '#8c887f';

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]!));

// 無照片節點：姓氏第一個字的 SVG，背景透明讓節點的 --surface 底色透出來，
// 因此同一張圖在亮/暗模式都適用。
export function avatarDataUri(name: string): string {
  const ch = escapeXml(name.trim().charAt(0) || '·');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    `<text x="50" y="50" fill="${AVATAR_FG}" font-family="Georgia,serif" font-size="52" ` +
    `text-anchor="middle" dominant-baseline="central">${ch}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// BFS：中心為 0，每往外一層 +1。用來決定節點尺寸與第二層的視覺弱化。
export function nodeDepths(data: GraphData, centerKey: string): Map<string, number> {
  const depths = new Map<string, number>();
  if (!data.nodes.some((n) => n.key === centerKey)) return depths;

  const adj = new Map<string, string[]>();
  for (const e of data.edges) {
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
  }

  depths.set(centerKey, 0);
  let frontier = [centerKey];
  let d = 0;
  while (frontier.length > 0) {
    d += 1;
    const next: string[] = [];
    for (const k of frontier) {
      for (const other of adj.get(k) ?? []) {
        if (!depths.has(other)) { depths.set(other, d); next.push(other); }
      }
    }
    frontier = next;
  }
  return depths;
}

export function toCytoscapeElements(
  data: GraphData,
  centerKey: string | null,
): { nodes: CyNode[]; edges: CyEdge[] } {
  const depths = centerKey ? nodeDepths(data, centerKey) : new Map<string, number>();

  const nodes: CyNode[] = data.nodes.map((n) => {
    const isCenter = n.key === centerKey;
    const depth = depths.get(n.key) ?? 1;
    const role = n.kind === 'official'
      ? OFFICE_LABEL[n.subtype as OfficeType] ?? ''
      : ENTITY_LABEL[n.subtype as EntityType] ?? '其他公眾人物';
    return {
      data: {
        id: n.key,
        // Cytoscape 一個節點只有一個 label，無法對兩行分別上色；
        // 第二行加括號讓它讀起來是次要資訊。
        label: role ? `${n.name}\n（${role}）` : n.name,
        slug: n.slug ?? '',
        kind: n.kind,
        depth,
        center: isCenter ? 1 : 0,
        size: isCenter ? 88 : depth <= 1 ? 64 : 48,
        avatar: n.photoUrl ?? avatarDataUri(n.name),
      },
    };
  });

  const edges: CyEdge[] = data.edges.map((e) => ({
    data: {
      id: e.id, source: e.source, target: e.target,
      label: RELATION_LABEL[e.type] ?? e.type,
      fam: FAMILY_RELATIONS.has(e.type) ? 1 : 0,
      dir: e.directed ? 1 : 0,
      note: e.note ?? '',
      sourceUrl: e.sourceUrl ?? '',
    },
  }));

  return { nodes, edges };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm test`
Expected: PASS（全部測試）

- [ ] **Step 5: Commit**

```bash
git add src/lib/graphView.ts test/graphView.test.ts
git commit -m "feat(graph): Cytoscape 資料轉換純函式(深度/尺寸/頭像/標籤)"
```

---

### Task 6: 重寫 RelationshipGraph.svelte

**Files:**
- Modify: `src/components/RelationshipGraph.svelte`（整檔重寫）

**Interfaces:**
- Consumes: `toCytoscapeElements`（Task 5）、`GraphData`
- Produces: Svelte 元件，props 為 `{ data: GraphData; centerKey?: string | null; mode?: 'ego' | 'global' }`（Task 7、Task 8 使用）

本 task 無單元測試——Cytoscape 需要真實 DOM 與版面計算，用 vitest 測沒有意義。驗收方式為 Step 3 的瀏覽器目視檢查。轉換邏輯已在 Task 5 測過。

- [ ] **Step 1: 重寫元件**

`src/components/RelationshipGraph.svelte` 全檔替換為：

```svelte
<!-- 人物關係圖。ego（檔案頁，以本人為中心）與 global（/graph 全圖）共用同一套視覺。
     資料轉換在 src/lib/graphView.ts，本檔只負責掛載 Cytoscape 與樣式。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { GraphData } from '../lib/types';
  import { toCytoscapeElements } from '../lib/graphView';

  let { data, centerKey = null, mode = 'ego' }:
    { data: GraphData; centerKey?: string | null; mode?: 'ego' | 'global' } = $props();

  let container: HTMLDivElement;

  // 讀網站設計 tokens（隨亮/暗模式變動），餵給 Cytoscape，讓圖與全站同調。
  function readColors() {
    const c = getComputedStyle(document.documentElement);
    const v = (n: string) => c.getPropertyValue(n).trim();
    return {
      bg: v('--bg'), surface: v('--surface'), fg: v('--fg'), muted: v('--muted'),
      faint: v('--faint'), line: v('--line-strong'), accent: v('--accent'),
      serif: v('--serif'), sans: v('--sans'),
    };
  }

  function buildStyle(c: ReturnType<typeof readColors>) {
    return [
      { selector: 'node', style: {
        shape: 'ellipse',
        width: 'data(size)', height: 'data(size)',
        'background-color': c.surface,
        'background-image': 'data(avatar)',
        'background-fit': 'cover',
        'background-clip': 'node',
        'border-width': 1.5, 'border-color': c.line,
        label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '110',
        'text-valign': 'bottom', 'text-margin-y': 7,
        'font-family': c.serif, 'font-size': 13, 'font-weight': 700,
        'line-height': 1.35, color: c.fg,
      } },
      // 外部公眾人物：虛框、灰字，視覺次於本站收錄的公職（沿用文字清單的 .rel-name.plain 語彙）
      { selector: 'node[kind = "entity"]', style: {
        'border-style': 'dashed', color: c.muted, 'font-weight': 500,
      } },
      // 第二層＝關係人的關係人，與本人無直接關係，故縮小並淡化以免誤讀
      { selector: 'node[depth = 2]', style: { opacity: 0.6, 'border-width': 1 } },
      // 中心人物：姓名加淡紅底色塊。Cytoscape 忽略色彩的 rgba alpha，
      // 故用實色 --accent 搭配獨立的 text-background-opacity 做出 --accent-wash 效果。
      { selector: 'node[center = 1]', style: {
        'border-width': 2.5, 'border-color': c.line,
        'text-background-color': c.accent, 'text-background-opacity': 0.1,
        'text-background-padding': '5px', 'text-background-shape': 'roundrectangle',
      } },
      { selector: 'edge', style: {
        label: 'data(label)', 'font-family': c.sans, 'font-size': 11, color: c.muted,
        'curve-style': 'bezier', width: 1.2,
        'line-color': c.faint, 'target-arrow-color': c.faint,
        'text-background-color': c.bg, 'text-background-opacity': 1, 'text-background-padding': '3px',
      } },
      // 家族實線、政治虛線（沿用 FAMILY_RELATIONS 分類）
      { selector: 'edge[fam = 0]', style: { 'line-style': 'dashed' } },
      { selector: 'edge[dir = 1]', style: { 'target-arrow-shape': 'triangle', 'arrow-scale': 0.85 } },
      { selector: 'edge.hl', style: {
        'line-color': c.accent, 'target-arrow-color': c.accent, color: c.accent, width: 2,
      } },
    ];
  }

  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

  onMount(async () => {
    let cy: { destroy: () => void; style: (s: unknown) => { update: () => void };
             layout: (o: unknown) => { run: () => void }; on: (...a: unknown[]) => void } | null = null;
    let mo: MutationObserver | null = null;

    try {
      const cytoscape = (await import('cytoscape')).default;
      const elements = toCytoscapeElements(data, centerKey);

      cy = cytoscape({
        container,
        elements: [...elements.nodes, ...elements.edges],
        style: buildStyle(readColors()),
        layout: { name: 'preset' },
        userZoomingEnabled: mode === 'global',
        autoungrabify: false,
      }) as unknown as typeof cy;

      // ego：本人置中的同心圓（越靠中心 depth 越小）。global：力導向。
      const layout = mode === 'ego'
        ? { name: 'concentric', concentric: (n: { data: (k: string) => number }) => 10 - n.data('depth'),
            levelWidth: () => 1, minNodeSpacing: 44, padding: 28, animate: false }
        : { name: 'cose', padding: 30, animate: false, nodeRepulsion: 9000, idealEdgeLength: 110 };
      cy!.layout(layout).run();

      // 點本站收錄的節點 → 進其檔案頁（entity 的 slug 為空字串，不觸發）
      cy!.on('tap', 'node', (evt: { target: { data: (k: string) => string } }) => {
        const slug = evt.target.data('slug');
        if (slug) window.location.href = `/officials/${slug}`;
      });

      // hover 連線 → tooltip（關係＋說明＋出處）。tooltip 自身可 hover，方便點出處連結。
      const tip = document.createElement('div');
      tip.className = 'rg-tip';
      container.appendChild(tip);
      let hideTimer: ReturnType<typeof setTimeout>;
      const hideSoon = () => {
        hideTimer = setTimeout(() => { tip.style.opacity = '0'; tip.style.pointerEvents = 'none'; }, 250);
      };
      tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
      tip.addEventListener('mouseleave', hideSoon);

      cy!.on('mouseover', 'edge', (evt: any) => {
        clearTimeout(hideTimer);
        evt.target.addClass('hl');
        const d = evt.target.data();
        const note = d.note ? `<div class="rg-note">${esc(d.note)}</div>` : '';
        const src = d.sourceUrl
          ? `<a class="rg-src" href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">查看出處 ↗</a>` : '';
        const m = evt.target.renderedMidpoint();
        tip.innerHTML = `<div class="rg-rel">${esc(d.label)}</div>${note}${src}`;
        tip.style.left = `${m.x}px`;
        tip.style.top = `${m.y}px`;
        tip.style.opacity = '1';
        tip.style.pointerEvents = 'auto';
      });
      cy!.on('mouseout', 'edge', (evt: any) => { evt.target.removeClass('hl'); hideSoon(); });

      // 跟著亮/暗模式切換重新上色
      mo = new MutationObserver(() => cy!.style(buildStyle(readColors())).update());
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch {
      // Cytoscape 載入或初始化失敗 → 整區隱藏。下方的文字關係清單為 SSG 靜態 HTML，
      // 不依賴本元件，仍可正常閱讀。
      container.style.display = 'none';
    }

    return () => { mo?.disconnect(); cy?.destroy(); };
  });
</script>

<div bind:this={container} class="graph" class:global={mode === 'global'} role="img" aria-label="人物關係圖"></div>

<style>
  .graph {
    position: relative;
    width: 100%; height: 420px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  .graph.global { height: 78vh; min-height: 520px; }
  :global(.rg-tip) {
    position: absolute;
    transform: translate(-50%, calc(-100% - 12px));
    max-width: 240px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 8px 11px;
    font-family: var(--sans);
    font-size: var(--t-sm);
    color: var(--muted);
    line-height: 1.55;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
    z-index: 5;
  }
  :global(.rg-tip .rg-rel) { font-weight: 700; color: var(--fg); margin-bottom: 2px; }
  :global(.rg-tip .rg-note) { margin-bottom: 4px; }
  :global(.rg-tip .rg-src) { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
</style>
```

- [ ] **Step 2: 型別檢查通過**

Run: `pnpm exec astro check`
Expected: 0 errors（warnings 可接受）

- [ ] **Step 3: Commit**

```bash
git add src/components/RelationshipGraph.svelte
git commit -m "feat(graph): 關係圖改為圓形頭像節點(同心圓佈局/線上關係詞)"
```

---

### Task 7: 檔案頁掛上關係圖

**Files:**
- Modify: `src/pages/officials/[id].astro`

**Interfaces:**
- Consumes: `RelationshipGraph.svelte`（Task 6）、`OFFICE_LABEL`（Task 3）
- Produces: 無程式介面

- [ ] **Step 1: 改 import 與 ego 跳數**

`src/pages/officials/[id].astro` 第 5 行的 import 加入 `OFFICE_LABEL`，並新增元件 import：

```astro
import { egoSubgraph, RELATION_LABEL, FAMILY_RELATIONS, ENTITY_LABEL, OFFICE_LABEL } from "../../lib/graph";
import { loadGraph } from "../../lib/loadGraph";
import RelationshipGraph from "../../components/RelationshipGraph.svelte";
```

`getStaticPaths` 內的 `egoSubgraph` 由 1 跳改為 2 跳：

```astro
    props: { official: o, ego: egoSubgraph(graph, `official:${o.id}`, 2) },
```

- [ ] **Step 2: 移除重複的 officeName 常數**

檔案中段（約第 51 行）有本地宣告：

```astro
const officeName: Record<string, string> = { legislator: "立委", mayor_magistrate: "縣市首長", councilor: "議員" };
```

刪掉這一行（`OFFICE_LABEL` 已從 graph.ts 匯入，值相同），並把後續兩處 `officeName[o.officeType]` 改為 `OFFICE_LABEL[o.officeType]`（在 `title` 與 `desc` 兩個樣板字串內）。

- [ ] **Step 3: 在關係清單上方插入圖**

第 203 行起的「人物關係」區塊，於 `<p class="note">` 之後、`{relations.map(...)}` 之前插入圖。改為：

```astro
  {relations.length > 0 && (
    <section class="sec">
      <h2>人物關係</h2>
      <p class="note">關係資料整理自司法判決、媒體報導與公開資料，每條皆附出處，僅呈現已查證者。可點選的姓名為本站收錄之政治人物（連至其檔案頁），其餘為相關之其他公眾人物。</p>
      <RelationshipGraph client:visible data={ego} centerKey={centerKey} mode="ego" />
      <p class="note graph-note">圖中外圈較小、較淡者為「關係人的關係人」，與本人無直接關係。滑過連線可看說明與出處；下方清單為完整明細。</p>
      {relations.map((r) => (
```

其餘（`.item.rel` 迴圈與 `</section>`）保持不變。

- [ ] **Step 4: 加 graph-note 樣式**

在同檔 `<style>` 內 `.note` 那行之後加入：

```css
    .graph-note { margin: 10px 0 18px; }
```

- [ ] **Step 5: 型別檢查與建置**

Run: `pnpm exec astro check && pnpm build`
Expected: 0 errors；build 成功

- [ ] **Step 6: 目視驗收**

Run: `pnpm dev`，用瀏覽器開以下三頁：

| 頁面 | 預期 |
|---|---|
| `/officials/kuo-yu-han`（韓國瑜） | 只有**一個**韓國瑜節點，本人置中且有照片。若看到兩個，Task 2 沒生效 |
| `/officials/張啓楷-不分區`（2 跳 15 節點，全站最大） | 外圈節點明顯較小、較淡；線不至於糊成一團 |
| `/officials/mayor-tainan`（1 跳就有 8 個，內圈最密） | 內圈 8 個節點不重疊、姓名不互相遮蓋 |
| `/officials/kuo-yu-ching`（只有 1 個關係人） | 兩個圓正常渲染，不破版 |

同時檢查：切換亮/暗模式後圖的顏色跟著變；滑過連線出現 tooltip 且「查看出處」可點；點有照片的節點會進其檔案頁。

- [ ] **Step 7: Commit**

```bash
git add src/pages/officials/\[id\].astro
git commit -m "feat(graph): 檔案頁掛上人物關係圖(2跳,清單留在圖下方)"
```

---

## Stage 2

### Task 8: `/graph` 全局關係圖頁

**Files:**
- Create: `src/pages/graph.astro`

**Interfaces:**
- Consumes: `RelationshipGraph.svelte`（Task 6，`mode="global"`）、`loadGraph`
- Produces: 路由 `/graph`

篩選與搜尋以 Cytoscape 內建的 `filter` / `show` / `hide` 實作，寫在頁面的 inline script，不動元件。

- [ ] **Step 1: 建立頁面**

建立 `src/pages/graph.astro`：

```astro
---
import Base from "../layouts/Base.astro";
import RelationshipGraph from "../components/RelationshipGraph.svelte";
import { loadGraph } from "../lib/loadGraph";

const graph = loadGraph();
const title = "政治人物關係圖｜家族、派系、師徒與金主關係網";
const desc = `涵蓋 ${graph.nodes.length} 位政治人物與相關公眾人物、${graph.edges.length} 條已查證關係的互動關係圖，每條關係皆附公開資料出處。`;
---

<Base title={title} description={desc}>
  <h1>人物關係圖</h1>
  <p class="lede">{desc}</p>
  <p class="note">關係資料整理自司法判決、媒體報導與公開資料，僅呈現已查證者。實線圓為本站收錄之政治人物（可點選進入檔案頁），虛線圓為相關之其他公眾人物。實線連線為家族關係，虛線為政治關係。</p>

  <div class="controls">
    <input id="q" type="search" placeholder="搜尋姓名" aria-label="搜尋姓名" />
    <label><input type="checkbox" class="kind" value="fam" checked /> 家族關係</label>
    <label><input type="checkbox" class="kind" value="pol" checked /> 政治關係</label>
  </div>

  <RelationshipGraph client:load data={graph} centerKey={null} mode="global" />

  <style>
    h1 { font-size: var(--t-xl); margin: 14px 0 6px; }
    .lede { margin: 0 0 8px; }
    .note { font-size: var(--t-sm); color: var(--muted); margin: 0 0 16px; max-width: 72ch; line-height: 1.7; }
    .controls { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .controls input[type="search"] {
      font-family: var(--sans); font-size: var(--t-sm); padding: 7px 11px;
      border: 1px solid var(--line-strong); border-radius: var(--radius);
      background: var(--surface); color: var(--fg); min-width: 200px;
    }
    .controls input[type="search"]:focus { outline: none; border-color: var(--accent); }
    .controls label { font-size: var(--t-sm); color: var(--muted); display: flex; align-items: center; gap: 5px; }
  </style>
</Base>
```

- [ ] **Step 2: 加篩選與搜尋的行為**

在上面 `</Base>` 之前、`<style>` 之後插入：

```astro
  <script>
    // 篩選/搜尋直接操作元件掛好的 Cytoscape 實例。元件初始化完成後會在自己的容器上
    // 派發 rg:ready（bubbles: true），事件的 detail 即為該實例——不必輪詢或猜時序。
    let cy: any = null;

    function apply() {
      if (!cy) return;
      const q = (document.getElementById("q") as HTMLInputElement).value.trim();
      const kinds = new Set(
        [...document.querySelectorAll<HTMLInputElement>(".kind")].filter((c) => c.checked).map((c) => c.value),
      );

      cy.batch(() => {
        cy.edges().forEach((e: any) => {
          const want = e.data("fam") === 1 ? "fam" : "pol";
          e.style("display", kinds.has(want) ? "element" : "none");
        });
        cy.nodes().forEach((n: any) => {
          // 關係全被篩掉的人一併隱藏，避免留下一堆孤點
          const hasVisibleEdge = n.connectedEdges().some((e: any) => e.style("display") !== "none");
          const matches = !q || String(n.data("label")).includes(q);
          n.style("display", hasVisibleEdge && matches ? "element" : "none");
        });
      });
    }

    // island 可能在本 script 之後才掛好；監聽事件即可，無論先後都收得到。
    document.addEventListener("rg:ready", (e) => { cy = (e as CustomEvent).detail; apply(); });

    document.getElementById("q")?.addEventListener("input", apply);
    document.querySelectorAll(".kind").forEach((c) => c.addEventListener("change", apply));
  </script>
```

- [ ] **Step 3: 讓元件在初始化完成後派發 rg:ready**

`src/components/RelationshipGraph.svelte` 的 `onMount` 內，在 `cy!.layout(layout).run();` 之後加入：

```ts
      // 通知頁面實例已就緒（/graph 的篩選/搜尋需要它，見 src/pages/graph.astro）。
      // bubbles 讓 document 層級的監聽收得到；不用輪詢，先後掛載都不會漏。
      container.dispatchEvent(new CustomEvent('rg:ready', { detail: cy, bubbles: true }));
```

此事件只在 Cytoscape 初始化成功時派發；失敗走 catch 分支不派發，`/graph` 的篩選器因此保持停用而非對著壞掉的實例操作。

- [ ] **Step 4: 建置**

Run: `pnpm build`
Expected: build 成功，`dist/graph/index.html` 存在

- [ ] **Step 5: 目視驗收**

Run: `pnpm dev`，開 `/graph`：

- 全圖渲染，可縮放拖曳
- 取消勾選「政治關係」→ 派系/師徒/金主的線消失，只剩家族關係的人
- 搜尋輸入「陳」→ 只剩姓名含「陳」且仍有可見連線的節點
- 兩個都取消勾選 → 圖空白（可接受，非錯誤）

- [ ] **Step 6: Commit**

```bash
git add src/pages/graph.astro src/components/RelationshipGraph.svelte
git commit -m "feat(graph): 新增 /graph 全局關係圖頁(關係類型篩選/姓名搜尋)"
```

---

### Task 9: 導覽列連結與最終驗收

**Files:**
- Modify: `src/layouts/Base.astro`（導覽列）

**Interfaces:**
- Consumes: Task 8 的 `/graph` 路由
- Produces: 無

- [ ] **Step 1: 加導覽連結**

`src/layouts/Base.astro` 第 66–69 行的導覽列目前為：

```astro
        <nav class="nav" aria-label="主選單">
          <a href="/">總覽</a>
          <a href="/donors">政治獻金</a>
          <a href="/about">關於</a>
```

在「政治獻金」與「關於」之間插入一行（「關於」維持在最後）：

```astro
          <a href="/graph">關係圖</a>
```

- [ ] **Step 2: 全套測試與建置**

Run: `pnpm test && pnpm build`
Expected: 全部測試 PASS；build 成功無錯誤

- [ ] **Step 3: 最終驗收清單**

Run: `pnpm preview`，逐項確認：

| 項目 | 預期 |
|---|---|
| `/graph` 可從導覽列進入 | ✓ |
| 檔案頁關係區塊：圖在上、文字清單在下且含「出處 ↗」 | ✓ |
| 停用瀏覽器 JavaScript 後開檔案頁 | 圖不顯示，文字清單仍完整可讀 |
| 亮/暗模式切換 | 圖的節點、連線、文字色皆跟著變 |
| 無任何關係的官員頁（如某位只有判決無關係者） | 不出現「人物關係」區塊 |

- [ ] **Step 4: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat(graph): 導覽列加入關係圖入口"
```

---

## Self-Review 紀錄

**Spec 覆蓋檢查**

| Spec 章節 | 對應 Task |
|---|---|
| §1.1 期望管理 | 無 task（驗收基準，寫在 Task 7/9 的目視檢查） |
| §2 資料現況 | Task 4 驗收數字 |
| §3.1 合併清單（6 組） | Task 1（純函式）、Task 2（腳本＋執行） |
| §3.2 張美慧不合併 | Task 4 Step 2 明確驗收「只剩張美慧」 |
| §3.3 合併腳本規格 | Task 2 |
| §4.1 photoUrl 管線 | Task 3 |
| §4.2 外部人物照片不做 | 無 task（YAGNI） |
| §5.1 節點尺寸／頭像／邊框／標籤 | Task 5（尺寸、頭像、標籤）、Task 6（邊框、樣式） |
| §5.2 用色對照 | Task 6 `buildStyle` |
| §5.3 連線 | Task 6 |
| §5.4 佈局 concentric／cose | Task 6 |
| §5.5 第二層弱化 | Task 5（depth、size）、Task 6（`node[depth = 2]`） |
| §6.1 檔案頁整合、2 跳、清單留下 | Task 7 |
| §6.2 `/graph` 頁 | Task 8 |
| §7 測試 | Task 1、3、5 |
| §8 邊界處理 | Task 6（Cytoscape 失敗降級）、Task 2 Step 5（冪等）、Task 7 Step 6（2 節點不破版） |

**已知偏離**：§5.2 的「職稱用 --faint」因 Cytoscape 單一 label 限制無法實作，見本文件開頭〈已知的 spec 偏離〉。§8 的「照片 404 → 退化為文字圓」未實作——Cytoscape 的 `background-image` 載入失敗時會顯示 `background-color`（即 `--surface` 空白圓），姓名仍在圓下方可讀，判定為可接受的降級，不額外寫 fallback 邏輯。

**型別一致性檢查**：`planMerges`／`RelRow`／`MergePair`（Task 1 定義，Task 2 使用）、`toCytoscapeElements`／`nodeDepths`／`avatarDataUri`（Task 5 定義，Task 6 使用）、`OFFICE_LABEL`（Task 3 定義，Task 5、Task 7 使用）、`GraphNode.photoUrl`（Task 3 定義，Task 5 使用）名稱與簽章皆一致。
