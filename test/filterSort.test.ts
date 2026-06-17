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
