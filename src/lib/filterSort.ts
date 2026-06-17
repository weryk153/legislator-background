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
