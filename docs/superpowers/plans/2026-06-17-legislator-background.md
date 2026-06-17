# 公職人員背景資料庫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of a credibility-first public-office background database — a static Astro front end over Supabase data, covering current legislators and city/county heads with their careers, court judgments, controversies, and asset declarations, every fact backed by a source.

**Architecture:** Supabase (PostgreSQL) is the system of record. A build-time loader pulls all data via `@supabase/supabase-js`, runs reliability validators, and Astro statically generates the overview page, per-person profile pages, and about page. The overview's filter/sort/search is a single Svelte island fed serialized data at build time — the front end never connects to the DB at runtime. All "fact" rows (careers, judgments, controversies, assets) carry a mandatory source; the build fails if any are missing.

**Tech Stack:** Astro (SSG), Svelte (one island), TypeScript, Supabase / PostgreSQL, `@supabase/supabase-js`, Vitest. Noto Serif TC + system sans, single accent color, dark mode.

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts` | Project config |
| `supabase/migrations/0001_init.sql` | Schema, enums, RLS, source constraints |
| `supabase/seed.sql` | Curated sample records (placeholder names) for the prototype |
| `src/lib/types.ts` | Shared TypeScript types (view models + raw DB rows) |
| `src/lib/validate.ts` | Reliability validators (pure) — the legal/credibility core |
| `src/lib/transform.ts` | Raw snake_case DB rows → camelCase view models + list rows (pure) |
| `src/lib/filterSort.ts` | Overview list filter / sort / search (pure) |
| `src/lib/data.ts` | Supabase fetch + assemble + validate (build-time) |
| `src/components/OfficialTable.svelte` | Interactive filter/sort/search island |
| `src/components/Sources.astro`, `Section.astro` | Reusable presentation bits |
| `src/layouts/Base.astro` | HTML shell, fonts, theme tokens, dark-mode toggle |
| `src/styles/tokens.css` | Design tokens (colors, type, spacing) for light + dark |
| `src/pages/index.astro` | Overview page (renders island) |
| `src/pages/officials/[id].astro` | Per-person profile (getStaticPaths) |
| `src/pages/about.astro` | Sources, methodology, presumption-of-innocence, corrections |
| `test/*.test.ts` | Vitest unit tests for the pure libs |

Pure logic (`validate`, `transform`, `filterSort`) is TDD'd. Schema, pages, and the island are create-and-verify (rendering isn't unit-tested).

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `test/smoke.test.ts`

- [ ] **Step 1: Scaffold and install**

```bash
cd /Users/kurenpeng/Documents/kuren/legislator-background
npm create astro@latest -- --template minimal --no-install --no-git --typescript strict --yes .
npm install
npm install @astrojs/svelte svelte @supabase/supabase-js
npm install -D vitest
npx astro add svelte --yes
```

- [ ] **Step 2: Add the Vitest config and test script**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
```

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Add `.env.example`**

```
PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-for-build-time-reads
```

- [ ] **Step 4: Write a smoke test**

`test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Astro + Svelte + Vitest project"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Define view-model and raw types**

`src/lib/types.ts`:
```ts
export type OfficeType = 'legislator' | 'mayor_magistrate' | 'councilor';
export type ControversyStatus =
  | 'investigating' | 'indicted' | 'first_instance' | 'settled' | 'cleared' | 'other';
export type SourceType = 'court' | 'news' | 'gov' | 'gazette' | 'factcheck';

export interface Source { id: string; url: string; type: SourceType; title: string; retrievedAt: string; }
export interface Career { id: string; title: string; organization: string; startDate: string; endDate: string | null; source: Source; }
export interface Judgment { id: string; caseReason: string; court: string; caseNumber: string; outcome: string; isFinal: boolean; judgmentDate: string; judgmentUrl: string; source: Source; }
export interface Controversy { id: string; title: string; summary: string; status: ControversyStatus; eventDate: string; reportDate: string; sources: Source[]; }
export interface AssetDeclaration { id: string; year: number; totalAmount: number; source: Source; }

export interface Official {
  id: string; name: string; party: string; officeType: OfficeType; district: string;
  term: string; photoUrl: string | null; bio: string; isIncumbent: boolean;
  careers: Career[]; judgments: Judgment[]; controversies: Controversy[]; assets: AssetDeclaration[];
}

export interface OfficialListRow {
  id: string; name: string; party: string; officeType: OfficeType; district: string;
  judgmentCount: number; controversyCount: number; latestAssetTotal: number | null;
}

// Raw rows as returned by Supabase (snake_case). `*_sources` are nested via PostgREST joins.
export interface RawSource { id: string; url: string; type: SourceType; title: string; retrieved_at: string; }
export interface RawOfficial {
  id: string; name: string; party: string; office_type: OfficeType; district: string;
  term: string; photo_url: string | null; bio: string; is_incumbent: boolean;
  careers: { id: string; title: string; organization: string; start_date: string; end_date: string | null; source: RawSource }[];
  judgments: { id: string; case_reason: string; court: string; case_number: string; outcome: string; is_final: boolean; judgment_date: string; judgment_url: string; source: RawSource }[];
  controversies: { id: string; title: string; summary: string; status: ControversyStatus; event_date: string; report_date: string; controversy_sources: { source: RawSource }[] }[];
  asset_declarations: { id: string; year: number; total_amount: number; source: RawSource }[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: shared types for officials and related records"
```

---

## Task 3: Reliability validators (the credibility core)

**Files:**
- Create: `src/lib/validate.ts`
- Test: `test/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateOfficial, validateAll } from '../src/lib/validate';
import type { Official, Source } from '../src/lib/types';

const src: Source = { id: 's1', url: 'https://x', type: 'court', title: 't', retrievedAt: '2026-01-01' };

function baseOfficial(over: Partial<Official> = {}): Official {
  return {
    id: 'o1', name: '陳〇〇', party: '無', officeType: 'legislator', district: '北市3',
    term: '11', photoUrl: null, bio: '', isIncumbent: true,
    careers: [], judgments: [], controversies: [], assets: [], ...over,
  };
}

describe('validateOfficial', () => {
  it('passes a clean official with no fact rows', () => {
    expect(validateOfficial(baseOfficial())).toEqual([]);
  });

  it('flags a judgment missing a source', () => {
    const o = baseOfficial({ judgments: [
      { id: 'j1', caseReason: '貪污', court: '北院', caseNumber: '111', outcome: '有罪', isFinal: true, judgmentDate: '2024-01-01', judgmentUrl: 'https://j', source: undefined as unknown as Source },
    ]});
    expect(validateOfficial(o)).toContain('judgment j1: missing source');
  });

  it('flags a judgment missing an outcome', () => {
    const o = baseOfficial({ judgments: [
      { id: 'j1', caseReason: '貪污', court: '北院', caseNumber: '111', outcome: '   ', isFinal: true, judgmentDate: '2024-01-01', judgmentUrl: 'https://j', source: src },
    ]});
    expect(validateOfficial(o)).toContain('judgment j1: missing outcome');
  });

  it('flags a controversy with zero sources', () => {
    const o = baseOfficial({ controversies: [
      { id: 'c1', title: 'x', summary: 'y', status: 'investigating', eventDate: '2024-01-01', reportDate: '2024-01-02', sources: [] },
    ]});
    expect(validateOfficial(o)).toContain('controversy c1: needs at least one source');
  });

  it('flags a controversy missing reportDate', () => {
    const o = baseOfficial({ controversies: [
      { id: 'c1', title: 'x', summary: 'y', status: 'investigating', eventDate: '2024-01-01', reportDate: '', sources: [src] },
    ]});
    expect(validateOfficial(o)).toContain('controversy c1: missing reportDate');
  });

  it('flags a career and an asset missing a source', () => {
    const o = baseOfficial({
      careers: [{ id: 'k1', title: 'x', organization: 'y', startDate: '2020', endDate: null, source: undefined as unknown as Source }],
      assets: [{ id: 'a1', year: 2024, totalAmount: 1000, source: undefined as unknown as Source }],
    });
    const errs = validateOfficial(o);
    expect(errs).toContain('career k1: missing source');
    expect(errs).toContain('asset a1: missing source');
  });
});

describe('validateAll', () => {
  it('prefixes each error with the official name', () => {
    const o = baseOfficial({ judgments: [
      { id: 'j1', caseReason: '', court: '', caseNumber: '', outcome: '', isFinal: true, judgmentDate: '', judgmentUrl: '', source: undefined as unknown as Source },
    ]});
    expect(validateAll([o])).toContain('陳〇〇: judgment j1: missing source');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/validate.test.ts`
Expected: FAIL — `validate` module not found / functions undefined.

- [ ] **Step 3: Implement**

`src/lib/validate.ts`:
```ts
import type { Official } from './types';

export function validateOfficial(o: Official): string[] {
  const errors: string[] = [];

  for (const j of o.judgments) {
    if (!j.source) errors.push(`judgment ${j.id}: missing source`);
    if (!j.outcome?.trim()) errors.push(`judgment ${j.id}: missing outcome`);
    if (typeof j.isFinal !== 'boolean') errors.push(`judgment ${j.id}: isFinal must be boolean`);
  }
  for (const c of o.careers) {
    if (!c.source) errors.push(`career ${c.id}: missing source`);
  }
  for (const c of o.controversies) {
    if (!c.sources || c.sources.length === 0) errors.push(`controversy ${c.id}: needs at least one source`);
    if (!c.status) errors.push(`controversy ${c.id}: missing status`);
    if (!c.reportDate) errors.push(`controversy ${c.id}: missing reportDate`);
  }
  for (const a of o.assets) {
    if (!a.source) errors.push(`asset ${a.id}: missing source`);
  }
  return errors;
}

export function validateAll(officials: Official[]): string[] {
  return officials.flatMap((o) => validateOfficial(o).map((e) => `${o.name}: ${e}`));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/validate.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validate.ts test/validate.test.ts
git commit -m "feat: reliability validators enforcing mandatory sources and status labels"
```

---

## Task 4: Transform raw rows → view models

**Files:**
- Create: `src/lib/transform.ts`
- Test: `test/transform.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/transform.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toOfficial, toListRow } from '../src/lib/transform';
import type { RawOfficial, RawSource } from '../src/lib/types';

const rawSrc: RawSource = { id: 's1', url: 'https://x', type: 'court', title: 't', retrieved_at: '2026-01-01' };

const raw: RawOfficial = {
  id: 'o1', name: '王〇〇', party: '民眾黨', office_type: 'legislator', district: '中市5',
  term: '11', photo_url: null, bio: '企業主', is_incumbent: true,
  careers: [{ id: 'k1', title: '董事長', organization: 'ACME', start_date: '2010', end_date: null, source: rawSrc }],
  judgments: [{ id: 'j1', case_reason: '背信', court: '中院', case_number: '110-1', outcome: '一審有罪', is_final: false, judgment_date: '2024-03-01', judgment_url: 'https://j', source: rawSrc }],
  controversies: [{ id: 'c1', title: '爭議', summary: '摘要', status: 'indicted', event_date: '2023-01-01', report_date: '2023-02-01', controversy_sources: [{ source: rawSrc }, { source: rawSrc }] }],
  asset_declarations: [
    { id: 'a1', year: 2023, total_amount: 100, source: rawSrc },
    { id: 'a2', year: 2024, total_amount: 580000000, source: rawSrc },
  ],
};

describe('toOfficial', () => {
  it('maps snake_case to camelCase and nests sources', () => {
    const o = toOfficial(raw);
    expect(o.officeType).toBe('legislator');
    expect(o.careers[0].source.retrievedAt).toBe('2026-01-01');
    expect(o.judgments[0].isFinal).toBe(false);
    expect(o.controversies[0].sources).toHaveLength(2);
    expect(o.assets[1].totalAmount).toBe(580000000);
  });
});

describe('toListRow', () => {
  it('counts judgments/controversies and takes the latest asset total', () => {
    const row = toListRow(toOfficial(raw));
    expect(row.judgmentCount).toBe(1);
    expect(row.controversyCount).toBe(1);
    expect(row.latestAssetTotal).toBe(580000000); // year 2024 wins
  });

  it('uses null asset total when no declarations exist', () => {
    const row = toListRow(toOfficial({ ...raw, asset_declarations: [] }));
    expect(row.latestAssetTotal).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/transform.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/transform.ts`:
```ts
import type { Official, OfficialListRow, RawOfficial, RawSource, Source } from './types';

function toSource(r: RawSource): Source {
  return { id: r.id, url: r.url, type: r.type, title: r.title, retrievedAt: r.retrieved_at };
}

export function toOfficial(r: RawOfficial): Official {
  return {
    id: r.id, name: r.name, party: r.party, officeType: r.office_type, district: r.district,
    term: r.term, photoUrl: r.photo_url, bio: r.bio, isIncumbent: r.is_incumbent,
    careers: r.careers.map((c) => ({
      id: c.id, title: c.title, organization: c.organization,
      startDate: c.start_date, endDate: c.end_date, source: toSource(c.source),
    })),
    judgments: r.judgments.map((j) => ({
      id: j.id, caseReason: j.case_reason, court: j.court, caseNumber: j.case_number,
      outcome: j.outcome, isFinal: j.is_final, judgmentDate: j.judgment_date,
      judgmentUrl: j.judgment_url, source: toSource(j.source),
    })),
    controversies: r.controversies.map((c) => ({
      id: c.id, title: c.title, summary: c.summary, status: c.status,
      eventDate: c.event_date, reportDate: c.report_date,
      sources: c.controversy_sources.map((cs) => toSource(cs.source)),
    })),
    assets: r.asset_declarations.map((a) => ({
      id: a.id, year: a.year, totalAmount: a.total_amount, source: toSource(a.source),
    })),
  };
}

export function toListRow(o: Official): OfficialListRow {
  const latest = o.assets.length
    ? o.assets.reduce((max, a) => (a.year > max.year ? a : max))
    : null;
  return {
    id: o.id, name: o.name, party: o.party, officeType: o.officeType, district: o.district,
    judgmentCount: o.judgments.length,
    controversyCount: o.controversies.length,
    latestAssetTotal: latest ? latest.totalAmount : null,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/transform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/transform.ts test/transform.test.ts
git commit -m "feat: transform raw DB rows into view models and list rows"
```

---

## Task 5: Overview filter / sort / search

**Files:**
- Create: `src/lib/filterSort.ts`
- Test: `test/filterSort.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/filterSort.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { queryList } from '../src/lib/filterSort';
import type { OfficialListRow } from '../src/lib/types';

const rows: OfficialListRow[] = [
  { id: '1', name: '陳一', party: '國民黨', officeType: 'legislator', district: '北市3', judgmentCount: 2, controversyCount: 1, latestAssetTotal: 120000000 },
  { id: '2', name: '林二', party: '民進黨', officeType: 'legislator', district: '不分區', judgmentCount: 0, controversyCount: 0, latestAssetTotal: 24000000 },
  { id: '3', name: '王三', party: '民眾黨', officeType: 'mayor_magistrate', district: '台中', judgmentCount: 1, controversyCount: 3, latestAssetTotal: null },
];

describe('queryList', () => {
  it('returns all rows for an empty query', () => {
    expect(queryList(rows, {})).toHaveLength(3);
  });

  it('filters by party', () => {
    expect(queryList(rows, { party: '民進黨' }).map((r) => r.id)).toEqual(['2']);
  });

  it('filters by office type', () => {
    expect(queryList(rows, { officeType: 'mayor_magistrate' }).map((r) => r.id)).toEqual(['3']);
  });

  it('searches by name substring', () => {
    expect(queryList(rows, { search: '王' }).map((r) => r.id)).toEqual(['3']);
  });

  it('sorts by judgments descending', () => {
    expect(queryList(rows, { sort: 'judgments' }).map((r) => r.id)).toEqual(['1', '3', '2']);
  });

  it('sorts by controversies descending', () => {
    expect(queryList(rows, { sort: 'controversies' }).map((r) => r.id)).toEqual(['3', '1', '2']);
  });

  it('sorts by assets descending with nulls last', () => {
    expect(queryList(rows, { sort: 'assets' }).map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('combines filter and sort', () => {
    const r = queryList(rows, { officeType: 'legislator', sort: 'judgments' });
    expect(r.map((x) => x.id)).toEqual(['1', '2']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/filterSort.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/filterSort.ts`:
```ts
import type { OfficeType, OfficialListRow } from './types';

export type SortKey = 'judgments' | 'controversies' | 'assets' | 'name';
export interface ListQuery {
  search?: string;
  party?: string;
  officeType?: OfficeType;
  sort?: SortKey;
}

export function queryList(rows: OfficialListRow[], q: ListQuery): OfficialListRow[] {
  let out = rows.slice();

  if (q.party) out = out.filter((r) => r.party === q.party);
  if (q.officeType) out = out.filter((r) => r.officeType === q.officeType);
  if (q.search?.trim()) {
    const needle = q.search.trim();
    out = out.filter((r) => r.name.includes(needle));
  }

  switch (q.sort) {
    case 'judgments':
      out.sort((a, b) => b.judgmentCount - a.judgmentCount);
      break;
    case 'controversies':
      out.sort((a, b) => b.controversyCount - a.controversyCount);
      break;
    case 'assets':
      out.sort((a, b) => assetRank(b.latestAssetTotal) - assetRank(a.latestAssetTotal));
      break;
    case 'name':
      out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
      break;
  }
  return out;
}

// nulls sort last in a descending sort
function assetRank(v: number | null): number {
  return v === null ? -Infinity : v;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/filterSort.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/filterSort.ts test/filterSort.test.ts
git commit -m "feat: overview list filter, sort, and search"
```

---

## Task 6: Database schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_init.sql`:
```sql
-- Enums
create type office_type as enum ('legislator', 'mayor_magistrate', 'councilor');
create type controversy_status as enum ('investigating', 'indicted', 'first_instance', 'settled', 'cleared', 'other');
create type source_type as enum ('court', 'news', 'gov', 'gazette', 'factcheck');

-- Sources: every fact references one of these
create table sources (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  type source_type not null,
  title text not null,
  retrieved_at date not null
);

create table officials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  party text not null,
  office_type office_type not null,
  district text not null,
  term text not null,
  photo_url text,
  bio text not null default '',
  is_incumbent boolean not null default true
);

create table careers (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  title text not null,
  organization text not null,
  start_date text not null,
  end_date text,
  source_id uuid not null references sources(id)   -- mandatory source
);

create table judgments (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  case_reason text not null,
  court text not null,
  case_number text not null,
  outcome text not null,
  is_final boolean not null,
  judgment_date text not null,
  judgment_url text not null,
  source_id uuid not null references sources(id)   -- mandatory source
);

create table controversies (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  title text not null,
  summary text not null,
  status controversy_status not null,
  event_date text not null,
  report_date text not null
);

-- Controversies have many sources; the build-time validator enforces "at least one".
create table controversy_sources (
  controversy_id uuid not null references controversies(id) on delete cascade,
  source_id uuid not null references sources(id),
  primary key (controversy_id, source_id)
);

create table asset_declarations (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  year int not null,
  total_amount bigint not null,
  source_id uuid not null references sources(id)   -- mandatory source
);

-- RLS: public read-only; writes only via service role (which bypasses RLS).
alter table sources enable row level security;
alter table officials enable row level security;
alter table careers enable row level security;
alter table judgments enable row level security;
alter table controversies enable row level security;
alter table controversy_sources enable row level security;
alter table asset_declarations enable row level security;

create policy "public read" on sources for select using (true);
create policy "public read" on officials for select using (true);
create policy "public read" on careers for select using (true);
create policy "public read" on judgments for select using (true);
create policy "public read" on controversies for select using (true);
create policy "public read" on controversy_sources for select using (true);
create policy "public read" on asset_declarations for select using (true);
```

- [ ] **Step 2: Apply and verify**

Apply via the Supabase MCP `apply_migration` tool (name `0001_init`, the SQL above) against the project, **or** locally:
```bash
supabase db reset   # if using local Supabase CLI
```
Then verify with the MCP `list_tables` tool (or `\dt` locally): expected tables `sources, officials, careers, judgments, controversies, controversy_sources, asset_declarations`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: initial schema with mandatory source FKs and public-read RLS"
```

---

## Task 7: Seed data (curated prototype sample)

**Files:**
- Create: `supabase/seed.sql`

> Uses placeholder names (〇〇) and example sources. During real curation these rows are replaced with verified people and real source URLs. The seed exists so the build pipeline and pages have data to render.

- [ ] **Step 1: Write the seed**

`supabase/seed.sql`:
```sql
-- Sources
insert into sources (id, url, type, title, retrieved_at) values
  ('00000000-0000-0000-0000-0000000000s1', 'https://judgment.judicial.gov.tw/', 'court', '司法院裁判書（範例）', '2026-06-01'),
  ('00000000-0000-0000-0000-0000000000s2', 'https://www.ly.gov.tw/', 'gov', '立法院委員資料（範例）', '2026-06-01'),
  ('00000000-0000-0000-0000-0000000000s3', 'https://example.com/news', 'news', '新聞報導（範例）', '2026-06-01');

-- Officials
insert into officials (id, name, party, office_type, district, term, bio) values
  ('00000000-0000-0000-0000-0000000000a1', '陳〇〇', '國民黨', 'legislator', '台北市第3選區', '11', '律師、台北市議員兩屆'),
  ('00000000-0000-0000-0000-0000000000a2', '林〇〇', '民進黨', 'legislator', '不分區', '11', 'NGO 秘書長、社會學者'),
  ('00000000-0000-0000-0000-0000000000a3', '王〇〇', '民眾黨', 'legislator', '台中市第5選區', '11', '企業負責人');

-- Careers
insert into careers (official_id, title, organization, start_date, end_date, source_id) values
  ('00000000-0000-0000-0000-0000000000a1', '市議員', '台北市議會', '2014', '2022', '00000000-0000-0000-0000-0000000000s2');

-- Judgments
insert into judgments (official_id, case_reason, court, case_number, outcome, is_final, judgment_date, judgment_url, source_id) values
  ('00000000-0000-0000-0000-0000000000a1', '妨害名譽', '臺灣臺北地方法院', '111年度易字第1號', '一審判決無罪', false, '2024-05-01', 'https://judgment.judicial.gov.tw/', '00000000-0000-0000-0000-0000000000s1'),
  ('00000000-0000-0000-0000-0000000000a3', '背信', '臺灣臺中地方法院', '110年度訴字第2號', '一審有罪、上訴中', false, '2024-03-01', 'https://judgment.judicial.gov.tw/', '00000000-0000-0000-0000-0000000000s1');

-- Controversies
with c as (
  insert into controversies (id, official_id, title, summary, status, event_date, report_date)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', '工程招標爭議', '遭質疑特定廠商綁標，當事人否認。', 'investigating', '2023-08-01', '2023-09-15')
  returning id
)
insert into controversy_sources (controversy_id, source_id)
select id, '00000000-0000-0000-0000-0000000000s3' from c;

-- Asset declarations
insert into asset_declarations (official_id, year, total_amount, source_id) values
  ('00000000-0000-0000-0000-0000000000a1', 2024, 120000000, '00000000-0000-0000-0000-0000000000s2'),
  ('00000000-0000-0000-0000-0000000000a2', 2024, 24000000, '00000000-0000-0000-0000-0000000000s2');
```

- [ ] **Step 2: Apply and verify**

Apply the seed (MCP `execute_sql` with the file contents, or `supabase db reset` which runs `seed.sql` automatically).
Verify with MCP `execute_sql`: `select count(*) from officials;` → expected `3`.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: curated prototype seed data with placeholder names"
```

---

## Task 8: Build-time data loader with validation gate

**Files:**
- Create: `src/lib/data.ts`
- Test: `test/data.test.ts`

- [ ] **Step 1: Write the failing test (validation gate, with a fake fetcher)**

`test/data.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { assembleOfficials } from '../src/lib/data';
import type { RawOfficial, RawSource } from '../src/lib/types';

const rawSrc: RawSource = { id: 's1', url: 'https://x', type: 'court', title: 't', retrieved_at: '2026-01-01' };

function rawOfficial(over: Partial<RawOfficial> = {}): RawOfficial {
  return {
    id: 'o1', name: '測試', party: '無', office_type: 'legislator', district: 'd', term: '11',
    photo_url: null, bio: '', is_incumbent: true,
    careers: [], judgments: [], controversies: [], asset_declarations: [], ...over,
  };
}

describe('assembleOfficials', () => {
  it('returns transformed officials when data is valid', () => {
    const result = assembleOfficials([rawOfficial()]);
    expect(result).toHaveLength(1);
    expect(result[0].officeType).toBe('legislator');
  });

  it('throws when a fact row is missing its source', () => {
    const bad = rawOfficial({
      judgments: [{ id: 'j1', case_reason: 'x', court: 'c', case_number: 'n', outcome: 'o', is_final: true, judgment_date: 'd', judgment_url: 'u', source: undefined as unknown as RawSource }],
    });
    expect(() => assembleOfficials([bad])).toThrow(/missing source/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/data.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/data.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import type { Official, RawOfficial } from './types';
import { toOfficial } from './transform';
import { validateAll } from './validate';

const SELECT = `
  id, name, party, office_type, district, term, photo_url, bio, is_incumbent,
  careers ( id, title, organization, start_date, end_date, source:sources(*) ),
  judgments ( id, case_reason, court, case_number, outcome, is_final, judgment_date, judgment_url, source:sources(*) ),
  controversies ( id, title, summary, status, event_date, report_date, controversy_sources ( source:sources(*) ) ),
  asset_declarations ( id, year, total_amount, source:sources(*) )
`;

// Pure assembly + validation gate — unit tested without a network call.
export function assembleOfficials(raw: RawOfficial[]): Official[] {
  const officials = raw.map(toOfficial);
  const errors = validateAll(officials);
  if (errors.length > 0) {
    throw new Error(`Data validation failed (build aborted):\n- ${errors.join('\n- ')}`);
  }
  return officials;
}

// Build-time fetch. Uses the service-role key (server-only, never shipped to the client).
export async function loadOfficials(): Promise<Official[]> {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key);
  const { data, error } = await supabase.from('officials').select(SELECT);
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return assembleOfficials((data ?? []) as unknown as RawOfficial[]);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data.ts test/data.test.ts
git commit -m "feat: build-time data loader with validation gate"
```

---

## Task 9: Design tokens + base layout (light/dark)

**Files:**
- Create: `src/styles/tokens.css`, `src/layouts/Base.astro`

- [ ] **Step 1: Write the tokens**

`src/styles/tokens.css`:
```css
:root {
  --bg: #faf9f6;
  --fg: #1b1a17;
  --muted: #5a5a5a;
  --line: rgba(120, 120, 120, 0.18);
  --accent: #b3271e;
  --serif: "Noto Serif TC", Georgia, "Songti TC", serif;
  --sans: system-ui, "PingFang TC", "Microsoft JhengHei", sans-serif;
  --maxw: 920px;
}
:root[data-theme="dark"] {
  --bg: #141414;
  --fg: #ece9e2;
  --muted: #9a978f;
  --line: rgba(180, 180, 180, 0.16);
  --accent: #e4574c;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--sans); }
.wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 20px; }
h1, h2, h3 { font-family: var(--serif); }
a { color: inherit; }
.num { font-variant-numeric: tabular-nums; }
.accent { color: var(--accent); }
.dim { opacity: 0.4; }
```

- [ ] **Step 2: Write the base layout (with no-flash dark-mode toggle)**

`src/layouts/Base.astro`:
```astro
---
import "../styles/tokens.css";
const { title = "公職人員背景資料庫" } = Astro.props;
---
<!DOCTYPE html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;800&display=swap" rel="stylesheet" />
    <script is:inline>
      const t = localStorage.getItem("theme");
      if (t) document.documentElement.dataset.theme = t;
    </script>
  </head>
  <body>
    <header class="wrap" style="display:flex;justify-content:space-between;align-items:center;padding-top:20px;padding-bottom:14px;border-bottom:2px solid var(--fg)">
      <a href="/" style="text-decoration:none">
        <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)">Public Office Watch</div>
        <div style="font-family:var(--serif);font-size:22px;font-weight:800">公職人員背景</div>
      </a>
      <nav style="display:flex;gap:16px;align-items:center;font-size:14px">
        <a href="/about">關於</a>
        <button id="theme-toggle" style="background:none;border:1px solid var(--line);border-radius:6px;padding:4px 10px;color:inherit;cursor:pointer">切換深淺</button>
      </nav>
    </header>
    <main class="wrap" style="padding-top:24px;padding-bottom:64px">
      <slot />
    </main>
    <footer class="wrap" style="border-top:1px solid var(--line);padding:24px 20px;font-size:12px;color:var(--muted)">
      本站僅呈現合法公開資料並標註出處，不對個人作價值判斷。判決資訊不代表最終定罪，當事人受無罪推定保障。更正請來信。
    </footer>
    <script is:inline>
      document.getElementById("theme-toggle").addEventListener("click", () => {
        const cur = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = cur;
        localStorage.setItem("theme", cur);
      });
    </script>
  </body>
</html>
```

- [ ] **Step 3: Verify build compiles**

Run: `npx astro check` (expect no Astro errors for this file; type warnings about props are acceptable at this stage).

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.css src/layouts/Base.astro
git commit -m "feat: design tokens and base layout with dark-mode toggle"
```

---

## Task 10: Overview page + Svelte filter/sort island

**Files:**
- Create: `src/components/OfficialTable.svelte`, `src/pages/index.astro`

- [ ] **Step 1: Write the Svelte island**

`src/components/OfficialTable.svelte`:
```svelte
<script lang="ts">
  import type { OfficialListRow } from '../lib/types';
  import { queryList, type ListQuery, type SortKey } from '../lib/filterSort';

  export let rows: OfficialListRow[] = [];

  let search = '';
  let party = '';
  let officeType = '';
  let sort: SortKey = 'judgments';

  const partyLabel: Record<string, string> = {};
  $: parties = Array.from(new Set(rows.map((r) => r.party)));
  $: q = { search, party: party || undefined, officeType: (officeType || undefined) as ListQuery['officeType'], sort } as ListQuery;
  $: view = queryList(rows, q);

  const fmt = (n: number | null) => (n === null ? '—' : new Intl.NumberFormat('zh-Hant').format(n));
  const officeName: Record<string, string> = { legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員' };
</script>

<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;font-size:13px">
  <input placeholder="搜尋姓名" bind:value={search}
    style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit" />
  <select bind:value={party} style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit">
    <option value="">全部政黨</option>
    {#each parties as p}<option value={p}>{p}</option>{/each}
  </select>
  <select bind:value={officeType} style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit">
    <option value="">全部職位</option>
    <option value="legislator">立委</option>
    <option value="mayor_magistrate">縣市首長</option>
  </select>
  <select bind:value={sort} style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit">
    <option value="judgments">判決最多</option>
    <option value="controversies">爭議最多</option>
    <option value="assets">財產最高</option>
    <option value="name">姓名</option>
  </select>
  <span style="margin-left:auto;color:var(--muted)">{view.length} 筆</span>
</div>

{#each view as r}
  <a href={`/officials/${r.id}`} style="display:grid;grid-template-columns:1fr auto auto auto;gap:14px;align-items:baseline;padding:14px 4px;border-bottom:1px solid var(--line);text-decoration:none">
    <div>
      <div style="font-family:var(--serif);font-size:18px;font-weight:700">{r.name}
        <span style="font-size:12px;color:var(--muted);font-family:var(--sans);margin-left:8px">{r.party}・{r.district}</span>
      </div>
      <div style="font-size:12px;color:var(--muted)">{officeName[r.officeType]}</div>
    </div>
    <div style="text-align:right;min-width:52px">
      <div class="num" style="font-size:19px;font-weight:800" class:accent={r.judgmentCount > 0} class:dim={r.judgmentCount === 0}>{r.judgmentCount}</div>
      <div style="font-size:10px;color:var(--muted)">判決</div>
    </div>
    <div style="text-align:right;min-width:52px">
      <div class="num" style="font-size:19px;font-weight:800" class:accent={r.controversyCount > 0} class:dim={r.controversyCount === 0}>{r.controversyCount}</div>
      <div style="font-size:10px;color:var(--muted)">爭議</div>
    </div>
    <div style="text-align:right;min-width:90px">
      <div class="num" style="font-size:15px;font-weight:700">{fmt(r.latestAssetTotal)}</div>
      <div style="font-size:10px;color:var(--muted)">申報財產</div>
    </div>
  </a>
{/each}
```

- [ ] **Step 2: Write the overview page**

`src/pages/index.astro`:
```astro
---
import Base from "../layouts/Base.astro";
import OfficialTable from "../components/OfficialTable.svelte";
import { loadOfficials } from "../lib/data";
import { toListRow } from "../lib/transform";

const officials = await loadOfficials();
const rows = officials.map(toListRow);
---
<Base title="公職人員背景資料庫">
  <p style="color:var(--muted);font-size:14px;margin:0 0 18px">
    經歷・司法判決・爭議事件・財產申報　·　每筆皆附出處
  </p>
  <OfficialTable client:load rows={rows} />
</Base>
```

- [ ] **Step 3: Verify it renders**

Ensure `.env` has valid Supabase creds, then:
```bash
npm run build
```
Expected: build succeeds; `dist/index.html` exists and contains the three seeded names. If validation fails, the build aborts with the offending rows listed (that is the gate working).

- [ ] **Step 4: Commit**

```bash
git add src/components/OfficialTable.svelte src/pages/index.astro
git commit -m "feat: overview page with Svelte filter/sort island"
```

---

## Task 11: Profile page

**Files:**
- Create: `src/components/Sources.astro`, `src/pages/officials/[id].astro`

- [ ] **Step 1: Write the reusable sources component**

`src/components/Sources.astro`:
```astro
---
import type { Source } from "../lib/types";
const { sources } = Astro.props as { sources: Source[] };
---
<div style="font-size:12px;color:var(--muted);margin-top:4px">
  出處：
  {sources.map((s, i) => (
    <a href={s.url} target="_blank" rel="noopener">{s.title}{i < sources.length - 1 ? "、" : ""}</a>
  ))}
</div>
```

- [ ] **Step 2: Write the profile page**

`src/pages/officials/[id].astro`:
```astro
---
import Base from "../../layouts/Base.astro";
import Sources from "../../components/Sources.astro";
import { loadOfficials } from "../../lib/data";

export async function getStaticPaths() {
  const officials = await loadOfficials();
  return officials.map((o) => ({ params: { id: o.id }, props: { official: o } }));
}

const { official: o } = Astro.props;
const statusLabel = {
  investigating: "偵查中", indicted: "已起訴", first_instance: "一審",
  settled: "已和解", cleared: "查無不法", other: "其他",
};
const fmt = (n: number) => new Intl.NumberFormat("zh-Hant").format(n);
---
<Base title={`${o.name}｜公職人員背景`}>
  <h1 style="margin:0 0 2px">{o.name}</h1>
  <p style="color:var(--muted);margin:0 0 24px">{o.party}・{o.district}・第{o.term}屆　{o.bio}</p>

  <h2 style="font-size:18px;border-bottom:1px solid var(--line);padding-bottom:6px">經歷</h2>
  {o.careers.length === 0 && <p class="dim">尚無資料</p>}
  {o.careers.map((c) => (
    <div style="margin:10px 0">
      <strong>{c.startDate}–{c.endDate ?? "現任"}</strong>　{c.organization}　{c.title}
      <Sources sources={[c.source]} />
    </div>
  ))}

  <h2 style="font-size:18px;border-bottom:1px solid var(--line);padding-bottom:6px;margin-top:32px">司法判決</h2>
  <p style="font-size:12px;color:var(--muted)">判決結果不代表最終定罪；未定讞案件當事人受無罪推定保障。</p>
  {o.judgments.length === 0 && <p class="dim">尚無資料</p>}
  {o.judgments.map((j) => (
    <div style="margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:8px">
      <div style="font-weight:700">{j.caseReason}　<span class="accent">{j.outcome}</span></div>
      <div style="font-size:13px;color:var(--muted)">{j.court}　{j.caseNumber}　{j.judgmentDate}　{j.isFinal ? "已定讞" : "尚未定讞"}</div>
      <Sources sources={[j.source]} />
    </div>
  ))}

  <h2 style="font-size:18px;border-bottom:1px solid var(--line);padding-bottom:6px;margin-top:32px">爭議事件</h2>
  {o.controversies.length === 0 && <p class="dim">尚無資料</p>}
  {o.controversies.map((c) => (
    <div style="margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:8px">
      <div style="font-weight:700">{c.title}　<span style="font-size:12px;border:1px solid var(--line);border-radius:99px;padding:1px 8px">{statusLabel[c.status]}</span></div>
      <div style="font-size:13px;margin:4px 0">{c.summary}</div>
      <div style="font-size:12px;color:var(--muted)">報導日期：{c.reportDate}</div>
      <Sources sources={c.sources} />
    </div>
  ))}

  <h2 style="font-size:18px;border-bottom:1px solid var(--line);padding-bottom:6px;margin-top:32px">財產申報</h2>
  {o.assets.length === 0 && <p class="dim">尚無資料</p>}
  {o.assets.map((a) => (
    <div style="margin:10px 0">
      <strong>{a.year}</strong>　NT$ <span class="num">{fmt(a.totalAmount)}</span>
      <Sources sources={[a.source]} />
    </div>
  ))}
</Base>
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: `dist/officials/<uuid>/index.html` generated for each seeded official; profile shows judgment outcome + 是否定讞, controversy status + 報導日期, and source links.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sources.astro src/pages/officials/[id].astro
git commit -m "feat: per-person profile page with mandatory source display"
```

---

## Task 12: About page

**Files:**
- Create: `src/pages/about.astro`

- [ ] **Step 1: Write the page**

`src/pages/about.astro`:
```astro
---
import Base from "../layouts/Base.astro";
---
<Base title="關於｜公職人員背景資料庫">
  <h1>關於本站</h1>
  <h2 style="font-size:18px">資料來源</h2>
  <ul style="line-height:1.9">
    <li>司法判決：司法院裁判書查詢系統（公開判決）</li>
    <li>經歷／背景：立法院官方資料、中選會候選人學經歷申報</li>
    <li>爭議事件：新聞報導與事實查核，標註報導日期與目前狀態</li>
    <li>財產申報：監察院公職人員財產申報公報</li>
  </ul>

  <h2 style="font-size:18px">方法論與原則</h2>
  <ul style="line-height:1.9">
    <li>每一筆事實資料都附可點擊的出處，無出處者不上架。</li>
    <li>「司法判決」與「媒體爭議」分開呈現，各自標示狀態。</li>
    <li>本站不使用「前科」概念；個人刑事紀錄屬受個資法保護資料，本站僅引用公開判決。</li>
    <li>本站僅陳述事實與出處，不對個人作價值判斷或評分。</li>
  </ul>

  <h2 style="font-size:18px">無罪推定</h2>
  <p>判決結果不代表最終定罪。未定讞之案件，當事人依法受無罪推定保障，請讀者審慎判讀。</p>

  <h2 style="font-size:18px">更正與申訴</h2>
  <p>若發現資料有誤或需更新狀態，請來信告知，我們會查核後更正。</p>
</Base>
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: `dist/about/index.html` exists.

- [ ] **Step 3: Commit**

```bash
git add src/pages/about.astro
git commit -m "feat: about page with sources, methodology, and presumption-of-innocence"
```

---

## Task 13: Full test + build verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass (`smoke`, `validate`, `transform`, `filterSort`, `data`).

- [ ] **Step 2: Run a clean build**

Run: `npm run build`
Expected: success; `dist/` contains `index.html`, `about/index.html`, and one `officials/<id>/index.html` per seeded official.

- [ ] **Step 3: Spot-check the validation gate**

Temporarily remove a source from one seed row (e.g. set a judgment's `source_id` to a non-existent flow by deleting its source link in a scratch DB), rebuild, and confirm `npm run build` aborts with a `Data validation failed` message naming the official. Restore afterward. (Confirms the credibility gate fails the build, not ships silently.)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "test: full suite and build verification green"
```

---

## Self-Review notes

- **Spec coverage:** data model → Task 6; reliability mechanisms (mandatory source, judgment outcome+定讞, controversy status+date, presumption of innocence, corrections) → Tasks 3, 6, 8, 11, 12; Astro SSG + Svelte island + no runtime DB → Tasks 9–11; RLS public-read → Task 6; overview list filter/sort/search → Tasks 5, 10; profile sections → Task 11; about page → Task 12; visual (serif+sans, single accent, dark mode, no color blocks) → Tasks 9–11; tests → Tasks 3,4,5,8,13. Phase-2 scraper and councilors intentionally excluded.
- **Placeholders:** none — every code step contains full code; seed uses explicit placeholder names by design.
- **Type consistency:** `Official`/`OfficialListRow`/`Source` shapes defined in Task 2 are used unchanged in Tasks 3–11; `queryList`/`ListQuery`/`SortKey` defined in Task 5 used in Task 10; `assembleOfficials`/`loadOfficials` defined in Task 8 used in Tasks 10–11.
