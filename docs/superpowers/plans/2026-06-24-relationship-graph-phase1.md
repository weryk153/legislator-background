# 人物關係圖 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通「政治人物為主軸的關係網路圖」端到端——schema、半自動萃取工具、少量已查證種子資料、檔案頁內嵌 ego 關係網（Cytoscape）。

**Architecture:** 延伸現有 Astro SSG + Svelte + 本地 Supabase 管線。新增 `entities`、`relationships` 兩張表；build 時由 `scraper/export-graph.ts` 匯出 committed `src/data/graph.json`；純資料邏輯（組裝/驗證/ego 子圖）放 `src/lib/graph.ts` 並單元測試；檔案頁以 `RelationshipGraph.svelte`（Cytoscape，client island）渲染。零 runtime DB。

**Tech Stack:** Astro 5 + Svelte 5、Supabase(Postgres)、Cytoscape.js、tsx（腳本）、vitest（測試）。

## Global Constraints

- Node `>=22`；套件管理器 `pnpm@10.16.1`。本地 Supabase 容器名 `supabase_db_legislator-background`。
- 腳本以 `tsx` 執行；測試以 `vitest run`（`pnpm test`）。
- 每條關係（relationship）**必須有 source**，沿用現有 `sources` 表與 `SourceType`。資料原則「寧缺勿濫」：只存已查證者。
- 提交訊息用繁體中文；資料/UI 文案維持繁體中文一致（技術名詞可英文）。
- 純資料函式（`src/lib/graph.ts` 的組裝/驗證/子圖）**不可** import `node:fs` 或任何瀏覽器/DB API，以便單元測試與被 Svelte/Astro 兩端安全引用；讀檔的 `loadGraph()` 單獨一個函式、僅供 `.astro`（build 期）使用。
- node `key` 一律 `<type>:<id>`（type ∈ official|entity）。
- 對稱關係 `directed=false`（配偶/手足/同案）匯出時去重；有向關係 `directed=true`（親子：from=父母 → to=子女）保留方向。
- 不動現有 `officials` 表與既有 enum。

---

### Task 1: Schema migration（entities + relationships）

**Files:**
- Create: `supabase/migrations/0006_relationships.sql`

**Interfaces:**
- Produces: 資料表 `entities(id, name, entity_type, description, photo_url, wikipedia_url)`、`relationships(id, from_type, from_id, to_type, to_id, relation_type, directed, note, source_id)`；enum `entity_type`、`relation_type`、`node_ref_type`。供 Task 3 export 查詢、Task 5 seed 寫入。

- [ ] **Step 1: 寫 migration SQL**

`supabase/migrations/0006_relationships.sql`：
```sql
-- 人物關係圖：外部公眾人物 + 人與人關係。沿用既有 sources 表。
create type entity_type as enum (
  'businessperson', 'religious', 'celebrity', 'media', 'family_member', 'organization', 'other'
);
create type relation_type as enum (
  -- 家族
  'spouse', 'parent_child', 'sibling', 'relative',
  -- 政治
  'faction', 'mentor', 'party_bloc', 'aide', 'backer', 'co_case'
);
create type node_ref_type as enum ('official', 'entity');

-- 非公職的外部公眾人物（無完整檔案頁）
create table entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entity_type entity_type not null,
  description text not null default '',
  photo_url text,
  wikipedia_url text
);

-- 人與人的關係（端點可指向 official 或 entity；完整性由 build 期 validate 保證）
create table relationships (
  id uuid primary key default gen_random_uuid(),
  from_type node_ref_type not null,
  from_id uuid not null,
  to_type node_ref_type not null,
  to_id uuid not null,
  relation_type relation_type not null,
  directed boolean not null default false,
  note text,
  source_id uuid not null references sources(id),     -- 每條關係必附來源
  check (not (from_type = to_type and from_id = to_id)) -- 禁止自連
);
create index relationships_from_idx on relationships (from_type, from_id);
create index relationships_to_idx on relationships (to_type, to_id);

-- RLS：公開唯讀，寫入只走 service role（bypass RLS），與既有表一致
alter table entities enable row level security;
alter table relationships enable row level security;
create policy "public read" on entities for select using (true);
create policy "public read" on relationships for select using (true);
```

- [ ] **Step 2: 套用到本地 Supabase**

Run:
```bash
docker exec -i supabase_db_legislator-background psql -U postgres -d postgres < supabase/migrations/0006_relationships.sql
```
Expected: 輸出多行 `CREATE TYPE` / `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` / `CREATE POLICY`，無 ERROR。

- [ ] **Step 3: 驗證表與約束存在**

