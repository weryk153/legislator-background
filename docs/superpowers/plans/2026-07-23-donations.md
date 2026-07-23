# 政治獻金（ardata）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為現任 officials 加上「現任那一席」選舉的政治獻金收支摘要＋大額捐贈者，來源為監察院 ardata 整批下載電子檔。

**Architecture:** ardata 整批 CSV → `scraper/lib/ardata.ts`（解析＋彙總）→ `scraper/lib/ardata-match.ts`（姓名＋選舉類型比對 officials，寧缺勿錯）→ `scraper/donations-record.ts` 寫入兩張新表 → `export-officials.ts` 匯出 `donations` 欄位 → `[id].astro` 新區塊。

**Tech Stack:** TypeScript + tsx、vitest、Supabase（本地）、Astro。無新依賴（CSV 解析自寫，約 30 行）。

**Spec:** `docs/superpowers/specs/2026-07-23-donations-design.md`

## Global Constraints

- 金額一律整數「元」（bigint / number）。
- 身分比對寧缺勿錯：比對不到或模糊 → 不入庫，輸出 review 清單。
- 大額捐贈者收錄規則：**營利事業全列；個人加總後取前 20**；匿名捐贈只進分類小計、不進捐贈者表。
- 每筆入庫資料必附 `sources` 列（provenance）。
- 原始下載檔不進 git（`scraper/out-ardata/` 加入 .gitignore）；測試 fixture 用合成資料（欄位格式依 data.gov.tw dataset 129494 的官方欄位）。
- 對外請求帶既有 UA：`legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)`。

---

### Task 1: ardata 偵察與整批下載

**Files:**
- Create: `scraper/fixtures/ardata-notes.md`（端點紀錄，committed）
- Create: `scraper/out-ardata/`（原始下載，NOT committed）
- Modify: `.gitignore`

**Interfaces:**
- Produces: `scraper/out-ardata/*.csv` — 113年立委選舉＋111年地方公職選舉（及查得到的立委補選）之收支明細 CSV；`ardata-notes.md` 記載每包的下載 URL 與查詢頁 URL（之後 Task 5 當 source.url 用）。

此任務為探索性（無 TDD）。ardata.cy.gov.tw 是 Angular SPA，比照 `scraper/adapters/cy.ts` 當年破解 priso 的做法：瀏覽器驅動＋攔截 XHR。

- [ ] **Step 1: 加 .gitignore**

在 `.gitignore` 末尾（`scraper/out-judgments/` 之後）加一行：

```
scraper/out-ardata/
```

- [ ] **Step 2: 瀏覽器偵察**

用 Claude in Chrome（或本機 Chrome 手動）開 `https://ardata.cy.gov.tw/home`：
1. 進「選舉查詢」，選「第11屆立法委員選舉」，找「整批下載」按鈕。
2. 觸發下載，用 read_network_requests 攔截實際 URL（形如 `https://ardata.cy.gov.tw/api/v1/download/...` 或靜態檔連結）。
3. 對「111年地方公職人員選舉」（九合一：直轄市議員／縣市議員／直轄市長／縣市長）重複；另檢查有無第11屆立委「補選」包。
4. 同時記下「專戶查詢」單人查詢頁的 URL 樣式（給 source 連結用，如 `https://ardata.cy.gov.tw/home?searchType=...`）。

- [ ] **Step 3: 下載並解壓**

```bash
mkdir -p scraper/out-ardata
# 用 Step 2 攔到的實際 URL，逐包：
curl -L -A 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)' \
  -o scraper/out-ardata/<選舉名>.zip '<下載URL>'
cd scraper/out-ardata && unzip -O big5 '*.zip' || unzip '*.zip'
```

檢查解壓出的 CSV：`head -3` 每個檔，確認編碼（可能是 Big5，需 `iconv -f big5 -t utf-8` 轉存 UTF-8）與欄位是否為：`序號,擬參選人/政黨,選舉名稱,申報序次(年度),交易日期,收支科目,捐贈者/支出對象,身分證/統一編號,收入金額,支出金額,支出用途,金錢類,地址,聯絡電話`（data.gov.tw dataset 129494 的官方格式）。**若欄名不同，把實際欄名記進 notes——Task 2 的解析器是 header-driven，屆時把別名補進 `HEADER_ALIASES`。**

- [ ] **Step 4: 寫 notes 並 commit**

`scraper/fixtures/ardata-notes.md` 內容（實際值以偵察結果為準）：

```markdown
# ardata.cy.gov.tw 整批下載端點（2026-07-23 偵察）

| 選舉 | 下載 URL | 檔案 | 編碼 |
| --- | --- | --- | --- |
| 第11屆立法委員選舉(113年) | <攔到的URL> | <檔名> | <utf-8/big5> |
| 111年地方公職人員選舉 | <攔到的URL> | <檔名> | <utf-8/big5> |

單人查詢頁樣式（source 連結用）：<URL樣式>
實際 CSV 欄名：<逐字貼上 header 列>
```

```bash
git add .gitignore scraper/fixtures/ardata-notes.md
git commit -m "chore(donations): ardata 整批下載端點偵察+原始檔目錄"
```

---

### Task 2: CSV 解析與彙總 `scraper/lib/ardata.ts`

