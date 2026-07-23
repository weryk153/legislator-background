# 政治獻金查詢頁（企業反查）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 營利事業捐贈全量入庫（含捐給落選人者），新增 `/donors`「政治獻金查詢」頁：雙向搜尋（政治人物／公司名／統編）＋預設多方捐贈排行。

**Architecture:** `out-ardata/*_incomes.csv` → `scraper/lib/corp.ts`（統編合併＋加總）→ `corp_donations` 表（official_id 沿用既有 donation_reports 配對）→ `scraper/export-donors.ts` → `public/data/donors.json`（client fetch）→ `src/pages/donors.astro`＋`DonorSearch.svelte`。

**Tech Stack:** 沿用既有：TypeScript/tsx、vitest、supabase-js、Astro＋Svelte（legacy 語法：`export let`、`$:`）。無新依賴。

**Spec:** `docs/superpowers/specs/2026-07-23-donor-lookup-design.md`

## Global Constraints

- 金額一律整數「元」。
- 落選人（official_id NULL）只存/顯示姓名，不做任何連結或身分推斷；現任連結**只**沿用 donation_reports 既有 (official_id, election_name) 配對，不新增比對邏輯。
- 統編 8 碼明碼為公司主鍵；同統編名稱變體取**最長**為正規名；統編無效（非 8 碼數字）以 `name:<公司名>` 為鍵。
- 個人捐贈完全不入 corp_donations、不出現在 /donors 頁。
- Svelte 元件用 legacy 語法（`export let`、`$:`），比照 `src/components/OfficialTable.svelte`。
- 本機 supabase db port **54422**（psql 不在 PATH 時 `docker exec` 進 supabase db 容器）。

---

### Task 1: Migration `0008_corp_donations.sql`

**Files:**
- Create: `supabase/migrations/0008_corp_donations.sql`

**Interfaces:**
- Produces: 表 `corp_donations`，Task 3 寫入、Task 4 匯出。

- [ ] **Step 1: 寫 migration**

```sql
-- 營利事業政治獻金全量（含捐給落選人者）。每列＝公司×候選人×選舉（金額加總）。
-- official_id 沿用 donation_reports 既有比對結果（寧缺勿錯）；NULL＝落選人或未收錄。
create table corp_donations (
  id uuid primary key default gen_random_uuid(),
  donor_uid text not null,        -- 8碼統編；無效統編列用 'name:<公司名>'
  donor_name text not null,       -- 正規名（同統編變體取最長）
  recipient_name text not null,   -- 擬參選人姓名（原文）
  election_name text not null,
  official_id uuid references officials(id) on delete set null,
  amount bigint not null,
  source_id uuid not null references sources(id)
);
create index corp_donations_uid_idx on corp_donations (donor_uid);
create index corp_donations_official_idx on corp_donations (official_id);

alter table corp_donations enable row level security;
create policy "public read" on corp_donations for select using (true);
```

- [ ] **Step 2: 套用並驗證**

追蹤表已同步（0001–0007 都在 `supabase_migrations.schema_migrations`），直接：

```bash
supabase migration up 2>&1 | tail -3
docker exec $(docker ps --format '{{.Names}}' | grep supabase_db) psql -U postgres -c "\d corp_donations"
```

Expected: 0008 被套用且追蹤；`\d` 顯示上述欄位、兩個 index、RLS enabled。若 `supabase migration up` 失敗，改用 docker psql 直接執行 SQL **並**照 0006/0007 的格式補插入追蹤列（見 `.superpowers/sdd/task-3-report.md` 的 Fix 記錄）。

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_corp_donations.sql
git commit -m "feat(donors): corp_donations 表(營利事業全量,統編為鍵)"
```

---

### Task 2: 解析器加統編欄＋企業彙總 `scraper/lib/corp.ts`

**Files:**
- Modify: `scraper/lib/ardata.ts`（DonationRow 加 `idNumber`）
- Create: `scraper/lib/corp.ts`
- Test: `scraper/test/corp.test.ts`（新）＋ `scraper/test/ardata.test.ts`（加 1 個 case）

**Interfaces:**
- Consumes: `parseArdataCsv`、`DonationRow`（既有）。
- Produces:
  - `DonationRow` 新增欄位 `idNumber: string`（身分證／統一編號原文，trim）
  - `interface CorpDonation { donorUid: string; donorName: string; recipientName: string; electionName: string; amount: number; }`
  - `aggregateCorpDonations(rows: DonationRow[]): CorpDonation[]`

- [ ] **Step 1: 寫 failing tests**

`scraper/test/ardata.test.ts` 的 parseArdataCsv describe 內加：

```ts
  it('解析身分證／統一編號欄', () => {
    const rows = parseArdataCsv(csv);
    expect(rows[1].idNumber).toBe('12345678');
    expect(rows[0].idNumber).toBe('A12*******');
  });
