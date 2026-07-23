import { describe, it, expect } from 'vitest';
import { toOfficial, toListRow } from '../src/lib/transform';
import type { RawOfficial, RawSource } from '../src/lib/types';

const rawSrc: RawSource = { id: 's1', url: 'https://x', type: 'court', title: 't', retrieved_at: '2026-01-01' };

const raw: RawOfficial = {
  id: 'o1', slug: 'o1', name: '王〇〇', party: '民眾黨', office_type: 'legislator', district: '中市5', departed_reason: null,
  term: '11', photo_url: null, bio: '企業主', is_incumbent: true,
  careers: [{ id: 'k1', title: '董事長', organization: 'ACME', start_date: '2010', end_date: null, source: rawSrc }],
  judgments: [{ id: 'j1', case_reason: '背信', court: '中院', case_number: '110-1', outcome: '一審有罪', is_final: false, judgment_date: '2024-03-01', judgment_url: 'https://j', source: rawSrc }],
  controversies: [{ id: 'c1', title: '爭議', summary: '摘要', status: 'indicted', event_date: '2023-01-01', report_date: '2023-02-01', controversy_sources: [{ source: rawSrc }, { source: rawSrc }] }],
  asset_declarations: [
    { id: 'a1', year: 2023, source: rawSrc, asset_items: [] },
    { id: 'a2', year: 2024, source: rawSrc, asset_items: [{ category: 'deposit', amount: 580000000, label: null }] },
  ],
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
};

describe('toOfficial', () => {
  it('maps snake_case to camelCase and nests sources', () => {
    const o = toOfficial(raw);
    expect(o.officeType).toBe('legislator');
    expect(o.careers[0].source.retrievedAt).toBe('2026-01-01');
    expect(o.judgments[0].isFinal).toBe(false);
    expect(o.controversies[0].sources).toHaveLength(2);
    expect(o.assets[0].items[0].amount).toBe(580000000); // assets sorted newest-year-first → 2024 at index 0
  });

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