**Files:**
- Create: `scraper/fixtures/ardata-sample.csv`（合成 fixture）
- Create: `scraper/lib/ardata.ts`
- Test: `scraper/test/ardata.test.ts`

**Interfaces:**
- Produces:
  - `parseArdataCsv(text: string): DonationRow[]`
  - `aggregateAccounts(rows: DonationRow[], topIndividuals?: number): AccountSummary[]`（topIndividuals 預設 20）
  - `interface DonationRow { account: string; electionName: string; reportSeq: string; category: string; counterparty: string; income: number; expense: number; }`
  - `interface TopDonor { donorName: string; donorType: string; amount: number; rank: number; }`
  - `interface AccountSummary { name: string; electionName: string; reportSeq: string; totalIncome: number; totalExpense: number; incomeByType: Record<string, number>; expenseByType: Record<string, number>; topDonors: TopDonor[]; }`

- [ ] **Step 1: 建 fixture**

`scraper/fixtures/ardata-sample.csv`（合成資料，欄位依官方格式；含引號內逗號、兩個專戶、匿名捐贈、同一捐贈者多筆）：

```csv
序號,擬參選人/政黨,選舉名稱,申報序次(年度),交易日期,收支科目,捐贈者/支出對象,身分證/統一編號,收入金額,支出金額,支出用途,金錢類,地址,聯絡電話
1,王測試,第11屆立法委員選舉,1,1121001,個人捐贈收入,陳大文,A12***6789,100000,0,,是,臺北市,
2,王測試,第11屆立法委員選舉,1,1121002,營利事業捐贈收入,"大安建設股份有限公司, 籌備處",12345678,300000,0,,是,臺北市,
3,王測試,第11屆立法委員選舉,1,1121003,個人捐贈收入,陳大文,A12***6789,50000,0,,是,臺北市,
4,王測試,第11屆立法委員選舉,1,1121004,個人捐贈收入,林小美,B22***1234,80000,0,,是,新北市,
5,王測試,第11屆立法委員選舉,1,1121005,匿名捐贈,,,3000,0,,是,,
6,王測試,第11屆立法委員選舉,1,1121101,宣傳支出,某某廣告公司,87654321,0,200000,文宣印製,是,臺北市,
7,李試驗,111年地方公職人員選舉(縣市議員),1,1110901,政黨捐贈收入,某某黨,55555555,60000,0,,是,南投縣,
8,李試驗,111年地方公職人員選舉(縣市議員),1,1110902,人事費用支出,張助理,C12***0000,0,30000,薪資,是,南投縣,
```

- [ ] **Step 2: 寫 failing test**

`scraper/test/ardata.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArdataCsv, aggregateAccounts } from '../lib/ardata';

const here = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(here, '..', 'fixtures', 'ardata-sample.csv'), 'utf8');

describe('parseArdataCsv', () => {
  it('解析所有列，含引號內逗號', () => {
    const rows = parseArdataCsv(csv);
    expect(rows).toHaveLength(8);
    expect(rows[1].counterparty).toBe('大安建設股份有限公司, 籌備處');
    expect(rows[1].income).toBe(300000);
    expect(rows[5].expense).toBe(200000);
    expect(rows[0].account).toBe('王測試');
    expect(rows[0].electionName).toBe('第11屆立法委員選舉');
  });
  it('金額欄容忍千分位與空白', () => {
    const rows = parseArdataCsv(
      '擬參選人/政黨,選舉名稱,申報序次(年度),收支科目,捐贈者/支出對象,收入金額,支出金額\n' +
      '甲,某選舉,1,個人捐贈收入,乙,"1,234,567",0\n');
    expect(rows[0].income).toBe(1234567);
  });
});

describe('aggregateAccounts', () => {
  const summaries = aggregateAccounts(parseArdataCsv(csv));
  const wang = summaries.find((s) => s.name === '王測試')!;
  it('每專戶一筆摘要', () => {
    expect(summaries).toHaveLength(2);
    expect(wang.electionName).toBe('第11屆立法委員選舉');
  });
  it('總額與分類小計', () => {
    expect(wang.totalIncome).toBe(533000);
    expect(wang.totalExpense).toBe(200000);
    expect(wang.incomeByType['個人捐贈收入']).toBe(230000);
    expect(wang.incomeByType['營利事業捐贈收入']).toBe(300000);
    expect(wang.incomeByType['匿名捐贈']).toBe(3000);
    expect(wang.expenseByType['宣傳支出']).toBe(200000);
  });
  it('大額捐贈者：營利事業全列、個人加總排序、匿名不列', () => {
    expect(wang.topDonors).toEqual([
      { donorName: '大安建設股份有限公司, 籌備處', donorType: '營利事業', amount: 300000, rank: 1 },
      { donorName: '陳大文', donorType: '個人', amount: 150000, rank: 2 },
      { donorName: '林小美', donorType: '個人', amount: 80000, rank: 3 },
    ]);
  });
  it('個人取前 N（參數化）', () => {
    const top1 = aggregateAccounts(parseArdataCsv(csv), 1).find((s) => s.name === '王測試')!;
    expect(top1.topDonors.filter((d) => d.donorType === '個人')).toHaveLength(1);
    expect(top1.topDonors.filter((d) => d.donorType === '營利事業')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 跑測試確認 fail**

Run: `pnpm vitest run scraper/test/ardata.test.ts`
Expected: FAIL — `Cannot find module '../lib/ardata'`

- [ ] **Step 4: 實作 `scraper/lib/ardata.ts`**

```ts
// 監察院政治獻金公開查閱平臺 (https://ardata.cy.gov.tw) 整批下載 CSV 的解析與彙總。
// 下載端點與實際欄名見 scraper/fixtures/ardata-notes.md（Task 1 偵察）。
// 欄位格式依 data.gov.tw dataset 129494（政治獻金會計報告書）之公開欄位；
// 解析為 header-driven，欄序改變不影響，欄名變體加進 HEADER_ALIASES。