```

`scraper/test/corp.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { aggregateCorpDonations } from '../lib/corp';
import type { DonationRow } from '../lib/ardata';

const row = (over: Partial<DonationRow>): DonationRow => ({
  account: '王測試', electionName: '113年立法委員選舉', reportSeq: '首次申報',
  category: '營利事業捐贈收入', counterparty: '甲公司', idNumber: '11111111',
  income: 100000, expense: 0, ...over,
});

describe('aggregateCorpDonations', () => {
  it('只收營利事業捐贈收入', () => {
    const out = aggregateCorpDonations([row({}), row({ category: '個人捐贈收入' }), row({ category: '宣傳支出', income: 0, expense: 5000 })]);
    expect(out).toHaveLength(1);
  });
  it('同公司×同人×同選舉加總；不同人分列', () => {
    const out = aggregateCorpDonations([
      row({ income: 100000 }), row({ income: 50000 }),
      row({ account: '李試驗', electionName: '111年臺北市議員選舉', income: 30000 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((c) => c.recipientName === '王測試')!.amount).toBe(150000);
    expect(out.find((c) => c.recipientName === '李試驗')!.amount).toBe(30000);
  });
  it('同統編名稱變體合併，取最長為正規名', () => {
    const out = aggregateCorpDonations([
      row({ counterparty: '中科國際物流(股)公司', income: 10000 }),
      row({ counterparty: '中科國際物流股份有限公司', income: 20000 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].donorName).toBe('中科國際物流股份有限公司');
    expect(out[0].amount).toBe(30000);
    expect(out[0].donorUid).toBe('11111111');
  });
  it('統編非8碼數字 → name:<公司名> 為鍵，不與他人合併', () => {
    const out = aggregateCorpDonations([
      row({ idNumber: '', counterparty: '乙公司' }),
      row({ idNumber: '1234567', counterparty: '乙公司' }), // 7碼 → 也是 fallback，同名合併
      row({ counterparty: '乙公司' }),                       // 有效統編 → 獨立
    ]);
    const fallback = out.find((c) => c.donorUid === 'name:乙公司')!;
    expect(fallback.amount).toBe(200000);
    expect(out.find((c) => c.donorUid === '11111111')!.amount).toBe(100000);
  });
  it('金額為0的列略過', () => {
    expect(aggregateCorpDonations([row({ income: 0 })])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `pnpm vitest run scraper/test/corp.test.ts scraper/test/ardata.test.ts`
Expected: FAIL（corp 模組不存在；idNumber undefined）

- [ ] **Step 3: 實作**

`scraper/lib/ardata.ts`：`DonationRow` 加 `idNumber: string;`（`counterparty` 之後）；`HEADER_ALIASES` 加 `'身分證／統一編號': 'idNumber', '身分證/統一編號': 'idNumber',`；`parseArdataCsv` 的回傳物件加 `idNumber: cell(r, 'idNumber'),`。

`scraper/lib/corp.ts`：

```ts
// 營利事業捐贈全量彙總（/donors 反查用）。統編（8碼明碼）為公司主鍵：
// 同統編的名稱變體（漏字/簡寫）合併，取最長字串為正規名。統編無效的極少數列
// （2026-07 實測 20,288 列中僅 1 列）以 'name:<公司名>' 為鍵，避免與他公司誤併。
import type { DonationRow } from './ardata';

export interface CorpDonation {
  donorUid: string; donorName: string;
  recipientName: string; electionName: string; amount: number;
}

const UID_RE = /^\d{8}$/;

export function aggregateCorpDonations(rows: DonationRow[]): CorpDonation[] {
  const canonical = new Map<string, string>();          // uid → 最長名稱
  const sums = new Map<string, CorpDonation>();         // uid|recipient|election → 累計
  for (const r of rows) {
    if (r.category !== '營利事業捐贈收入' || r.income <= 0 || !r.counterparty) continue;
    const uid = UID_RE.test(r.idNumber) ? r.idNumber : `name:${r.counterparty}`;
    const prev = canonical.get(uid) ?? '';
    if (r.counterparty.length > prev.length) canonical.set(uid, r.counterparty);
    const key = `${uid}|${r.account}|${r.electionName}`;
    const cur = sums.get(key);
    if (cur) cur.amount += r.income;
    else sums.set(key, { donorUid: uid, donorName: '', recipientName: r.account, electionName: r.electionName, amount: r.income });
  }
  const out = [...sums.values()];
  for (const c of out) c.donorName = canonical.get(c.donorUid)!;
  return out;
}
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `pnpm vitest run scraper/test/corp.test.ts scraper/test/ardata.test.ts`
Expected: 全 PASS。再跑 `pnpm test` 確認無回歸（111＋新增）。

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/ardata.ts scraper/lib/corp.ts scraper/test/corp.test.ts scraper/test/ardata.test.ts
git commit -m "feat(donors): 企業捐贈彙總(統編合併變體/加總)+解析器統編欄"
```

---

### Task 3: 入庫腳本 `scraper/donations-corp-record.ts` ＋ 實際執行

**Files:**
- Create: `scraper/donations-corp-record.ts`
- Modify: `package.json`（scripts 加 `"donations:corp-record": "tsx scraper/donations-corp-record.ts"`，放在 `"donations:record"` 之後）

**Interfaces:**
- Consumes: `parseArdataCsv`（含 idNumber）、`aggregateCorpDonations`、`corp_donations` 表。
- Produces: DB 全量資料（wipe-and-rebuild，可重跑）。

- [ ] **Step 1: 寫腳本**

```ts
// 營利事業捐贈全量入庫（/donors 反查）。讀 out-ardata/*_incomes.csv → aggregateCorpDonations
// → 連結 official_id（只沿用 donation_reports 既有 (official名, election) 配對,寧缺勿錯）
// → wipe-and-rebuild corp_donations（全刪重建,冪等）。
//   pnpm run donations:corp-record            # 寫入
//   DRY_RUN=1 pnpm run donations:corp-record  # 只統計不寫
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { parseArdataCsv } from './lib/ardata';
import { aggregateCorpDonations } from './lib/corp';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, 'out-ardata');
const SOURCE_URL = 'https://ardata.cy.gov.tw/data/downloads/election';
const RETRIEVED_AT = '2026-07-23';

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('_incomes.csv'));
  if (files.length === 0) throw new Error(`no incomes CSVs in ${DATA_DIR}`);
  const rows = files.flatMap((f) => parseArdataCsv(readFileSync(join(DATA_DIR, f), 'utf8')));
  const corp = aggregateCorpDonations(rows);
  console.log(`${files.length} 檔 → 營利事業配對 ${corp.length} 筆, 公司 ${new Set(corp.map((c) => c.donorUid)).size} 家`);

  // (official姓名, election_name) → official_id：沿用既有 donation_reports 配對
  const { data: reps, error: re } = await sb.from('donation_reports')
    .select('official_id, election_name, officials!inner(name)');
  if (re) throw new Error(`donation_reports query: ${re.message}`);
  const officialByKey = new Map<string, string>();
  for (const r of reps as unknown as { official_id: string; election_name: string; officials: { name: string } }[]) {
    officialByKey.set(`${r.officials.name}|${r.election_name}`, r.official_id);
  }
  const linked = corp.filter((c) => officialByKey.has(`${c.recipientName}|${c.electionName}`)).length;
  console.log(`可連結現任: ${linked} / ${corp.length}`);
  if (process.env.DRY_RUN) { console.log('(dry) 不寫入'); return; }

  // wipe-and-rebuild（含既有共用 source）
  await sb.from('corp_donations').delete().neq('donor_uid', '');
  const { data: oldSrc } = await sb.from('sources').select('id').eq('url', SOURCE_URL).eq('title', '監察院政治獻金公開查閱平臺 營利事業捐贈整批檔');
  for (const s of oldSrc ?? []) await sb.from('sources').delete().eq('id', s.id);
  const { data: src, error: se } = await sb.from('sources')
    .insert({ url: SOURCE_URL, type: 'gov', title: '監察院政治獻金公開查閱平臺 營利事業捐贈整批檔', retrieved_at: RETRIEVED_AT })
    .select('id').single();
  if (se) throw new Error(`source insert: ${se.message}`);

  for (let i = 0; i < corp.length; i += 500) {
    const chunk = corp.slice(i, i + 500).map((c) => ({
      donor_uid: c.donorUid, donor_name: c.donorName, recipient_name: c.recipientName,
      election_name: c.electionName, amount: c.amount,
      official_id: officialByKey.get(`${c.recipientName}|${c.electionName}`) ?? null,
      source_id: src.id,
    }));
    const { error } = await sb.from('corp_donations').insert(chunk);
    if (error) throw new Error(`insert chunk ${i}: ${error.message}`);
  }
  console.log(`完成: 入庫 ${corp.length} 筆。記得 pnpm run export:donors。`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: package script＋DRY_RUN**

Run: `DRY_RUN=1 pnpm run donations:corp-record`
Expected: 配對約 18,900±100 筆、公司約 12,700±100 家、可連結現任數千筆量級（798 位受贈者相關配對）。

- [ ] **Step 3: 實際寫入＋驗證**

Run: `pnpm run donations:corp-record`，然後：

```bash
docker exec $(docker ps --format '{{.Names}}' | grep supabase_db) psql -U postgres -c "
  select count(*), count(distinct donor_uid), count(official_id) as linked from corp_donations;
  select o.name, c.amount from corp_donations c join officials o on o.id=c.official_id
  where c.donor_name='北投麗禧溫泉酒店股份有限公司' order by c.amount desc limit 5;"
```

Expected: 總數＝DRY_RUN 配對數；北投麗禧前 5 名與既有 donation_top_donors 查詢一致（游淑慧/戴錫欽 500000、張斯綱/楊植斗 400000…）。重跑一次 `pnpm run donations:corp-record` 確認冪等（總數不變、無重複）。

- [ ] **Step 4: Commit**

```bash
git add scraper/donations-corp-record.ts package.json
git commit -m "feat(donors): 企業捐贈全量入庫腳本(wipe-and-rebuild,沿用既有official配對)"
```

---

### Task 4: 匯出 `scraper/export-donors.ts` → `public/data/donors.json`

**Files:**
- Create: `scraper/export-donors.ts`
- Create: `public/data/donors.json`（產物，committed）
- Modify: `package.json`（scripts 加 `"export:donors": "tsx scraper/export-donors.ts"`）

**Interfaces:**
- Consumes: `corp_donations`、`donation_reports`、`officials` 表。
- Produces（Task 5 讀取）：`public/data/donors.json`：

```ts
interface DonorsJson {
  generatedAt: string;                  // YYYY-MM-DD
  elections: string[];                  // 涵蓋選舉（distinct，顯示用）
  officials: { name: string; slug: string; party: string; officeType: string; district: string; totalIncome: number }[];
  donors: { uid: string; name: string; total: number; recipients: { name: string; election: string; amount: number; slug: string | null; party: string | null; officeType: string | null }[] }[];
}
```

- [ ] **Step 1: 寫腳本**

```ts
// corp_donations + donation_reports → public/data/donors.json（/donors 頁 client fetch）。
// officials 索引 = 有獻金報告的現任（雙向搜尋的「政治人物」側）。
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));

async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  type Rep = { official_id: string; election_name: string; total_income: number; officials: { name: string; slug: string; party: string; office_type: string; district: string } };
  const reps = await fetchAll<Rep>((a, b) => sb.from('donation_reports')
    .select('official_id, election_name, total_income, officials!inner(name, slug, party, office_type, district)').range(a, b));

  const offAgg = new Map<string, { name: string; slug: string; party: string; officeType: string; district: string; totalIncome: number }>();
  const offMeta = new Map<string, { slug: string; party: string; officeType: string }>();
  for (const r of reps) {
    const o = r.officials;
    offMeta.set(r.official_id, { slug: o.slug, party: o.party, officeType: o.office_type });
    const cur = offAgg.get(r.official_id);
    if (cur) cur.totalIncome += r.total_income;
    else offAgg.set(r.official_id, { name: o.name, slug: o.slug, party: o.party, officeType: o.office_type, district: o.district, totalIncome: r.total_income });
  }

  type Corp = { donor_uid: string; donor_name: string; recipient_name: string; election_name: string; amount: number; official_id: string | null };
  const corp = await fetchAll<Corp>((a, b) => sb.from('corp_donations')
    .select('donor_uid, donor_name, recipient_name, election_name, amount, official_id').range(a, b));

  const donorMap = new Map<string, { uid: string; name: string; total: number; recipients: { name: string; election: string; amount: number; slug: string | null; party: string | null; officeType: string | null }[] }>();
  for (const c of corp) {
    const meta = c.official_id ? offMeta.get(c.official_id) : undefined;
    const d = donorMap.get(c.donor_uid) ?? { uid: c.donor_uid, name: c.donor_name, total: 0, recipients: [] };
    d.total += c.amount;
    d.recipients.push({ name: c.recipient_name, election: c.election_name, amount: c.amount, slug: meta?.slug ?? null, party: meta?.party ?? null, officeType: meta?.officeType ?? null });
    donorMap.set(c.donor_uid, d);
  }
  const donors = [...donorMap.values()];
  for (const d of donors) d.recipients.sort((a, b) => b.amount - a.amount);
  donors.sort((a, b) => b.total - a.total);
  const officials = [...offAgg.values()].sort((a, b) => b.totalIncome - a.totalIncome);
  const elections = [...new Set(corp.map((c) => c.election_name))].sort();

  const outDir = join(here, '..', 'public', 'data');
  mkdirSync(outDir, { recursive: true });
  const payload = { generatedAt: new Date().toISOString().slice(0, 10), elections, officials, donors };
  writeFileSync(join(outDir, 'donors.json'), JSON.stringify(payload));
  console.log(`exported ${donors.length} donors / ${officials.length} officials → public/data/donors.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 執行＋驗證**

Run: `pnpm run export:donors`，然後：

```bash
python3 - <<'EOF'
import json
d = json.load(open('public/data/donors.json'))
print('donors:', len(d['donors']), 'officials:', len(d['officials']), 'elections:', len(d['elections']))
top = d['donors'][0]
print('top donor:', top['name'], top['total'], 'recipients:', len(top['recipients']))
linked = sum(1 for x in d['donors'] for r in x['recipients'] if r['slug'])
print('linked recipient rows:', linked)
import os; print('size MB:', round(os.path.getsize('public/data/donors.json')/1e6, 2))
EOF
```

Expected: donors ≈ 12,700、officials = 798（現任受贈者數）、size 個位數 MB、linked > 0。

- [ ] **Step 3: Commit**

```bash
git add scraper/export-donors.ts package.json public/data/donors.json
git commit -m "feat(donors): export-donors → public/data/donors.json(雙索引)"
```

---

### Task 5: `/donors` 頁＋導覽

**Files:**
- Create: `src/components/DonorSearch.svelte`
- Create: `src/pages/donors.astro`
- Modify: `src/layouts/Base.astro`（nav 加連結）

**Interfaces:**
- Consumes: `/data/donors.json`（Task 4 結構）。

- [ ] **Step 1: 建 `src/components/DonorSearch.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  type Recipient = { name: string; election: string; amount: number; slug: string | null; party: string | null; officeType: string | null };
  type Donor = { uid: string; name: string; total: number; recipients: Recipient[] };
  type Off = { name: string; slug: string; party: string; officeType: string; district: string; totalIncome: number };
  type Data = { generatedAt: string; elections: string[]; officials: Off[]; donors: Donor[] };

  let data: Data | null = null;
  let failed = false;
  let search = '';
  let expanded: Record<string, boolean> = {};

  onMount(async () => {
    try {
      const res = await fetch('/data/donors.json');
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch { failed = true; }
  });

  const fmt = (n: number) => new Intl.NumberFormat('zh-Hant').format(n);
  const officeName: Record<string, string> = { legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員' };

  // 現任受贈人數（多方捐贈排行用）：同一位現任只算一次
  const linkedCount = (d: Donor) => new Set(d.recipients.filter((r) => r.slug).map((r) => r.slug)).size;

  $: q = search.trim();
  $: officialHits = data && q.length >= 2 ? data.officials.filter((o) => o.name.includes(q)).slice(0, 30) : [];
  $: donorHits = data && q.length >= 2
    ? data.donors.filter((d) => d.name.includes(q) || d.uid.startsWith(q)).slice(0, 50)
    : [];
  // 預設排行：捐給最多位現任者前 50（次序鍵：人數 desc, 總額 desc）
  $: ranking = data && q.length < 2
    ? [...data.donors].map((d) => ({ d, n: linkedCount(d) })).filter((x) => x.n >= 2)
        .sort((a, b) => b.n - a.n || b.d.total - a.d.total).slice(0, 50)
    : [];
  $: totalAmount = data ? data.donors.reduce((s, d) => s + d.total, 0) : 0;
</script>

<input class="ctrl" type="search" placeholder="輸入政治人物姓名，或公司名稱／統一編號" aria-label="搜尋" bind:value={search} />

{#if failed}
  <p class="dim">資料載入失敗，請重新整理。</p>
{:else if !data}
  <p class="dim">載入中…</p>
{:else}
  {#if q.length < 2}
    <p class="stats num">收錄營利事業 {fmt(data.donors.length)} 家・捐贈總額 NT$ {fmt(totalAmount)}・{data.elections.length} 場選舉（{data.generatedAt} 匯出）</p>
    <h2>捐給最多位現任政治人物的企業</h2>
    {#each ranking as { d, n } (d.uid)}
      <article class="card donor">
        <button class="donor-head" on:click={() => (expanded[d.uid] = !expanded[d.uid])}>
          <span class="donor-name">{d.name}</span>
          <span class="donor-meta num">{n} 位現任・NT$ {fmt(d.total)}</span>
        </button>
        {#if expanded[d.uid]}
          <ul class="recips">
            {#each d.recipients as r}
              <li>
                {#if r.slug}<a href={`/officials/${r.slug}`}>{r.name}</a><span class="tag">{r.party}・{officeName[r.officeType ?? ''] ?? ''}</span>
                {:else}<span class="plain">{r.name}</span><span class="tag dim2">非本站收錄之現任者</span>{/if}
                <span class="amt num">NT$ {fmt(r.amount)}</span>
                <span class="elec">{r.election}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>
    {/each}
  {:else}
    {#if officialHits.length > 0}
      <h2>政治人物</h2>
      {#each officialHits as o (o.slug)}
        <a class="offrow" href={`/officials/${o.slug}`}>
          <strong>{o.name}</strong>
          <span class="tag">{o.party}・{officeName[o.officeType] ?? ''}・{o.district}</span>
          <span class="amt num">獻金總收入 NT$ {fmt(o.totalIncome)}</span>
        </a>
      {/each}
    {/if}
    {#if donorHits.length > 0}
      <h2>營利事業</h2>
      {#each donorHits as d (d.uid)}
        <article class="card donor">
          <button class="donor-head" on:click={() => (expanded[d.uid] = !expanded[d.uid])}>
            <span class="donor-name">{d.name}</span>
            <span class="donor-meta num">{d.uid.startsWith('name:') ? '' : `統編 ${d.uid}・`}NT$ {fmt(d.total)}</span>
          </button>
          {#if expanded[d.uid]}
            <ul class="recips">
              {#each d.recipients as r}
                <li>
                  {#if r.slug}<a href={`/officials/${r.slug}`}>{r.name}</a><span class="tag">{r.party}・{officeName[r.officeType ?? ''] ?? ''}</span>
                  {:else}<span class="plain">{r.name}</span><span class="tag dim2">非本站收錄之現任者</span>{/if}
                  <span class="amt num">NT$ {fmt(r.amount)}</span>
                  <span class="elec">{r.election}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </article>
      {/each}
    {/if}
    {#if officialHits.length === 0 && donorHits.length === 0}
      <p class="dim">查無符合「{q}」的政治人物或營利事業。</p>
    {/if}
  {/if}
{/if}

<style>
  .ctrl { width: 100%; max-width: 480px; padding: 8px 12px; font-size: 1rem; border: 1px solid var(--line-strong); background: transparent; color: var(--fg); }
  .stats { margin: 14px 0 6px; font-size: 0.8125rem; color: var(--muted); }
  h2 { font-size: 1.0625rem; margin: 22px 0 8px; }
  .donor { margin: 8px 0; }
  .donor-head { display: flex; justify-content: space-between; gap: 12px; width: 100%; padding: 10px 0; background: none; border: none; cursor: pointer; color: var(--fg); font: inherit; text-align: left; }
  .donor-name { font-weight: 700; }
  .donor-meta { color: var(--muted); font-size: 0.8125rem; flex: none; }
  .recips { list-style: none; margin: 0 0 10px; padding: 0; font-size: 0.875rem; }
  .recips li { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; padding: 4px 0; border-top: 1px solid var(--line); }
  .recips a { font-weight: 700; }
  .plain { color: var(--muted); }
  .tag { font-size: 0.75rem; color: var(--muted); }
  .dim2 { color: var(--faint); }
  .amt { margin-left: auto; }
  .elec { flex: none; font-size: 0.75rem; color: var(--faint); }
  .offrow { display: flex; gap: 10px; align-items: baseline; padding: 9px 0; border-bottom: 1px solid var(--line); }
  .offrow .amt { margin-left: auto; font-size: 0.875rem; }
  .dim { color: var(--muted); }
</style>
```

- [ ] **Step 2: 建 `src/pages/donors.astro`**

```astro
---
import Base from "../layouts/Base.astro";
import DonorSearch from "../components/DonorSearch.svelte";
const desc = "查詢政治人物的政治獻金，或以公司名稱／統一編號反查營利事業捐贈給哪些候選人。資料來源：監察院政治獻金公開查閱平臺整批電子檔。";
---
<Base title="政治獻金查詢｜政治人物背景" description={desc}>
  <header class="head">
    <h1>政治獻金查詢</h1>
    <p class="lede">輸入政治人物姓名，或營利事業名稱／統一編號，反查政治獻金流向。</p>
  </header>
  <DonorSearch client:load />
  <p class="note">
    資料彙總自<a href="https://ardata.cy.gov.tw/data/downloads/election" target="_blank" rel="noopener">監察院政治獻金公開查閱平臺</a>整批電子檔（113年立法委員選舉、111年地方公職選舉及現任屆議員補選之首次申報），僅含營利事業捐贈；
    同統一編號之名稱變體已合併。個人捐贈不在本頁範圍。金額為程式彙總，請以平臺原始明細為準。
  </p>
  <style>
    .head { margin: 14px 0 22px; }
    .head h1 { font-size: var(--t-xl); margin: 0 0 6px; }
    .lede { margin: 0; color: var(--muted); }
    .note { font-size: var(--t-sm); color: var(--muted); margin-top: 28px; max-width: 72ch; }
  </style>
</Base>
```

- [ ] **Step 3: 導覽列加連結**

`src/layouts/Base.astro` nav 內「總覽」之後加：

```html
          <a href="/donors">政治獻金</a>
```

- [ ] **Step 4: Build＋三狀態驗證**

Run: `pnpm run build && pnpm run preview`（背景）
以瀏覽器或 curl 驗證：
1. `/donors` 預設：統計列＋排行前 50（首名應為環隆科技 19 位量級）。
2. 搜尋「王世堅」：政治人物區出現、連結正確。
3. 搜尋「北投麗禧」或統編：公司卡片、展開後受贈者 16 位、現任可點。
（client-side 渲染 curl 驗證不到的部分，以瀏覽器實測。）

- [ ] **Step 5: 全測試＋Commit**

Run: `pnpm test`
Expected: 全 PASS。

```bash
git add src/components/DonorSearch.svelte src/pages/donors.astro src/layouts/Base.astro
git commit -m "feat(donors): /donors 政治獻金查詢頁(雙向搜尋+多方捐贈排行)+導覽"
```