Run:
```bash
docker exec supabase_db_legislator-background psql -U postgres -d postgres -c "\d relationships" -c "\d entities"
```
Expected: 顯示兩張表結構，`relationships` 含 `source_id` 外鍵與 check 約束。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_relationships.sql
git commit -m "feat(db): 新增 entities 與 relationships 資料表（人物關係圖 schema）"
```

---

### Task 2: 關係圖型別 + 純組裝/驗證/ego 子圖（`src/lib/graph.ts`）

這是 TDD 核心：把 raw DB 列組裝成 `GraphData`，做完整性驗證、對稱邊去重、孤點過濾，並提供 ego 子圖抽取。

**Files:**
- Modify: `src/lib/types.ts`（新增型別）
- Create: `src/lib/graph.ts`
- Create: `test/graph.test.ts`

**Interfaces:**
- Consumes: `RawSource`、`RawOfficial`、`OfficeType`（既有，from `./types`）。
- Produces:
  - 型別 `EntityType`、`RelationType`、`NodeRefType`、`RawEntity`、`RawRelationship`、`GraphNode`、`GraphEdge`、`GraphData`。
  - `buildGraphData(officials, entities, relationships): { data: GraphData; errors: string[] }`，其中 `officials: Pick<RawOfficial,'id'|'slug'|'name'|'party'|'office_type'>[]`、`entities: RawEntity[]`、`relationships: RawRelationship[]`。
  - `egoSubgraph(data: GraphData, centerKey: string, hops?: number): GraphData`（預設 hops=2）。

- [ ] **Step 1: 在 types.ts 新增型別**

在 `src/lib/types.ts` 末端加入：
```ts
export type EntityType =
  | 'businessperson' | 'religious' | 'celebrity' | 'media' | 'family_member' | 'organization' | 'other';
export type RelationType =
  | 'spouse' | 'parent_child' | 'sibling' | 'relative'
  | 'faction' | 'mentor' | 'party_bloc' | 'aide' | 'backer' | 'co_case';
export type NodeRefType = 'official' | 'entity';

// Raw DB rows (snake_case), source nested via PostgREST join.
export interface RawEntity {
  id: string; name: string; entity_type: EntityType; description: string;
  photo_url: string | null; wikipedia_url: string | null;
}
export interface RawRelationship {
  id: string; from_type: NodeRefType; from_id: string; to_type: NodeRefType; to_id: string;
  relation_type: RelationType; directed: boolean; note: string | null; source: RawSource;
}

// Clean graph (committed to src/data/graph.json).
export interface GraphNode {
  key: string;            // `${kind}:${id}`
  name: string;
  kind: NodeRefType;
  subtype: string;        // official: officeType；entity: entity_type
  slug?: string;          // official 才有，可連回檔案頁
  party?: string;         // official
  officeType?: OfficeType;// official
  description?: string;   // entity
}
export interface GraphEdge {
  id: string; source: string; target: string;  // source/target = node key
  type: RelationType; directed: boolean; note: string | null; sourceUrl: string;
}
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; }
```

- [ ] **Step 2: 寫失敗測試**

`test/graph.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { buildGraphData, egoSubgraph } from '../src/lib/graph';
import type { RawEntity, RawRelationship, RawSource } from '../src/lib/types';

const src: RawSource = { id: 's1', url: 'https://j', type: 'court', title: '判決', retrieved_at: '2026-06-24' };
const officials = [
  { id: 'a', slug: 'wang', name: '王又民', party: '無', office_type: 'councilor' as const },
  { id: 'b', slug: 'shen', name: '沈宗隆', party: '無', office_type: 'councilor' as const },
];
const entities: RawEntity[] = [
  { id: 'e1', name: '白惠萍', entity_type: 'family_member', description: '配偶', photo_url: null, wikipedia_url: null },
];
const rel = (over: Partial<RawRelationship>): RawRelationship => ({
  id: 'r1', from_type: 'official', from_id: 'a', to_type: 'official', to_id: 'b',
  relation_type: 'co_case', directed: false, note: null, source: src, ...over,
});