export interface DonationRow {
  account: string;      // 擬參選人/政黨（專戶名＝姓名）
  electionName: string; // 選舉名稱
  reportSeq: string;    // 申報序次(年度)
  category: string;     // 收支科目
  counterparty: string; // 捐贈者/支出對象
  income: number;       // 收入金額（元）
  expense: number;      // 支出金額（元）
}

export interface TopDonor { donorName: string; donorType: string; amount: number; rank: number; }

export interface AccountSummary {
  name: string; electionName: string; reportSeq: string;
  totalIncome: number; totalExpense: number;
  incomeByType: Record<string, number>;
  expenseByType: Record<string, number>;
  topDonors: TopDonor[];
}

// 欄名 → 內部鍵。左邊列出目前已知變體；遇到新變體加在這裡。
const HEADER_ALIASES: Record<string, keyof DonationRow> = {
  '擬參選人/政黨': 'account', '擬參選人／政黨': 'account', '政黨/擬參選人': 'account',
  '選舉名稱': 'electionName',
  '申報序次(年度)': 'reportSeq', '申報序次／年度': 'reportSeq', '申報序次': 'reportSeq',
  '收支科目': 'category',
  '捐贈者/支出對象': 'counterparty', '捐贈者／支出對象': 'counterparty',
  '收入金額': 'income', '支出金額': 'expense',
};

/** RFC4180 風格 CSV 拆列（支援雙引號包裹、引號內逗號與換行、"" 跳脫）。 */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const toAmount = (s: string): number => {
  const digits = String(s ?? '').replace(/[^\d]/g, '');
  return digits ? Number.parseInt(digits, 10) : 0;
};

export function parseArdataCsv(text: string): DonationRow[] {
  const table = splitCsv(text.replace(/^\uFEFF/, ''));
  if (table.length === 0) return [];
  const header = table[0].map((h) => h.trim());
  const idx = new Map<keyof DonationRow, number>();
  header.forEach((h, i) => { const k = HEADER_ALIASES[h]; if (k && !idx.has(k)) idx.set(k, i); });
  const missing = (['account', 'electionName', 'category', 'counterparty', 'income', 'expense'] as const)
    .filter((k) => !idx.has(k));
  if (missing.length) throw new Error(`ardata CSV 缺必要欄位: ${missing.join(',')}（header: ${header.join('|')}）`);
  const cell = (r: string[], k: keyof DonationRow) => (idx.has(k) ? (r[idx.get(k)!] ?? '').trim() : '');
  return table.slice(1).map((r) => ({
    account: cell(r, 'account'),
    electionName: cell(r, 'electionName'),
    reportSeq: cell(r, 'reportSeq'),
    category: cell(r, 'category'),
    counterparty: cell(r, 'counterparty'),
    income: toAmount(cell(r, 'income')),
    expense: toAmount(cell(r, 'expense')),
  })).filter((r) => r.account !== '');
}

// 收支科目 → 捐贈者類別（大額捐贈者表用）。匿名/其他不進捐贈者表。
const DONOR_TYPE_BY_CATEGORY: Record<string, string> = {
  '個人捐贈收入': '個人',
  '營利事業捐贈收入': '營利事業',
  '政黨捐贈收入': '政黨',
  '人民團體捐贈收入': '人民團體',
};

export function aggregateAccounts(rows: DonationRow[], topIndividuals = 20): AccountSummary[] {
  const byAccount = new Map<string, DonationRow[]>();
  for (const r of rows) {
    const key = `${r.account} ${r.electionName}`;
    (byAccount.get(key) ?? byAccount.set(key, []).get(key)!).push(r);
  }
  const out: AccountSummary[] = [];
  for (const group of byAccount.values()) {
    const s: AccountSummary = {
      name: group[0].account, electionName: group[0].electionName, reportSeq: group[0].reportSeq,
      totalIncome: 0, totalExpense: 0, incomeByType: {}, expenseByType: {}, topDonors: [],
    };
    const donorAmounts = new Map<string, { donorName: string; donorType: string; amount: number }>();
    for (const r of group) {
      s.totalIncome += r.income;
      s.totalExpense += r.expense;
      if (r.income > 0) s.incomeByType[r.category] = (s.incomeByType[r.category] ?? 0) + r.income;
      if (r.expense > 0) s.expenseByType[r.category] = (s.expenseByType[r.category] ?? 0) + r.expense;
      const donorType = DONOR_TYPE_BY_CATEGORY[r.category];
      if (donorType && r.income > 0 && r.counterparty) {
        const k = `${donorType} ${r.counterparty}`;
        const d = donorAmounts.get(k) ?? { donorName: r.counterparty, donorType, amount: 0 };
        d.amount += r.income;
        donorAmounts.set(k, d);
      }
    }
    const donors = [...donorAmounts.values()].sort((a, b) => b.amount - a.amount);
    const individuals = donors.filter((d) => d.donorType === '個人').slice(0, topIndividuals);
    const kept = new Set(individuals);
    s.topDonors = donors
      .filter((d) => d.donorType !== '個人' || kept.has(d))
      .map((d, i) => ({ ...d, rank: i + 1 }));
    out.push(s);
  }
  return out;
}
```

- [ ] **Step 5: 跑測試確認 pass**

Run: `pnpm vitest run scraper/test/ardata.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 6: Commit**

