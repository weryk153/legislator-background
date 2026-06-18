# 維基百科爭議 adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the (currently empty) 媒體爭議 category by extracting candidate controversies from zh.wikipedia for each official, surfaced for human review with objective source links — never auto-published.

**Architecture:** A new pure-parser-plus-fetch `scraper/lib/wiki.ts` reads a person's zh.wikipedia article via the MediaWiki API, keeps 爭議/案/事件 sections, and emits `CandidateControversy` records (summary + Wikipedia URL + the section's `<ref>` source links). A new `wikiAdapter` plugs into the existing scraper run; the pipeline (types/review/toOfficial/import/run) is extended to carry controversies the same way it carries judgments — always `approved:false`/`needs_review`, gated by the shared validator. Reuses the existing `controversies` + `controversy_sources` tables (no schema change).

**Tech Stack:** TypeScript, tsx, MediaWiki API (zh.wikipedia.org), Vitest, Supabase. Reuses existing scraper pipeline + `src/lib/validate.ts`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `scraper/lib/types.ts` | add `CandidateControversy`; `AdapterResult.controversies?` |
| `scraper/lib/wiki.ts` | pure: `pickControversySections`, `wikitextToSummary`, `extractRefUrls`, `isLikelyPerson`; integration: `fetchWikiControversies` + `wikiAdapter` |
| `scraper/fixtures/wiki-sample.json` | real MediaWiki API responses (sections + one section's parse) for tests |
| `scraper/test/wiki.test.ts` | unit tests for the pure parsers |
| `scraper/lib/review.ts` | carry controversies (approved:false / needs_review) |
| `scraper/lib/toOfficial.ts` | map `CandidateControversy` → `Official.controversies` |
| `scraper/lib/insert.ts` | controversy natural key + plan inclusion |
| `scraper/lib/keys.ts` | `controversyKey(targetId, c)` |
| `scraper/import.ts` | write controversies + controversy_sources (idempotent) |
| `scraper/run.ts` | register `wikiAdapter` |

Pure parsers (`wiki.ts` parsing fns, keys, plan) are TDD'd; fetch/run are verified by dry-run.

> ENV: prefix node/npx with `PATH="/opt/homebrew/opt/node@26/bin:$PATH"`. pnpm is the package manager. Local Supabase (OrbStack) API 54421, container `supabase_db_legislator-background`.

---

## Task 1: CandidateControversy type

**Files:** Modify `scraper/lib/types.ts`

- [ ] **Step 1: Add the type + AdapterResult field**

In `scraper/lib/types.ts`, add the `ControversyStatus` import-free literal and the candidate type (place near `CandidateJudgment`):
```ts
export type ControversyStatus =
  | 'investigating' | 'indicted' | 'first_instance' | 'settled' | 'cleared' | 'other';
export interface CandidateControversy {
  title: string;
  summary: string;
  status: ControversyStatus;
  eventDate: string;
  reportDate: string;
  sources: EvidenceSource[];
}
```
In `AdapterResult`, add:
```ts
  controversies?: CandidateControversy[];
```

- [ ] **Step 2: Typecheck**

Run: `PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scraper/lib/types.ts
git commit -m "feat(scraper): CandidateControversy type + AdapterResult.controversies"
```

---

## Task 2: Wiki pure parsers (TDD)

**Files:** Create `scraper/lib/wiki.ts`, `scraper/fixtures/wiki-sample.json`, `scraper/test/wiki.test.ts`

- [ ] **Step 1: Capture real fixtures**

Fetch real MediaWiki API responses and save them combined into `scraper/fixtures/wiki-sample.json`:
```bash
P="/opt/homebrew/opt/node@26/bin"
PATH="$P:$PATH" node -e '
const enc = encodeURIComponent("高虹安");
const base = "https://zh.wikipedia.org/w/api.php";
(async () => {
  const sec = await (await fetch(`${base}?action=parse&page=${enc}&prop=sections&format=json`, {headers:{"user-agent":"legislator-bg/1.0"}})).json();
  // find a controversy-ish section index
  const hit = sec.parse.sections.find(s => /詐領立委助理費|爭議|案/.test(s.line));
  const one = await (await fetch(`${base}?action=parse&page=${enc}&section=${hit.index}&prop=wikitext|text&format=json`, {headers:{"user-agent":"legislator-bg/1.0"}})).json();
  const lead = await (await fetch(`${base}?action=parse&page=${enc}&section=0&prop=wikitext&format=json`, {headers:{"user-agent":"legislator-bg/1.0"}})).json();
  require("fs").writeFileSync("scraper/fixtures/wiki-sample.json", JSON.stringify({ sections: sec.parse.sections, section: one.parse, lead: lead.parse.wikitext["*"], hitIndex: hit.index, hitLine: hit.line }, null, 2));
  console.log("saved; hit section:", hit.line, "index", hit.index);
})();
'
```
Confirm `scraper/fixtures/wiki-sample.json` exists and `hitLine` is a controversy section (e.g. 詐領立委助理費案). Note `hitLine` in your report.

- [ ] **Step 2: Write the failing tests**

`scraper/test/wiki.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pickControversySections, wikitextToSummary, extractRefUrls, isLikelyPerson } from '../lib/wiki';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'wiki-sample.json'), 'utf8'));

describe('pickControversySections', () => {
  it('selects 爭議/案/事件 sections by heading', () => {
    const picked = pickControversySections(fx.sections);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.some((s: any) => /爭議|案|事件|風波|訴訟|醜聞/.test(s.line))).toBe(true);
  });
});

describe('wikitextToSummary', () => {
  it('strips wiki markup and truncates', () => {
    const wt = fx.section.wikitext['*'];
    const s = wikitextToSummary(wt, 300);
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(300);
    expect(s).not.toMatch(/\[\[|\{\{|<ref/); // no raw markup/ref tags
  });
});

describe('extractRefUrls', () => {
  it('pulls external citation URLs from section wikitext', () => {
    const urls = extractRefUrls(fx.section.wikitext['*']);
    expect(Array.isArray(urls)).toBe(true);
    for (const u of urls) expect(u).toMatch(/^https?:\/\//);
  });
});

describe('isLikelyPerson', () => {
  it('accepts a lead mentioning the office/party keywords', () => {
    expect(isLikelyPerson(fx.lead, ['立法委員', '民眾黨', '新竹'])).toBe(true);
  });
  it('rejects a lead with no matching keyword', () => {
    expect(isLikelyPerson('這是一條與政治無關的條目。', ['立法委員', '民眾黨'])).toBe(false);
  });
});
```

- [ ] **Step 2b: Run to verify failure**

Run: `PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm exec vitest run scraper/test/wiki.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure parsers**

`scraper/lib/wiki.ts` (pure portion):
```ts
import type { CandidateControversy, EvidenceSource, SourceType } from './types';

const SECTION_RE = /爭議|爭論|事件|風波|訴訟|醜聞|弊|案$|案件/;

export interface WikiSection { index: string; line: string; }

export function pickControversySections(sections: WikiSection[]): WikiSection[] {
  return (sections ?? []).filter((s) => s.line && SECTION_RE.test(s.line));
}

// Strip common wikitext markup to a plain-text summary, truncated to `max` chars.
export function wikitextToSummary(wikitext: string, max = 300): string {
  let t = wikitext ?? '';
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');   // <ref>...</ref>
  t = t.replace(/<ref[^>]*\/>/g, '');                  // self-closing <ref/>
  t = t.replace(/\{\{[\s\S]*?\}\}/g, '');              // {{templates}}
  t = t.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1'); // [[link|text]] -> text
  t = t.replace(/'''?/g, '');                          // bold/italic
  t = t.replace(/^[=*#:;]+/gm, '');                    // headings/list markers
  t = t.replace(/<[^>]+>/g, '');                       // stray html
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).trim() + '…' : t;
}

function sourceTypeFor(url: string): SourceType {
  if (/judicial\.gov\.tw/.test(url)) return 'court';
  if (/\.gov\.tw/.test(url)) return 'gov';
  if (/tfc-taiwan|factcheck/.test(url)) return 'factcheck';
  return 'news';
}

export function extractRefUrls(wikitext: string): string[] {
  const urls = new Set<string>();
  const re = /https?:\/\/[^\s\]|}<]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext ?? '')) !== null) {
    if (!/wikipedia\.org|wikimedia\.org/.test(m[0])) urls.add(m[0].replace(/[.,)]+$/, ''));
  }
  return [...urls];
}

// Confirm the article is the intended person (avoid same-name / unrelated articles).
export function isLikelyPerson(lead: string, keywords: string[]): boolean {
  const text = lead ?? '';
  return keywords.some((k) => k && text.includes(k));
}

export function buildSources(pageUrl: string, refUrls: string[], retrievedAt: string): EvidenceSource[] {
  const wiki: EvidenceSource = { url: pageUrl, title: '維基百科', type: 'news', retrievedAt };
  const refs: EvidenceSource[] = refUrls.map((u) => ({ url: u, title: '報導/原始出處', type: sourceTypeFor(u), retrievedAt }));
  return [wiki, ...refs];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm exec vitest run scraper/test/wiki.test.ts`
Expected: PASS. If the real fixture markup differs (e.g. summary still shows a artifact), tighten `wikitextToSummary` until the test's no-markup assertion holds. Also run `PATH=... pnpm exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/wiki.ts scraper/fixtures/wiki-sample.json scraper/test/wiki.test.ts
git commit -m "feat(scraper): wiki pure parsers (sections, summary, refs, person check)"
```

---

## Task 3: Wiki adapter (fetch)

**Files:** Modify `scraper/lib/wiki.ts`

- [ ] **Step 1: Add the fetcher + adapter**

Append to `scraper/lib/wiki.ts`:
```ts
import { fetchPolite } from './fetchPolite';
import type { AdapterResult, SourceAdapter, Target } from './types';

const API = 'https://zh.wikipedia.org/w/api.php';
const pageUrl = (name: string) => `https://zh.wikipedia.org/wiki/${encodeURIComponent(name)}`;

async function apiJson(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ...params, format: 'json' }).toString();
  const res = await fetchPolite(`${API}?${qs}`);
  return res.json();
}

export async function fetchWikiControversies(target: Target): Promise<CandidateControversy[]> {
  const retrievedAt = new Date().toISOString().slice(0, 10);
  const secResp = await apiJson({ action: 'parse', page: target.name, prop: 'sections' });
  if (secResp.error) return []; // no such article
  const sections: WikiSection[] = secResp.parse?.sections ?? [];

  // disambiguation: fetch lead, confirm this article is the person
  const leadResp = await apiJson({ action: 'parse', page: target.name, prop: 'wikitext', section: '0' });
  const lead = leadResp.parse?.wikitext?.['*'] ?? '';
  const keywords = [target.party, target.district, '立法委員', '議員', '市長', '縣長'].filter(Boolean);
  if (!isLikelyPerson(lead, keywords)) return [];

  const picked = pickControversySections(sections);
  const out: CandidateControversy[] = [];
  for (const s of picked) {
    const r = await apiJson({ action: 'parse', page: target.name, prop: 'wikitext', section: s.index });
    const wt = r.parse?.wikitext?.['*'] ?? '';
    const summary = wikitextToSummary(wt, 300);
    if (!summary) continue;
    out.push({
      title: s.line,
      summary,
      status: 'other',
      eventDate: '',
      reportDate: '',
      sources: buildSources(pageUrl(target.name), extractRefUrls(wt), retrievedAt),
    });
  }
  return out;
}

export const wikiAdapter: SourceAdapter = {
  name: 'wiki',
  async fetchFor(target: Target): Promise<AdapterResult> {
    try {
      const controversies = await fetchWikiControversies(target);
      return { source: 'wiki', ok: true, controversies };
    } catch (err) {
      return { source: 'wiki', ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
```

- [ ] **Step 2: Typecheck + live smoke (one person)**

Run: `PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm exec tsc --noEmit` (clean).
Smoke-test the fetch against live Wikipedia:
```bash
PATH="/opt/homebrew/opt/node@26/bin:$PATH" node --import tsx -e '
import("./scraper/lib/wiki.ts").then(async (m) => {
  const c = await m.fetchWikiControversies({ id:"x", name:"高虹安", party:"民眾黨", district:"新竹市", office:"mayor_magistrate", keywords:[], aliases:[] });
  console.log("controversies:", c.length);
  for (const x of c) console.log(" -", x.title, "| sources:", x.sources.length, "| summary:", x.summary.slice(0,50));
});
'
```
Expected: prints several controversies (e.g. 詐領立委助理費案) each with ≥1 source. If 0, check the disambiguation keywords / section regex against the live article and adjust.

- [ ] **Step 3: Commit**

```bash
git add scraper/lib/wiki.ts
git commit -m "feat(scraper): wiki adapter fetching candidate controversies"
```

---

## Task 4: Carry controversies through review + keys + plan

**Files:** Modify `scraper/lib/review.ts`, `scraper/lib/keys.ts`, `scraper/lib/toOfficial.ts`, `scraper/lib/insert.ts`, and test literals in `scraper/test/review.test.ts`, `scraper/test/insert.test.ts`

- [ ] **Step 1: review.ts — controversies need human approval**

In `scraper/lib/review.ts`, add to the `ReviewFile` assembly. The `ReviewFile` type (in types.ts) already has a `controversies` array typed `Array<ReviewItem<...> & {status:'needs_review'}>` for judgments-style review — confirm a controversies array exists on `ReviewFile`; if not, add to `scraper/lib/types.ts` `ReviewFile`:
```ts
  wikiControversies: Array<ReviewItem<CandidateControversy> & { status: 'needs_review' }>;
```
Then in `buildReviewFile`:
```ts
  const wikiControversies = results.flatMap((r) => r.controversies ?? []).map((data) => ({
    approved: false, status: 'needs_review' as const, data,
  }));
```
add `wikiControversies` to the returned object, and to the `report` counts add `controversies: r.controversies?.length ?? 0`.
In `ApprovedBundle` add `controversies: Array<{ targetId: string; data: CandidateControversy }>` and in `collectApproved` collect approved `wikiControversies` into it.

- [ ] **Step 2: keys.ts — controversy natural key**

Add to `scraper/lib/keys.ts`:
```ts
export function controversyKey(targetId: string, c: { title: string }): string {
  return `${targetId}|${c.title}`;
}
```

- [ ] **Step 3: toOfficial.ts — map controversies**

In `scraper/lib/toOfficial.ts`, change `ApprovedForTarget` to include `controversies: CandidateControversy[]` and map them into the Official (replacing the empty `controversies: []`):
```ts
    controversies: a.controversies.map((c, i) => ({
      id: `controversy-${i}`, title: c.title, summary: c.summary, status: c.status,
      eventDate: c.eventDate, reportDate: c.reportDate,
      sources: c.sources.map((s) => toSource(s)),
    })),
```

- [ ] **Step 4: insert.ts — include controversies in the plan**

In `scraper/lib/insert.ts`:
- Extend `InsertPlan` with `controversies: Array<{ targetId: string; key: string; data: CandidateControversy }>`.
- In `planInserts`, gather `const controversies = approved.controversies.filter((c) => c.targetId === t.id).map((c) => c.data);` include in the early-skip check and in `approvedToOfficial({ careers, assets, judgments, controversies })`.
- After validation passes: `for (const c of controversies) plan.controversies.push({ targetId: t.id, key: controversyKey(t.id, c), data: c });`
- Initialize `controversies: []` in the empty plan.

- [ ] **Step 5: Update test literals**

`scraper/test/insert.test.ts`: `reviewWith` returns a `ReviewFile` — add `wikiControversies: []` to it. Add a `controversies: []` expectation only if asserted. `approvedToOfficial` calls in `scraper/test/toOfficial.test.ts` — add `controversies: []` to the `ApprovedForTarget` arg.
`scraper/test/review.test.ts`: `buildReviewFile` result — add an assertion `expect(rf.wikiControversies).toEqual([])` for the no-controversy case, and if you add a controversy to the `results` fixture, assert it lands `approved:false`.

- [ ] **Step 6: Verify**

Run: `PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm exec tsc --noEmit` (clean) and `pnpm exec vitest run` (all pass; fix any literal). 

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(scraper): carry controversies through review/keys/toOfficial/plan"
```

---

## Task 5: Import controversies + run.ts wiring

**Files:** Modify `scraper/import.ts`, `scraper/run.ts`

- [ ] **Step 1: import.ts — write controversies + junction**

In `scraper/import.ts`, after the judgments loop, add (idempotent by official+title):
```ts
  for (const c of plan.controversies) {
    const oid = officialId.get(c.targetId)!;
    const { data: existing } = await supabase.from('controversies').select('id')
      .eq('official_id', oid).eq('title', c.data.title).maybeSingle();
    if (existing) { stat.skipped += 1; continue; }
    const { data: row, error } = await supabase.from('controversies')
      .insert({ official_id: oid, title: c.data.title, summary: c.data.summary, status: c.data.status, event_date: c.data.eventDate, report_date: c.data.reportDate })
      .select('id').single();
    if (error || !row) throw new Error(`insert controversy (${c.key}) failed: ${error?.message ?? 'no row'}`);
    for (const s of c.data.sources) {
      const sid = await insertSource(supabase, s);
      const { error: jErr } = await supabase.from('controversy_sources').insert({ controversy_id: row.id, source_id: sid });
      if (jErr) throw new Error(`insert controversy_source (${c.key}) failed: ${jErr.message}`);
    }
    stat.inserted += 1;
  }
```
Also update the `slugs` set (for `--ensure-all` off path) to include `...plan.controversies.map((x) => x.targetId)`.

- [ ] **Step 2: run.ts — register wikiAdapter**

In `scraper/run.ts`, import and add to the adapters array:
```ts
import { wikiAdapter } from './lib/wiki';
// ...
const adapters: SourceAdapter[] = [lyAdapter, cecAdapter, cyAdapter, judgmentsAdapter, wikiAdapter];
```

- [ ] **Step 3: Verify**

Run: `PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm exec tsc --noEmit` (clean), `pnpm exec vitest run` (all pass).
Dry-run one person through wiki only:
`PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm run scrape -- --only=huang-kuo-chang --source=wiki --dry-run`
Expected: a `wiki:ok({"controversies":N})` summary line, N>0, no crash.

- [ ] **Step 4: Commit**

```bash
git add scraper/import.ts scraper/run.ts
git commit -m "feat(scraper): import controversies (+sources) and register wiki adapter"
```

---

## Task 6: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + tsc**

Run: `PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm exec vitest run` (all pass) and `pnpm exec tsc --noEmit` (clean).

- [ ] **Step 2: Real wiki scrape + manual approval + import for one person**

```bash
P="/opt/homebrew/opt/node@26/bin"
PATH="$P:$PATH" pnpm run scrape -- --only=huang-kuo-chang --source=wiki
```
This writes `scraper/out/huang-kuo-chang.json` with `wikiControversies` (approved:false). Simulate review: set the first controversy's `approved` to `true` and fill a `reportDate` (the validator requires it) using a node one-liner:
```bash
PATH="$P:$PATH" node -e '
const f="scraper/out/huang-kuo-chang.json"; const j=JSON.parse(require("fs").readFileSync(f,"utf8"));
if(j.wikiControversies[0]){ j.wikiControversies[0].approved=true; j.wikiControversies[0].data.reportDate="2024-01-01"; }
require("fs").writeFileSync(f, JSON.stringify(j,null,2));
console.log("approved 1 controversy for import test");
'
PATH="$P:$PATH" pnpm run scrape:import
```
Expected: import inserts ≥1 controversy. Verify in DB:
```bash
docker exec supabase_db_legislator-background psql -U postgres -d postgres -c "select o.name, c.title, c.status, (select count(*) from controversy_sources cs where cs.controversy_id=c.id) sources from officials o join controversies c on c.official_id=o.id;"
```
Expected: a row for 黃國昌 with a title + ≥1 source.

- [ ] **Step 3: Build shows it**

Run: `PATH="/opt/homebrew/opt/node@26/bin:$PATH" pnpm run build` then verify the 爭議 section renders for that official:
```bash
F=$(grep -rl '黃國昌' dist/officials | head -1); grep -o '爭議事件\|出處' "$F" | sort -u
```
Then reset that out file's approval to keep state clean (re-scrape or set approved back to false), and note in your report that the imported test controversy remains in the DB (harmless; it is a real sourced Wikipedia item).

- [ ] **Step 4: Commit any fixes**

If no code changes, report; do not create an empty commit.

---

## Self-Review notes

- **Spec coverage:** CandidateControversy type → Task 1; wiki pure parsers (sections/summary/refs/disambiguation) → Task 2; fetch adapter → Task 3; pipeline carry (review/keys/toOfficial/plan) → Task 4; import + run wiring → Task 5; reuse existing controversies tables (no schema change) — confirmed, no migration task; review-gated (approved:false, validator requires source+status+reportDate) → Tasks 4–6; dual source layer (wiki + refs) → Task 2 `buildSources`; disambiguation → Task 2/3 `isLikelyPerson`. Spec §9 open items (ref-date, summary length) resolved: reportDate left to human (Task 6 fills it), summary 300 chars (Task 2).
- **Placeholders:** none — wiki parser code is concrete; the live-markup tightening in Task 2 Step 4 is real fixture-driven adjustment.
- **Type consistency:** `CandidateControversy` (Task 1) used in wiki.ts (2/3), review/toOfficial/insert (4), import (5); `controversyKey` (Task 4 keys) used in insert (4); `ReviewFile.wikiControversies` (Task 4) used in review + import collectApproved; `ApprovedForTarget.controversies` (Task 4) consumed by `approvedToOfficial`. `status` defaults `'other'`, validator (existing `validateOfficial`) requires controversy source+status+reportDate — adapter sets status, human sets reportDate before approval.
