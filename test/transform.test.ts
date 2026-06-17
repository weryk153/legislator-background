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
