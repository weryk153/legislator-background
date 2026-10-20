import type { PolicyRecord } from './candidatePolicies';
import { countyByKey, countyPagePath } from './countyKeys';

export interface ChiefPolicyPerson {
  id: string;
  slug: string | null;
  name: string;
  party: string;
  role: string;
  records: PolicyRecord[];
}
export interface ChiefPolicyCounty {
  key: string;
  name: string;
  people: ChiefPolicyPerson[];
}
export interface ChiefPolicyState {
  county: string;
  left: string;
  right: string;
  q: string;
}
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('zh-TW').replaceAll('臺', '台').replace(/\s+/g, ' ').trim();

/** Never resolve a person outside the explicitly selected county. */
export function readChiefPolicyState(search: string, counties: ChiefPolicyCounty[], fixedCounty?: string): ChiefPolicyState {
  const params = new URLSearchParams(search);
  const county = counties.find(c => c.key === (fixedCounty ?? params.get('county')));
  if (!county) return { county: '', left: '', right: '', q: '' };
  const allowed = new Set(county.people.map(p => p.id));
  const left = allowed.has(params.get('left') ?? '') ? params.get('left')! : '';
  const requestedRight = params.get('right') ?? '';
  return {
    county: county.key,
    left,
    right: allowed.has(requestedRight) && requestedRight !== left ? requestedRight : '',
    q: (params.get('q') ?? '').trim().slice(0, 80),
  };
}

export function chiefPolicyUrl(canonical: string, state: ChiefPolicyState): string {
  const url = new URL(canonical);
  url.search = '';
  url.hash = '';
  if (state.county) {
    url.searchParams.set('county', state.county);
    if (state.left) url.searchParams.set('left', state.left);
    if (state.right && state.right !== state.left) url.searchParams.set('right', state.right);
    if (state.q.trim()) url.searchParams.set('q', state.q.trim().slice(0, 80));
  }
  return url.href;
}

/** 舊的獨立比較網址沿用人選，統一回到縣市卡片。 */
export function legacyChiefPolicyPath(search: string): string {
  const params = new URLSearchParams(search);
  const county = countyByKey(params.get('county') ?? '');
  if (!county) return '/elections/#finder-title';
  const state = { county: county.key, left: params.get('left') ?? '', right: params.get('right') ?? '', q: params.get('q') ?? '' };
  const url = new URL(chiefPolicyUrl(`https://example.test${countyPagePath(county.key)}`, state));
  return `${url.pathname}${url.search}${state.left && state.right && state.left !== state.right ? '#policy-comparison' : '#chief-title'}`;
}

/** Narrow the original records without rewriting statements or dropping qualifiers. */
export function filterChiefPolicies(records: PolicyRecord[], query: string): PolicyRecord[] {
  const q = normalize(query);
  if (!q) return records;
  return records.map(record => ({
    ...record,
    proposals: record.proposals.filter(p => normalize(record.title).includes(q) || normalize(`${p.topic} ${p.summary}`).includes(q)),
  })).filter(record => record.proposals.length > 0);
}
