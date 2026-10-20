import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { COUNTY_KEYS, type CountyKey } from './countyKeys';
import type { CountyCandidates, CouncilDistrict } from './candidateTypes';
import { electionCandidateGroupKey, electionDistrictAreas, type ElectionDistrictArea } from './electionFinder';
import { districtPagePath } from './districtPage';

export interface DistrictPageData {
  county: CountyKey;
  council: CountyCandidates;
  district: CouncilDistrict;
  area: ElectionDistrictArea;
  path: string;
}

let cache: DistrictPageData[] | undefined;
export function loadDistrictPages(): DistrictPageData[] {
  if (cache) return cache;
  const pages: DistrictPageData[] = [];
  for (const county of COUNTY_KEYS) {
    const file = join(process.cwd(), 'public/data/candidates/2026/county', `${county.code}.json`);
    if (!existsSync(file)) continue;
    const council = JSON.parse(readFileSync(file, 'utf8')) as CountyCandidates;
    const mapFile = join(process.cwd(), 'public/data/map/county', `${county.code}.json`);
    const towns = existsSync(mapFile)
      ? JSON.parse(readFileSync(mapFile, 'utf8')).areas as { code: string; name: string }[] : [];
    const areas = electionDistrictAreas([council], new Map(towns.map(t => [t.code, t.name])));
    const seen = new Set<number>();
    for (const district of council.districts) {
      if (seen.has(district.no)) throw new Error(`${county.name} 選區編號重複：${district.no}`);
      seen.add(district.no);
      const key = electionCandidateGroupKey({ countyCode: county.code, office: 'council', district: district.label });
      pages.push({ county, council, district, area: areas[key], path: districtPagePath(county.key, district.no) });
    }
  }
  return cache = pages;
}

let candidatePaths: Map<string, string> | undefined;
export function candidateDistrictPaths(): Map<string, string> {
  return candidatePaths ??= new Map(loadDistrictPages().flatMap(page =>
    page.district.candidates.flatMap(c => c.slug ? [[c.slug, page.path] as const] : [])));
}
