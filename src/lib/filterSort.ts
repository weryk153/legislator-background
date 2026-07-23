import type { OfficeType, OfficialListRow } from './types';
import { normalizeNameChars } from './nameVariant';

export type SortKey = 'judgments' | 'controversies' | 'assets' | 'name';
export interface ListQuery {
  search?: string;
  region?: string;
  party?: string;
  officeType?: OfficeType;
  sort?: SortKey;
}

export function queryList(rows: OfficialListRow[], q: ListQuery): OfficialListRow[] {
  let out = rows.slice();

  if (q.region) out = out.filter((r) => r.region === q.region);
  if (q.party) out = out.filter((r) => r.party === q.party);
  if (q.officeType) out = out.filter((r) => r.officeType === q.officeType);
  if (q.search?.trim()) {
    // 異體字不敏感搜尋：查詢與姓名皆正規化後比對（如使用者輸入「戴瑋姗」仍可找到「戴瑋姍」）。
    const needle = normalizeNameChars(q.search.trim());
    out = out.filter((r) => normalizeNameChars(r.name).includes(needle));
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