```bash
git add scraper/lib/ardata.ts scraper/test/ardata.test.ts scraper/fixtures/ardata-sample.csv
git commit -m "feat(donations): ardata CSV 解析+專戶彙總(營利事業全列/個人前20/匿名不列名)"
```

---

### Task 3: Migration `0007_donations.sql`

**Files:**
- Create: `supabase/migrations/0007_donations.sql`

**Interfaces:**
- Produces: 表 `donation_reports`（unique (official_id, election_name)）、`donation_top_donors`。Task 5 寫入、Task 6 匯出時 select。

- [ ] **Step 1: 寫 migration**

```sql
-- 政治獻金（監察院 ardata 整批下載，彙總後入庫）。逐筆明細不入庫；
-- 每人每選舉一列摘要 + 大額捐贈者（營利事業全列、個人前20、匿名不列名）。
create table donation_reports (
  id uuid primary key default gen_random_uuid(),
  official_id uuid not null references officials(id) on delete cascade,
  election_name text not null,           -- 如「第11屆立法委員選舉」
  report_seq text not null default '',   -- 申報序次(年度)
  total_income bigint not null,
  total_expense bigint not null,
  income_by_type jsonb not null default '{}'::jsonb,   -- 收支科目 → 小計(元)
  expense_by_type jsonb not null default '{}'::jsonb,
  source_id uuid not null references sources(id),
  unique (official_id, election_name)    -- 去重鍵：同人同選舉不重覆
);

create table donation_top_donors (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references donation_reports(id) on delete cascade,
  donor_name text not null,
  donor_type text not null,              -- 個人/營利事業/政黨/人民團體
  amount bigint not null,                -- 同一捐贈者多筆加總（元）
  rank int not null
);
create index donation_top_donors_report_idx on donation_top_donors (report_id);

-- RLS：公開唯讀，寫入只走 service role，與既有表一致
alter table donation_reports enable row level security;
alter table donation_top_donors enable row level security;
create policy "public read" on donation_reports for select using (true);
create policy "public read" on donation_top_donors for select using (true);
```

- [ ] **Step 2: 套用並驗證**

```bash
supabase migration up 2>/dev/null || supabase db push --local
psql "$(supabase status --output json 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)["DB_URL"])' 2>/dev/null || echo postgresql://postgres:postgres@127.0.0.1:54322/postgres)" \
  -c "\d donation_reports" -c "\d donation_top_donors"
```

Expected: 兩張表的欄位定義如上（含 unique constraint 與 index）。若 `supabase migration up` 不適用本專案版本，改用專案慣用的 `supabase db reset`（會重跑全部 migrations + seed，再跑 `pnpm run seed:from-json` 還原資料——先確認 seed 流程再選）。

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_donations.sql
git commit -m "feat(donations): donation_reports + donation_top_donors 表"
```

---

### Task 4: 身分比對 `scraper/lib/ardata-match.ts`

**Files:**
- Create: `scraper/lib/ardata-match.ts`
- Test: `scraper/test/ardata-match.test.ts`

**Interfaces:**
- Consumes: `AccountSummary`（Task 2，只用 name/electionName）。
- Produces:
  - `interface OfficialLite { id: string; name: string; office_type: 'legislator' | 'mayor_magistrate' | 'councilor'; district: string; is_incumbent: boolean; }`
  - `type MatchResult = { status: 'matched'; officialId: string } | { status: 'none' | 'ambiguous'; reason: string }`
  - `matchAccount(account: { name: string; electionName: string }, officials: OfficialLite[]): MatchResult`

比對原則（寧缺勿錯，見 memory「判決須確認本人」同一精神）：姓名完全相等＋選舉名稱蘊含的公職類型與 official 的 office_type 一致＋現任者。同名同職類多於一人 → ambiguous（進 review 清單，人工處理）。

- [ ] **Step 1: 寫 failing test**

`scraper/test/ardata-match.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { matchAccount, officeTypeOfElection, type OfficialLite } from '../lib/ardata-match';

const offs: OfficialLite[] = [
  { id: 'L1', name: '王測試', office_type: 'legislator', district: '臺北市第1選舉區', is_incumbent: true },
  { id: 'C1', name: '王測試', office_type: 'councilor', district: '南投縣第02選舉區', is_incumbent: true },
  { id: 'C2', name: '李試驗', office_type: 'councilor', district: '南投縣第02選舉區', is_incumbent: true },
  { id: 'C3', name: '李試驗', office_type: 'councilor', district: '彰化縣第03選舉區', is_incumbent: true },
  { id: 'M1', name: '張首長', office_type: 'mayor_magistrate', district: '基隆市', is_incumbent: true },
  { id: 'X1', name: '陳離任', office_type: 'legislator', district: '新北市第2選舉區', is_incumbent: false },
];

