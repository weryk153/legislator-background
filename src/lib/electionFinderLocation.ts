import { countyByCode, countyByKey } from './countyKeys';

export interface FinderLocation {
  county: string;
  office: string;
  districtKey: string;
  query: string;
  limit: number;
}

/** 查詢條件隨網址保留；不接受其他縣市或職務的選區鍵。 */
export function readFinderLocation(url: URL): FinderLocation {
  const county = countyByKey(url.searchParams.get('county') ?? '')?.code ?? '';
  const rawOffice = url.searchParams.get('office');
  const office = rawOffice === 'chief' || rawOffice === 'council' ? rawOffice : '';
  let districtKey = url.searchParams.get('district') ?? '';
  try {
    const parts = JSON.parse(districtKey);
    if (!county || !Array.isArray(parts) || parts.length !== 3 || parts[0] !== county ||
      !['chief', 'council'].includes(parts[1]) || (office && parts[1] !== office) ||
      typeof parts[2] !== 'string' || !parts[2]) districtKey = '';
  } catch { districtKey = ''; }
  const limit = Number(url.searchParams.get('shown'));
  return { county, office, districtKey, query: url.searchParams.get('q') ?? '',
    limit: Number.isSafeInteger(limit) && limit >= 24 && limit <= 10000 ? limit : 24 };
}

export function finderLocationHref(url: URL, state: FinderLocation): string {
  const next = new URL(url);
  const values = { county: countyByCode(state.county)?.key ?? '', office: state.office,
    district: state.districtKey, q: state.query, shown: state.limit > 24 ? String(state.limit) : '' };
  for (const [key, value] of Object.entries(values)) {
    if (value) next.searchParams.set(key, value); else next.searchParams.delete(key);
  }
  return `${next.pathname}${next.search}${next.hash}`;
}