describe('buildGraphData', () => {
  it('resolves endpoints to node keys and keeps only nodes with an edge', () => {
    const { data, errors } = buildGraphData(officials, entities, [rel({})]);
    expect(errors).toEqual([]);
    expect(data.edges).toHaveLength(1);
    expect(data.edges[0]).toMatchObject({ source: 'official:a', target: 'official:b', type: 'co_case', sourceUrl: 'https://j' });
    expect(data.nodes.map((n) => n.key).sort()).toEqual(['official:a', 'official:b']);
    expect(data.nodes.find((n) => n.key === 'official:a')).toMatchObject({ name: '王又民', kind: 'official', slug: 'wang', subtype: 'councilor' });
  });

  it('includes an entity endpoint as a node with its description', () => {
    const { data } = buildGraphData(officials, entities,
      [rel({ to_type: 'entity', to_id: 'e1', relation_type: 'spouse' })]);
    expect(data.nodes.find((n) => n.key === 'entity:e1')).toMatchObject({ name: '白惠萍', kind: 'entity', subtype: 'family_member', description: '配偶' });
  });

  it('flags a dangling endpoint', () => {
    const { errors } = buildGraphData(officials, entities, [rel({ to_id: 'zzz' })]);
    expect(errors).toContain('relationship r1: endpoint official:zzz not found');
  });

  it('flags a relationship missing a source', () => {
    const { errors } = buildGraphData(officials, entities, [rel({ source: undefined as unknown as RawSource })]);
    expect(errors).toContain('relationship r1: missing source');
  });

  it('dedupes a symmetric (directed=false) edge declared both ways', () => {
    const { data } = buildGraphData(officials, entities, [
      rel({ id: 'r1', from_id: 'a', to_id: 'b' }),
      rel({ id: 'r2', from_id: 'b', to_id: 'a' }),
    ]);
    expect(data.edges).toHaveLength(1);
  });

  it('keeps both directions distinct for directed edges', () => {
    const { data } = buildGraphData(officials, entities, [
      rel({ id: 'r1', from_id: 'a', to_id: 'b', relation_type: 'parent_child', directed: true }),
      rel({ id: 'r2', from_id: 'b', to_id: 'a', relation_type: 'parent_child', directed: true }),
    ]);
    expect(data.edges).toHaveLength(2);
  });
});