describe('officeTypeOfElection', () => {
  it('從選舉名稱推公職類型', () => {
    expect(officeTypeOfElection('第11屆立法委員選舉')).toBe('legislator');
    expect(officeTypeOfElection('第11屆立法委員臺北市第6選舉區缺額補選')).toBe('legislator');
    expect(officeTypeOfElection('111年地方公職人員選舉(縣市議員)')).toBe('councilor');
    expect(officeTypeOfElection('111年地方公職人員選舉(直轄市議員)')).toBe('councilor');
    expect(officeTypeOfElection('111年地方公職人員選舉(縣市長)')).toBe('mayor_magistrate');
    expect(officeTypeOfElection('111年地方公職人員選舉(直轄市長)')).toBe('mayor_magistrate');
    expect(officeTypeOfElection('第16任總統副總統選舉')).toBeNull();
  });
});

describe('matchAccount', () => {
  it('同名不同職類 → 由選舉類型分離', () => {
    expect(matchAccount({ name: '王測試', electionName: '第11屆立法委員選舉' }, offs))
      .toEqual({ status: 'matched', officialId: 'L1' });
    expect(matchAccount({ name: '王測試', electionName: '111年地方公職人員選舉(縣市議員)' }, offs))
      .toEqual({ status: 'matched', officialId: 'C1' });
  });
  it('同名同職類多人 → ambiguous', () => {
    const r = matchAccount({ name: '李試驗', electionName: '111年地方公職人員選舉(縣市議員)' }, offs);
    expect(r.status).toBe('ambiguous');
  });
  it('查無此人 / 選舉類型不明 → none', () => {
    expect(matchAccount({ name: '不存在', electionName: '第11屆立法委員選舉' }, offs).status).toBe('none');
    expect(matchAccount({ name: '王測試', electionName: '第16任總統副總統選舉' }, offs).status).toBe('none');
  });
  it('非現任不掛', () => {
    expect(matchAccount({ name: '陳離任', electionName: '第11屆立法委員選舉' }, offs).status).toBe('none');
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `pnpm vitest run scraper/test/ardata-match.test.ts`
Expected: FAIL — `Cannot find module '../lib/ardata-match'`

- [ ] **Step 3: 實作**

`scraper/lib/ardata-match.ts`：

```ts
// ardata 專戶 → officials 身分比對。寧缺勿錯：只在「姓名完全相等 + 選舉類型與
// office_type 一致 + 現任 + 唯一」時 matched；其餘 none/ambiguous 進 review 清單。
export interface OfficialLite {
  id: string; name: string;
  office_type: 'legislator' | 'mayor_magistrate' | 'councilor';
  district: string; is_incumbent: boolean;
}

export type MatchResult =
  | { status: 'matched'; officialId: string }
  | { status: 'none' | 'ambiguous'; reason: string };

/** 從 ardata 選舉名稱推公職類型；認不出（總統、山地原民鄉長等）回 null。 */
export function officeTypeOfElection(electionName: string): OfficialLite['office_type'] | null {
  const s = electionName ?? '';
  if (/立法委員/.test(s)) return 'legislator';
  if (/議員/.test(s)) return 'councilor';
  if (/(縣市長|直轄市長|市長|縣長)/.test(s)) return 'mayor_magistrate';
  return null;
}

export function matchAccount(
  account: { name: string; electionName: string },
  officials: OfficialLite[],
): MatchResult {
  const office = officeTypeOfElection(account.electionName);
  if (!office) return { status: 'none', reason: `選舉類型不明: ${account.electionName}` };
  const hits = officials.filter(
    (o) => o.is_incumbent && o.name === account.name && o.office_type === office,
  );
  if (hits.length === 1) return { status: 'matched', officialId: hits[0].id };
  if (hits.length === 0) return { status: 'none', reason: '查無同名現任者' };
  return {
    status: 'ambiguous',
    reason: `同名同職類 ${hits.length} 人: ${hits.map((h) => h.district).join(' / ')}`,
  };
}
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `pnpm vitest run scraper/test/ardata-match.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add scraper/lib/ardata-match.ts scraper/test/ardata-match.test.ts
git commit -m "feat(donations): 專戶身分比對(姓名+選舉類型+現任+唯一,寧缺勿錯)"
```

---

### Task 5: 入庫腳本 `scraper/donations-record.ts` ＋ 實際執行

**Files:**
- Create: `scraper/donations-record.ts`
- Modify: `package.json`（scripts 加 `"donations:record": "tsx scraper/donations-record.ts"`）
- Output: `scraper/out-ardata/match-review.json`（review 清單，gitignored）

**Interfaces:**
- Consumes: `parseArdataCsv` / `aggregateAccounts`（Task 2）、`matchAccount` / `OfficialLite`（Task 4）、Task 1 的 `scraper/out-ardata/*.csv`、Task 3 的兩張表。
- Produces: DB 資料。去重鍵 `(official_id, election_name)`（DB unique constraint 兜底）。

- [ ] **Step 1: 寫腳本**

腳本模式沿用 `scraper/judgments-record.ts`（loadEnv、service role、DRY_RUN、可重跑）：

```ts
// 政治獻金入庫 — 讀 scraper/out-ardata/*.csv（Task 1 整批下載，UTF-8），
// 解析→彙總→比對→寫 sources + donation_reports + donation_top_donors。
// 寧缺勿錯：none/ambiguous 全部寫進 out-ardata/match-review.json 供人工檢視，不入庫。
//   pnpm run donations:record            # 寫入
//   DRY_RUN=1 pnpm run donations:record  # 只檢查不寫
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { parseArdataCsv, aggregateAccounts, type AccountSummary } from './lib/ardata';
import { matchAccount, type OfficialLite } from './lib/ardata-match';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, 'out-ardata');
// ardata 專戶查詢頁（整批檔的人類可核對入口）；實際樣式見 scraper/fixtures/ardata-notes.md
const SOURCE_URL = 'https://ardata.cy.gov.tw/home';
const RETRIEVED_AT = '2026-07-23'; // Task 1 下載日

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.csv'));
  if (files.length === 0) throw new Error(`no CSVs in ${DATA_DIR} — 先完成 Task 1 整批下載`);
  // 整批包內可能混有彙總表/資產負債表等不同欄位的 CSV：解析不了的檔跳過並列出，
  // 只要有至少一個明細檔成功即可。
  const rows: ReturnType<typeof parseArdataCsv> = [];
  for (const f of files) {
    try { rows.push(...parseArdataCsv(readFileSync(join(DATA_DIR, f), 'utf8'))); }
    catch (e) { console.log(`⤫ 跳過 ${f}: ${(e as Error).message}`); }
  }
  if (rows.length === 0) throw new Error('沒有任何明細列被解析出來 — 檢查欄名/編碼(ardata-notes.md)');
  const summaries = aggregateAccounts(rows);
  console.log(`${files.length} 檔 / ${rows.length} 列 / ${summaries.length} 專戶`);

  // 收支科目 smoke：列出全部科目，人工確認有無「捐贈收入」類的新科目需補進
  // DONOR_TYPE_BY_CATEGORY（否則該類捐贈者不會進大額捐贈者表）。
  console.log('收支科目一覽:', [...new Set(rows.map((r) => r.category))].sort().join('、'));

  const { data: offs, error } = await sb.from('officials')
    .select('id, name, office_type, district, is_incumbent');
  if (error) throw new Error(`officials query failed: ${error.message}`);
  const officials = offs as OfficialLite[];

  const review: Array<{ account: AccountSummary; status: string; reason: string }> = [];
  let inserted = 0, dup = 0;
  for (const s of summaries) {
    const m = matchAccount({ name: s.name, electionName: s.electionName }, officials);
    if (m.status !== 'matched') {
      review.push({ account: { ...s, topDonors: [] }, status: m.status, reason: m.reason });
      continue;
    }
    const { data: existing } = await sb.from('donation_reports')
      .select('id').eq('official_id', m.officialId).eq('election_name', s.electionName);
    if ((existing ?? []).length > 0) { dup++; continue; }
    if (process.env.DRY_RUN) { inserted++; console.log('✓(dry)', s.name, s.electionName, s.totalIncome); continue; }

    const { data: src, error: se } = await sb.from('sources')
      .insert({ url: SOURCE_URL, type: 'gov', title: `監察院政治獻金公開查閱平臺 ${s.electionName} ${s.name}`, retrieved_at: RETRIEVED_AT })
      .select('id').single();
    if (se) throw new Error(`source insert: ${se.message}`);
    const { data: rep, error: re } = await sb.from('donation_reports').insert({
      official_id: m.officialId, election_name: s.electionName, report_seq: s.reportSeq,
      total_income: s.totalIncome, total_expense: s.totalExpense,
      income_by_type: s.incomeByType, expense_by_type: s.expenseByType, source_id: src.id,
    }).select('id').single();
    if (re) throw new Error(`report insert (${s.name}): ${re.message}`);
    if (s.topDonors.length) {
      const { error: de } = await sb.from('donation_top_donors').insert(
        s.topDonors.map((d) => ({ report_id: rep.id, donor_name: d.donorName, donor_type: d.donorType, amount: d.amount, rank: d.rank })),
      );
      if (de) throw new Error(`donors insert (${s.name}): ${de.message}`);
    }
    inserted++; console.log('●', s.name, s.electionName, `收 ${s.totalIncome} / 支 ${s.totalExpense} / 大額 ${s.topDonors.length}`);
  }

  const reviewPath = join(DATA_DIR, 'match-review.json');
  writeFileSync(reviewPath, JSON.stringify(review, null, 2));
  console.log(`\n完成：入庫 ${inserted}、已存在 ${dup}、待人工 ${review.length} → ${reviewPath}`);
  if (!process.env.DRY_RUN && inserted) console.log('記得 pnpm run export:data 重匯出 officials.json。');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 加 package script**

`package.json` scripts 的 `"judgments:record"` 之後加：

```json
"donations:record": "tsx scraper/donations-record.ts"
```

- [ ] **Step 3: DRY_RUN 驗證**

Run: `DRY_RUN=1 pnpm run donations:record`
Expected: 印出檔數/列數/專戶數、收支科目一覽（人工掃一眼有無未預期科目——若有新的捐贈收入科目，回 Task 2 把它加進 `DONOR_TYPE_BY_CATEGORY` 並補測試）、`✓(dry)` 若干、`待人工 N`。落選人/未收錄者會大量落在 `none`，屬預期（整包含所有參選人）；重點檢查 `ambiguous` 清單是否合理。

- [ ] **Step 4: 實際寫入**

Run: `pnpm run donations:record`
Expected: `入庫 N`（N 應與 dry run 的 inserted 一致）、無 throw。抽查 2 位（一位立委、一位議員）：

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
  select o.name, r.election_name, r.total_income, r.total_expense,
         (select count(*) from donation_top_donors d where d.report_id = r.id) donors
  from donation_reports r join officials o on o.id = r.official_id limit 5;"
```

並與 ardata 網站上同一人的公開數字人工核對至少 1 位。

- [ ] **Step 5: Commit**

```bash
git add scraper/donations-record.ts package.json
git commit -m "feat(donations): 入庫腳本(彙總+比對+review清單,可重跑)"
```

---

### Task 6: 匯出管線（types / transform / validate / export）

**Files:**
- Modify: `src/lib/types.ts`（Official / RawOfficial 加 donations）
- Modify: `src/lib/transform.ts`（toOfficial 映射）
- Modify: `src/lib/validate.ts`（donations 驗證）
- Modify: `scraper/export-officials.ts`（SELECT 加關聯）
- Test: `test/transform.test.ts`、`test/validate.test.ts`（擴充既有檔）

**Interfaces:**
- Consumes: Task 3 的表、Task 5 的資料。
- Produces（site 端型別，Task 7 用）:
  - `interface DonationDonor { donorName: string; donorType: string; amount: number; rank: number; }`
  - `interface DonationReport { id: string; electionName: string; reportSeq: string; totalIncome: number; totalExpense: number; incomeByType: Record<string, number>; expenseByType: Record<string, number>; topDonors: DonationDonor[]; source: Source; }`
  - `Official.donations: DonationReport[]`

- [ ] **Step 1: 寫 failing test（transform）**

`test/transform.test.ts` 的 `raw` 物件（見檔內既有 fixture）加欄位：

```ts
donation_reports: [{
  id: 'd1', election_name: '第11屆立法委員選舉', report_seq: '1',
  total_income: 533000, total_expense: 200000,
  income_by_type: { 個人捐贈收入: 230000, 營利事業捐贈收入: 300000, 匿名捐贈: 3000 },
  expense_by_type: { 宣傳支出: 200000 },
  source: rawSrc,
  donation_top_donors: [
    { donor_name: '陳大文', donor_type: '個人', amount: 150000, rank: 2 },
    { donor_name: '大安建設', donor_type: '營利事業', amount: 300000, rank: 1 },
  ],
}],
```

同檔加測試：

```ts
it('maps donation reports and sorts donors by rank', () => {
  const o = toOfficial(raw);
  expect(o.donations).toHaveLength(1);
  const d = o.donations[0];
  expect(d.electionName).toBe('第11屆立法委員選舉');
  expect(d.totalIncome).toBe(533000);
  expect(d.incomeByType['營利事業捐贈收入']).toBe(300000);
  expect(d.topDonors.map((x) => x.donorName)).toEqual(['大安建設', '陳大文']); // rank 排序
  expect(d.source.retrievedAt).toBe('2026-01-01');
});
it('tolerates missing donation_reports (old raw rows)', () => {
  const o = toOfficial({ ...raw, donation_reports: undefined } as unknown as RawOfficial);
  expect(o.donations).toEqual([]);
});
```

`test/validate.test.ts` 加（比照檔內既有 case 寫法，用該檔現成的合法 Official fixture 改造）：

```ts
it('flags donation report without source', () => {
  const bad = {
    ...valid,
    donations: [{ id: 'd1', electionName: 'x', reportSeq: '', totalIncome: 1, totalExpense: 0,
      incomeByType: {}, expenseByType: {}, topDonors: [], source: undefined as unknown as Source }],
  };
  expect(validateOfficial(bad).some((e) => e.includes('donation'))).toBe(true);
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `pnpm vitest run test/transform.test.ts test/validate.test.ts`
Expected: FAIL（type error / o.donations undefined）

- [ ] **Step 3: 實作**

`src/lib/types.ts` — `AssetDeclaration` 之後加：

```ts
export interface DonationDonor { donorName: string; donorType: string; amount: number; rank: number; }
export interface DonationReport {
  id: string; electionName: string; reportSeq: string;
  totalIncome: number; totalExpense: number;
  incomeByType: Record<string, number>; expenseByType: Record<string, number>;
  topDonors: DonationDonor[]; source: Source;
}
```

`Official` 加 `donations: DonationReport[];`（放 `assets` 之後）。
`RawOfficial` 加：

```ts
donation_reports: { id: string; election_name: string; report_seq: string; total_income: number; total_expense: number; income_by_type: Record<string, number>; expense_by_type: Record<string, number>; source: RawSource; donation_top_donors: { donor_name: string; donor_type: string; amount: number; rank: number }[] }[];
```

`src/lib/transform.ts` — `toOfficial` 回傳物件 `assets` 之後加：

```ts
donations: (r.donation_reports ?? [])
  .map((d) => ({
    id: d.id, electionName: d.election_name, reportSeq: d.report_seq,
    totalIncome: d.total_income, totalExpense: d.total_expense,
    incomeByType: d.income_by_type ?? {}, expenseByType: d.expense_by_type ?? {},
    topDonors: (d.donation_top_donors ?? [])
      .map((t) => ({ donorName: t.donor_name, donorType: t.donor_type, amount: t.amount, rank: t.rank }))
      .sort((a, b) => a.rank - b.rank),
    source: toSource(d.source),
  })),
```

`src/lib/validate.ts` — `validateOfficial` 的 assets 迴圈之後加：

```ts
for (const d of o.donations ?? []) {
  if (!d.source) errors.push(`donation ${d.id}: missing source`);
  if (!d.electionName?.trim()) errors.push(`donation ${d.id}: missing electionName`);
  if (d.totalIncome < 0 || d.totalExpense < 0) errors.push(`donation ${d.id}: negative total`);
}
```

`scraper/export-officials.ts` — `SELECT` 的 `asset_declarations (...)` 之後加一行：

```
donation_reports ( id, election_name, report_seq, total_income, total_expense, income_by_type, expense_by_type, source:sources(*), donation_top_donors ( donor_name, donor_type, amount, rank ) )
```

- [ ] **Step 4: 跑全部測試**

Run: `pnpm test`
Expected: 全 PASS（既有測試不壞——`donations ?? []` 讓舊 fixture 不需全改；若有測試因缺 `donation_reports` 掛 type error，該 fixture 補 `donation_reports: []`）。

- [ ] **Step 5: 重匯出並檢查**

```bash
pnpm run export:data
python3 - <<'EOF'
import json
d = json.load(open('src/data/officials.json'))
withd = [o for o in d if o.get('donations')]
print('officials with donations:', len(withd))
print(json.dumps(withd[0]['donations'][0], ensure_ascii=False)[:400])
EOF
```

Expected: `officials with donations` > 0，且樣本欄位齊全（electionName/totalIncome/topDonors/source）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/transform.ts src/lib/validate.ts scraper/export-officials.ts \
        test/transform.test.ts test/validate.test.ts src/data/officials.json src/data/meta.json
git commit -m "feat(donations): 匯出管線 donations 欄位(types/transform/validate/export)"
```

---

### Task 7: Official 頁「政治獻金」區塊

**Files:**
- Modify: `src/pages/officials/[id].astro`

**Interfaces:**
- Consumes: `Official.donations`（Task 6）、既有 `Sources` component、既有 `fmt`。

- [ ] **Step 1: 加區塊**

在「財產申報」`</section>` 之後、`{relations.length > 0 && (` 之前插入：

```astro
<section class="sec">
  <h2>政治獻金</h2>
  {o.officeType === "legislator" && /不分區|全國/.test(o.district) ? (
    <p class="dim none">不分區立法委員之政治獻金依法申報於推薦政黨名下，無個人專戶。</p>
  ) : o.donations.length === 0 ? (
    <p class="dim none">尚無資料（查無其現任該席選舉之申報專戶）</p>
  ) : (
    o.donations.map((d) => (
      <article class="card entry">
        <div class="entry-head">{d.electionName}</div>
        <div class="entry-meta">
          總收入 <span class="num">NT$ {fmt(d.totalIncome)}</span>　
          總支出 <span class="num">NT$ {fmt(d.totalExpense)}</span>
        </div>
        <div class="don-types">
          {Object.entries(d.incomeByType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div class="don-type"><span class="don-label">{k}</span><span class="num">NT$ {fmt(v)}</span></div>
          ))}
        </div>
        {d.topDonors.length > 0 && (
          <details class="don-donors">
            <summary>大額捐贈者（營利事業全列、個人前 20）</summary>
            <table>
              <thead><tr><th>捐贈者</th><th>類別</th><th class="amt">金額</th></tr></thead>
              <tbody>
                {d.topDonors.map((t) => (
                  <tr><td>{t.donorName}</td><td>{t.donorType}</td><td class="amt num">NT$ {fmt(t.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        <Sources sources={[d.source]} />
      </article>
    ))
  )}
  {o.donations.length > 0 && (
    <p class="note">金額由程式彙總監察院政治獻金公開查閱平臺整批電子檔，分類依申報之收支科目；請點出處至平臺核對原始明細。</p>
  )}
</section>
```

`<style>` 內（`.rel-src:hover` 之後）加：

```css
.don-types { margin: 8px 0 4px; font-size: 13px; }
.don-type { display: flex; gap: 10px; }
.don-type .don-label { color: var(--muted); min-width: 9em; }
.don-donors { margin: 8px 0 4px; font-size: 13px; }
.don-donors summary { cursor: pointer; color: var(--muted); }
.don-donors table { border-collapse: collapse; margin-top: 6px; width: 100%; max-width: 480px; }
.don-donors th, .don-donors td { text-align: left; padding: 3px 8px 3px 0; border-bottom: 1px solid var(--line); }
.don-donors .amt { text-align: right; }
```

- [ ] **Step 2: Build 驗證**

Run: `pnpm run build`
Expected: build 成功。再 `pnpm run preview` 開任一有獻金資料的 official 頁（用 Task 6 Step 5 印出的那位的 slug），確認區塊顯示：選舉名、總收支、分類小計、可展開的大額捐贈者表、出處連結；另開一位不分區立委頁確認顯示政黨名下說明。

- [ ] **Step 3: 全測試 + Commit**

Run: `pnpm test`
Expected: PASS

```bash
git add src/pages/officials/[id].astro
git commit -m "feat(donations): official 頁政治獻金區塊(摘要+分類+大額捐贈者)"
```