describe('egoSubgraph', () => {
  const data = buildGraphData(officials,
    [{ id: 'e1', name: '李四', entity_type: 'other', description: '', photo_url: null, wikipedia_url: null }],
    [
      rel({ id: 'r1', from_id: 'a', to_id: 'b' }),
      rel({ id: 'r2', from_type: 'official', from_id: 'b', to_type: 'entity', to_id: 'e1', relation_type: 'aide' }),
    ],
  ).data;

  it('returns the center plus neighbours within hops', () => {
    const ego1 = egoSubgraph(data, 'official:a', 1);
    expect(ego1.nodes.map((n) => n.key).sort()).toEqual(['official:a', 'official:b']);
    const ego2 = egoSubgraph(data, 'official:a', 2);
    expect(ego2.nodes.map((n) => n.key).sort()).toEqual(['entity:e1', 'official:a', 'official:b']);
  });

  it('returns empty graph for an unknown center', () => {
    expect(egoSubgraph(data, 'official:zzz', 2)).toEqual({ nodes: [], edges: [] });
  });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm exec vitest run test/graph.test.ts`
Expected: FAIL（`Cannot find module '../src/lib/graph'` 或函式未定義）。

- [ ] **Step 4: 實作 `src/lib/graph.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  GraphData, GraphEdge, GraphNode, OfficeType,
  RawEntity, RawOfficial, RawRelationship,
} from './types';

type RawOfficialNode = Pick<RawOfficial, 'id' | 'slug' | 'name' | 'party' | 'office_type'>;
const keyOf = (type: 'official' | 'entity', id: string) => `${type}:${id}`;

// Pure: raw rows → GraphData + validation errors. No fs / no network (unit-testable, browser-safe).
export function buildGraphData(
  officials: RawOfficialNode[],
  entities: RawEntity[],
  relationships: RawRelationship[],
): { data: GraphData; errors: string[] } {
  const errors: string[] = [];

  // All possible nodes, keyed; only referenced ones are emitted.
  const allNodes = new Map<string, GraphNode>();
  for (const o of officials) {
    allNodes.set(keyOf('official', o.id), {
      key: keyOf('official', o.id), name: o.name, kind: 'official',
      subtype: o.office_type, slug: o.slug, party: o.party, officeType: o.office_type as OfficeType,
    });
  }
  for (const e of entities) {
    allNodes.set(keyOf('entity', e.id), {
      key: keyOf('entity', e.id), name: e.name, kind: 'entity',
      subtype: e.entity_type, description: e.description,
    });
  }

  const edges: GraphEdge[] = [];
  const seen = new Set<string>(); // dedup key
  const used = new Set<string>(); // node keys actually referenced

  for (const r of relationships) {
    const from = keyOf(r.from_type, r.from_id);
    const to = keyOf(r.to_type, r.to_id);
    if (!allNodes.has(from)) { errors.push(`relationship ${r.id}: endpoint ${from} not found`); continue; }
    if (!allNodes.has(to)) { errors.push(`relationship ${r.id}: endpoint ${to} not found`); continue; }
    if (from === to) { errors.push(`relationship ${r.id}: self-loop`); continue; }
    if (!r.source) { errors.push(`relationship ${r.id}: missing source`); continue; }

    // Dedup: directed → keep (from,to,type); undirected → canonicalise pair so A-B == B-A.
    const pair = r.directed ? `${from}|${to}` : [from, to].sort().join('|');
    const dedupKey = `${pair}|${r.relation_type}|${r.directed}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    edges.push({
      id: r.id, source: from, target: to, type: r.relation_type,
      directed: r.directed, note: r.note ?? null, sourceUrl: r.source.url,
    });
    used.add(from); used.add(to);
  }

  const nodes = [...used].map((k) => allNodes.get(k)!).sort((a, b) => a.key.localeCompare(b.key));
  edges.sort((a, b) => a.id.localeCompare(b.id));
  return { data: { nodes, edges }, errors };
}

// Pure: BFS from centerKey up to `hops`, return the induced subgraph (nodes + edges among them).
export function egoSubgraph(data: GraphData, centerKey: string, hops = 2): GraphData {
  const byKey = new Map(data.nodes.map((n) => [n.key, n]));
  if (!byKey.has(centerKey)) return { nodes: [], edges: [] };

  const adj = new Map<string, GraphEdge[]>();
  for (const e of data.edges) {
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e);
  }

  const within = new Set<string>([centerKey]);
  let frontier = [centerKey];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const k of frontier) {
      for (const e of adj.get(k) ?? []) {
        const other = e.source === k ? e.target : e.source;
        if (!within.has(other)) { within.add(other); next.push(other); }
      }
    }
    frontier = next;
  }

  const nodes = [...within].map((k) => byKey.get(k)!).sort((a, b) => a.key.localeCompare(b.key));
  const edges = data.edges.filter((e) => within.has(e.source) && within.has(e.target));
  return { nodes, edges };
}

// Build-time only (imported by .astro, NOT by the Svelte island). Missing file → empty graph,
// so the site builds before any relationship has been seeded.
export function loadGraph(): GraphData {
  try {
    const path = join(process.cwd(), 'src', 'data', 'graph.json');
    return JSON.parse(readFileSync(path, 'utf8')) as GraphData;
  } catch {
    return { nodes: [], edges: [] };
  }
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `pnpm exec vitest run test/graph.test.ts`
Expected: PASS（全部 8 個案例綠燈）。

- [ ] **Step 6: 型別檢查**

Run: `pnpm exec astro check 2>&1 | tail -5`
Expected: 無新增 graph 相關型別錯誤。

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/graph.ts test/graph.test.ts
git commit -m "feat: 關係圖型別與純組裝/驗證/ego子圖邏輯（graph.ts）"
```

---

### Task 3: 匯出腳本（`scraper/export-graph.ts`）+ `export:graph`

從本地 Supabase 撈 officials/entities/relationships，組裝後寫 `src/data/graph.json`；驗證失敗則中止。

**Files:**
- Create: `scraper/export-graph.ts`
- Modify: `package.json`（新增 `export:graph` script）

**Interfaces:**
- Consumes: `buildGraphData`（Task 2）；`loadEnv`（既有 `./lib/loadEnv`）；env `PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。
- Produces: committed 檔 `src/data/graph.json`（`GraphData` 形狀）。

- [ ] **Step 1: 寫匯出腳本**

`scraper/export-graph.ts`（比照 `scraper/export-officials.ts` 結構）：
```ts
// 從本地 Supabase 匯出關係圖快照（src/data/graph.json）。build 不需 DB。
//   pnpm run export:graph
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildGraphData } from '../src/lib/graph';
import { loadEnv } from './lib/loadEnv';
import type { RawEntity, RawRelationship } from '../src/lib/types';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  // officials（只取建節點需要的欄位，分頁撈）
  const officials: { id: string; slug: string; name: string; party: string; office_type: string }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('officials').select('id, slug, name, party, office_type').range(from, from + pageSize - 1);
    if (error) throw new Error(`officials query failed: ${error.message}`);
    const page = data ?? [];
    officials.push(...(page as typeof officials));
    if (page.length < pageSize) break;
  }

  const { data: entities, error: eErr } = await supabase
    .from('entities').select('id, name, entity_type, description, photo_url, wikipedia_url');
  if (eErr) throw new Error(`entities query failed: ${eErr.message}`);

  const { data: relationships, error: rErr } = await supabase
    .from('relationships')
    .select('id, from_type, from_id, to_type, to_id, relation_type, directed, note, source:sources(*)');
  if (rErr) throw new Error(`relationships query failed: ${rErr.message}`);

  const { data, errors } = buildGraphData(
    officials as Parameters<typeof buildGraphData>[0],
    (entities ?? []) as RawEntity[],
    (relationships ?? []) as unknown as RawRelationship[],
  );
  if (errors.length > 0) {
    throw new Error(`Graph validation failed (export aborted):\n- ${errors.join('\n- ')}`);
  }

  const outDir = join(here, '..', 'src', 'data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'graph.json'), JSON.stringify(data));
  console.log(`exported graph: ${data.nodes.length} nodes, ${data.edges.length} edges → src/data/graph.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 加 package.json script**

在 `package.json` 的 `scripts` 內、`"export:data"` 之後新增一行：
```json
    "export:graph": "tsx scraper/export-graph.ts",
```

- [ ] **Step 3: 跑匯出（此時關係為空，應產生空圖）**

Run:
```bash
PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm run export:graph
```
Expected: 輸出 `exported graph: 0 nodes, 0 edges → src/data/graph.json`，且 `src/data/graph.json` 內容為 `{"nodes":[],"edges":[]}`。

- [ ] **Step 4: Commit**

```bash
git add scraper/export-graph.ts package.json src/data/graph.json
git commit -m "feat(build): export-graph 匯出 src/data/graph.json（沿用 SSG 管線）"
```

---

### Task 4: 半自動萃取工具（`scraper/extract-relationships.ts`）

從現有判決/爭議內文挖「候選關係」供人工校對。核心是純解析函式（TDD），腳本只負責讀 DB → 跑解析 → 印候選清單（**不寫入 DB**）。

**Files:**
- Create: `src/lib/extractRelationships.ts`
- Create: `test/extractRelationships.test.ts`
- Create: `scraper/extract-relationships.ts`

**Interfaces:**
- Produces: `extractCandidates(text: string): { relationType: RelationType; counterpartName: string; cue: string }[]`（純函式）。腳本輸出候選清單到 stdout（JSON）。

- [ ] **Step 1: 寫失敗測試**

`test/extractRelationships.test.ts`：
```ts
import { describe, it, expect } from 'vitest';
import { extractCandidates } from '../src/lib/extractRelationships';

describe('extractCandidates', () => {
  it('picks up a spouse cue with the counterpart name', () => {
    const out = extractCandidates('被告之配偶白惠萍共同犯詐欺罪');
    expect(out).toContainEqual({ relationType: 'spouse', counterpartName: '白惠萍', cue: '配偶' });
  });

  it('picks up an aide cue', () => {
    const out = extractCandidates('李雲強之助理孫韻璇負責處理助理費');
    expect(out.some((c) => c.relationType === 'aide')).toBe(true);
  });

  it('returns empty when no relationship cue present', () => {
    expect(extractCandidates('被告犯酒後駕車罪，處拘役')).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm exec vitest run test/extractRelationships.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作 `src/lib/extractRelationships.ts`**

```ts
import type { RelationType } from './types';

// 關係線索：cue 關鍵字 → relationType。只做「候選」標記，務必人工校對。
const CUES: { re: RegExp; relationType: RelationType; cue: string }[] = [
  { re: /配偶|夫|妻|先生|太太/, relationType: 'spouse', cue: '配偶' },
  { re: /兒子|女兒|父|母|父親|母親/, relationType: 'parent_child', cue: '親子' },
  { re: /兄|弟|姊|妹|兄弟|姊妹/, relationType: 'sibling', cue: '手足' },
  { re: /助理/, relationType: 'aide', cue: '助理' },
  { re: /共同被告|同案|共犯/, relationType: 'co_case', cue: '同案' },
  { re: /樁腳|金主|政治獻金/, relationType: 'backer', cue: '金主' },
];

// 抓 cue 前後最近的中文姓名（2–4 字）。粗略、僅供候選；不確定回空名字。
const NAME = /[一-鿿]{2,4}/g;

export function extractCandidates(text: string): { relationType: RelationType; counterpartName: string; cue: string }[] {
  if (!text) return [];
  const out: { relationType: RelationType; counterpartName: string; cue: string }[] = [];
  for (const { re, relationType, cue } of CUES) {
    const m = re.exec(text);
    if (!m) continue;
    // 取 cue 詞後方緊鄰的姓名（如「配偶白惠萍」）
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    const name = (after.match(NAME) ?? [])[0] ?? '';
    out.push({ relationType, counterpartName: name, cue });
  }
  return out;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `pnpm exec vitest run test/extractRelationships.test.ts`
Expected: PASS。

- [ ] **Step 5: 寫萃取腳本（讀 DB → 印候選）**

`scraper/extract-relationships.ts`：
```ts
// 半自動萃取：掃 judgments/controversies 內文找候選關係，印 JSON 供人工校對。不寫入 DB。
//   pnpm exec tsx scraper/extract-relationships.ts
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';
import { extractCandidates } from '../src/lib/extractRelationships';

loadEnv();

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  const { data: judgments, error } = await supabase
    .from('judgments').select('official_id, outcome, officials(name)');
  if (error) throw new Error(error.message);

  const candidates: unknown[] = [];
  for (const j of judgments ?? []) {
    const subject = (j as { officials?: { name?: string } }).officials?.name ?? '(unknown)';
    for (const c of extractCandidates((j as { outcome: string }).outcome)) {
      if (!c.counterpartName || c.counterpartName === subject) continue;
      candidates.push({ subject, ...c });
    }
  }
  console.log(JSON.stringify(candidates, null, 2));
  console.error(`\n${candidates.length} 候選關係（請人工校對後再入庫）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: 冒煙跑一次（確認不爆、輸出候選）**

Run:
```bash
PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm exec tsx scraper/extract-relationships.ts 2>&1 | tail -5
```
Expected: 印出候選關係的 JSON（可能數筆，如 配偶/同案/助理），最後一行 `N 候選關係...`，無例外。

- [ ] **Step 7: Commit**

```bash
git add src/lib/extractRelationships.ts test/extractRelationships.test.ts scraper/extract-relationships.ts
git commit -m "feat(scraper): 半自動關係萃取工具（候選清單，供人工校對）"
```

---

### Task 5: 種子已查證關係 + 重新匯出 graph.json

把本 session 已從判決查證的少量關係入庫，讓檔案頁有實際內容。以「姓名＋office_type」查 officials，避免綁 UUID。

**Files:**
- Create: `scraper/seed-relationships.sql`

**Interfaces:**
- Consumes: Task 1 的 `entities`/`relationships`/enum；既有 `officials`、`sources`。
- Produces: DB 內數筆已查證關係 + entities；重跑 Task 3 後 `src/data/graph.json` 含實際節點/邊。

- [ ] **Step 1: 寫種子 SQL**

`scraper/seed-relationships.sql`（每條關係建一個 source；officials 以名字+職別查；外部人物建 entity）：
```sql
-- 已查證種子關係（來源為各該判決）。重複執行前可先清空：
--   delete from relationships; delete from entities; （僅本功能資料）
do $$
declare
  s_chen uuid; s_chenyi uuid; s_sun uuid; s_yun uuid;
  id_wang uuid; id_shen uuid; id_chen uuid; id_chenyi uuid; id_sun uuid;
  e_bai uuid; e_chang uuid; e_li uuid;
begin
  -- 端點 officials（名字＋職別查；查不到就略過該條，避免錯掛）
  select id into id_wang   from officials where name='王又民' and office_type='councilor' limit 1;
  select id into id_shen   from officials where name='沈宗隆' and office_type='councilor' limit 1;
  select id into id_chen   from officials where name='陳重文' and office_type='councilor' limit 1;
  select id into id_chenyi from officials where name='陳怡君' and office_type='councilor' limit 1;
  select id into id_sun    from officials where name='孫韻璇' and office_type='councilor' limit 1;

  -- 外部公眾人物（配偶/前民代）
  insert into entities(name, entity_type, description) values
    ('白惠萍','family_member','臺北市議員陳重文之配偶，貪污案共同被告') returning id into e_bai;
  insert into entities(name, entity_type, description) values
    ('張惠霖','family_member','臺北市議員陳怡君之同居伴侶，貪污案共同被告') returning id into e_chang;
  insert into entities(name, entity_type, description) values
    ('李雲強','other','前桃園縣／市議員，桃園市議員孫韻璇之配偶') returning id into e_li;

  -- 來源（沿用各該判決 URL）
  insert into sources(url,type,title,retrieved_at) values
    ('https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=ULDM,113,%E7%9F%9A%E8%A8%B4,1&ot=in','court','雲林地院113年度矚訴字第1號','2026-06-24') returning id into s_sun;
  insert into sources(url,type,title,retrieved_at) values
    ('https://www.cna.com.tw/','news','臺北市議員陳重文貪污案報導','2026-06-24') returning id into s_chen;
  insert into sources(url,type,title,retrieved_at) values
    ('https://www.cna.com.tw/','news','臺北市議員陳怡君貪污案報導','2026-06-24') returning id into s_chenyi;
  insert into sources(url,type,title,retrieved_at) values
    ('https://www.cna.com.tw/','news','桃園市議員孫韻璇貪污案報導','2026-06-24') returning id into s_yun;

  -- 關係（端點都存在才插）
  if id_wang is not null and id_shen is not null then
    insert into relationships(from_type,from_id,to_type,to_id,relation_type,directed,note,source_id)
    values ('official',id_wang,'official',id_shen,'co_case',false,'雲林縣議會貪污案共同被告（113矚訴1）',s_sun);
  end if;
  if id_chen is not null then
    insert into relationships(from_type,from_id,to_type,to_id,relation_type,directed,note,source_id)
    values ('official',id_chen,'entity',e_bai,'spouse',false,'貪污案共同被告',s_chen);
  end if;
  if id_chenyi is not null then
    insert into relationships(from_type,from_id,to_type,to_id,relation_type,directed,note,source_id)
    values ('official',id_chenyi,'entity',e_chang,'relative',false,'同居伴侶、貪污案共同被告',s_chenyi);
  end if;
  if id_sun is not null then
    insert into relationships(from_type,from_id,to_type,to_id,relation_type,directed,note,source_id)
    values ('official',id_sun,'entity',e_li,'spouse',false,'配偶，犯行發生於其夫任議員期間',s_yun);
  end if;
end $$;
```

- [ ] **Step 2: 套用種子**

Run:
```bash
docker exec -i supabase_db_legislator-background psql -U postgres -d postgres < scraper/seed-relationships.sql
```
Expected: `DO`，無 ERROR。

- [ ] **Step 3: 驗證入庫筆數**

Run:
```bash
docker exec supabase_db_legislator-background psql -U postgres -d postgres -t -c "select count(*) from relationships;" -c "select count(*) from entities;"
```
Expected: relationships ≥ 1、entities = 3（視 officials 是否都查得到，relationships 介於 1–4）。

- [ ] **Step 4: 重新匯出 graph.json**

Run:
```bash
PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm run export:graph
```
Expected: `exported graph: N nodes, M edges`（N≥2、M≥1），無驗證錯誤。

- [ ] **Step 5: Commit**

```bash
git add scraper/seed-relationships.sql src/data/graph.json
git commit -m "data: 種子已查證人物關係（陳重文/陳怡君/孫韻璇配偶、王又民沈宗隆同案）"
```

---

### Task 6: ego 關係網元件 + 檔案頁整合 + build 驗證

**Files:**
- Create: `src/components/RelationshipGraph.svelte`
- Modify: `src/pages/officials/[id].astro`
- Modify: `package.json`（透過 `pnpm add cytoscape`）

**Interfaces:**
- Consumes: `GraphNode`/`GraphEdge`（types）；`loadGraph`、`egoSubgraph`（graph.ts）。
- Produces: 檔案頁「人物關係」區塊（有關係者才出現）。

- [ ] **Step 1: 安裝 Cytoscape**

Run:
```bash
PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm add cytoscape && PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm add -D @types/cytoscape
```
Expected: `package.json` 多出 `cytoscape` 依賴與 `@types/cytoscape` devDependency。

- [ ] **Step 2: 寫 RelationshipGraph.svelte**

`src/components/RelationshipGraph.svelte`（Svelte 5 runes；Cytoscape 於 onMount 動態載入，避免 SSR）：
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { GraphNode, GraphEdge } from '../lib/types';

  let { nodes, edges, centerKey }: { nodes: GraphNode[]; edges: GraphEdge[]; centerKey: string } = $props();

  // relation_type → 中文標籤 + 是否家族（家族實線、政治虛線）
  const REL_LABEL: Record<string, string> = {
    spouse: '配偶', parent_child: '親子', sibling: '手足', relative: '親屬',
    faction: '派系', mentor: '師徒', party_bloc: '黨團', aide: '助理', backer: '金主', co_case: '同案',
  };
  const FAMILY = new Set(['spouse', 'parent_child', 'sibling', 'relative']);

  let container: HTMLDivElement;

  onMount(async () => {
    const cytoscape = (await import('cytoscape')).default;
    const cy = cytoscape({
      container,
      elements: [
        ...nodes.map((n) => ({ data: { id: n.key, label: n.name, slug: n.slug ?? '', kind: n.kind, center: n.key === centerKey ? 1 : 0 } })),
        ...edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: REL_LABEL[e.type] ?? e.type, fam: FAMILY.has(e.type) ? 1 : 0, dir: e.directed ? 1 : 0 } })),
      ],
      style: [
        { selector: 'node', style: { label: 'data(label)', 'font-size': 12, 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#cbd5e1', 'border-width': 2, 'border-color': '#94a3b8', shape: 'round-rectangle', width: 'label', height: 28, padding: '6px', color: '#0f172a' } },
        { selector: 'node[kind = "official"]', style: { 'background-color': '#1e293b', color: '#f8fafc', 'border-color': '#334155' } },
        { selector: 'node[center = 1]', style: { 'border-color': '#b3261e', 'border-width': 3 } },
        { selector: 'edge', style: { label: 'data(label)', 'font-size': 10, 'curve-style': 'bezier', width: 1.5, 'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8', color: '#475569', 'text-background-color': '#fff', 'text-background-opacity': 1, 'text-background-padding': '2px' } },
        { selector: 'edge[fam = 1]', style: { 'line-color': '#0f766e', 'line-style': 'solid' } },
        { selector: 'edge[fam = 0]', style: { 'line-style': 'dashed' } },
        { selector: 'edge[dir = 1]', style: { 'target-arrow-shape': 'triangle' } },
      ],
      layout: { name: 'concentric', concentric: (n: { data: (k: string) => number }) => n.data('center'), levelWidth: () => 1, minNodeSpacing: 40 },
      userZoomingEnabled: true, autoungrabify: false,
    });
    cy.on('tap', 'node[slug]', (evt: { target: { data: (k: string) => string } }) => {
      const slug = evt.target.data('slug');
      if (slug) window.location.href = `/officials/${slug}`;
    });
  });
</script>

<div bind:this={container} class="graph" role="img" aria-label="人物關係圖"></div>

<style>
  .graph { width: 100%; height: 360px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
</style>
```

- [ ] **Step 3: 檔案頁載入 ego 子圖並渲染**

修改 `src/pages/officials/[id].astro`：

(a) 在 frontmatter 既有 import 後加：
```ts
import RelationshipGraph from "../../components/RelationshipGraph.svelte";
import { loadGraph, egoSubgraph } from "../../lib/graph";
```

(b) 將 `getStaticPaths` 改為一次載入圖、逐人算 ego（取代既有 `return officials.map(...)`）：
```ts
export async function getStaticPaths() {
  const officials = await loadOfficials();
  const graph = loadGraph();
  return officials.map((o) => ({
    params: { id: o.slug },
    props: { official: o, ego: egoSubgraph(graph, `official:${o.id}`, 2) },
  }));
}
```

(c) 將 `const { official: o } = Astro.props;` 改為：
```ts
const { official: o, ego } = Astro.props;
```

(d) 在「財產申報」`</section>` 之後、`</Base>` 之前插入關係區塊：
```astro
  {ego.edges.length > 0 && (
    <section class="sec">
      <h2>人物關係</h2>
      <p class="note">關係資料整理自司法判決、媒體報導與公開資料，每條皆附出處，僅呈現已查證者。實心為公職人員（可點入檔案），外框為其他公眾人物。</p>
      <RelationshipGraph client:visible nodes={ego.nodes} edges={ego.edges} centerKey={`official:${o.id}`} />
    </section>
  )}
```

- [ ] **Step 4: 跑全部測試**

Run: `pnpm test`
Expected: PASS（含 graph.test.ts、extractRelationships.test.ts 與既有測試）。

- [ ] **Step 5: build 驗證**

Run:
```bash
PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm run build 2>&1 | grep -iE "page\(s\) built|error" | tail -5
```
Expected: `NNNN page(s) built`，無 error。

- [ ] **Step 6: 人工檢視一個有關係的檔案頁**

Run:
```bash
PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm exec astro dev &
sleep 3
```
開瀏覽器到有關係者的頁（例如王又民的 slug，可由 `docker exec supabase_db_legislator-background psql -U postgres -d postgres -t -c "select slug from officials where name='王又民' and office_type='councilor';"` 取得），確認「人物關係」區塊出現、節點/連線正確、點公職節點可跳轉。檢視後關閉 dev server。

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/RelationshipGraph.svelte src/pages/officials/\[id\].astro
git commit -m "feat: 檔案頁人物關係 ego 網（Cytoscape island）"
```

---

## 完成標準（Phase 1 Definition of Done）

- `pnpm test` 全綠（graph、extractRelationships 與既有測試）。
- `pnpm run export:graph` 由 DB 產出 `src/data/graph.json`，驗證閘門擋懸空邊/缺來源。
- `pnpm run build` 成功；有關係的官員檔案頁出現「人物關係」區塊並正確渲染、可點轉。
- 種子關係已入庫且每條附來源。

## 不在 Phase 1（YAGNI / 留待 Phase 2）

- 獨立 `/graph` 全局圖頁、篩選/搜尋、compound 家族/派系分群、dagre 階層佈局。
- hover tooltip 顯示來源全文（Phase 1 以邊標籤顯示關係類型）。
- 萃取工具自動寫入 DB（Phase 1 僅產候選清單，人工校對後手動入庫）。
- Base 導覽列加「關係圖」連結（待 Phase 2 全局圖頁存在再加）。
