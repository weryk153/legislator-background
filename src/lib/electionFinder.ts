import { normalizeNameChars } from './nameVariant';
import { chiefTitle, type NationalCandidates, type CountyCandidates, type DistrictSource, type FirstRunEvidence } from './candidateTypes';
import { countyByCode, countyPagePath } from './countyKeys';
import { districtTowns } from './countyPage';

export interface ElectionCandidate {
  name: string;
  party: string;
  county: string;
  countyCode: string;
  office: 'chief' | 'council';
  district: string;
  slug: string | null;
  countyHref: string;
  number: number | null;
  firstRun?: FirstRunEvidence;
}

/** 保留名冊順序與未收錄個人檔案者，不依政黨或紀錄筆數排序。 */
export function electionCandidates(national: NationalCandidates, councils: CountyCandidates[]): ElectionCandidate[] {
  return national.races.flatMap(race => {
    const county = countyByCode(race.countyCode);
    if (!county) return [];
    const base = { county: race.countyName, countyCode: race.countyCode, countyHref: countyPagePath(county.key) };
    const rows = (list: typeof race.candidates, office: ElectionCandidate['office'], district: string) => list.map(c => ({
      ...base, name: c.name, party: c.partyName === '無' ? '無黨籍' : c.partyName,
      office, district, slug: c.slug, number: c.number,
      ...(c.firstRun ? { firstRun: c.firstRun } : {}),
    }));
    return [
      ...rows(race.candidates, 'chief', chiefTitle(race.countyName)),
      ...(councils.find(c => c.countyCode === race.countyCode)?.districts.flatMap(d => rows(d.candidates, 'council', d.label)) ?? []),
    ];
  });
}

export function filterElectionCandidates(rows: ElectionCandidate[], options: { county: string; office: string; query: string; districtKey?: string }): ElectionCandidate[] {
  const query = normalizeNameChars(options.query.trim()).toLocaleLowerCase();
  return rows.filter(row => (!options.county || row.countyCode === options.county)
    && (!options.office || row.office === options.office)
    && (!options.districtKey || electionCandidateGroupKey(row) === options.districtKey)
    && (!query || normalizeNameChars(row.name).toLocaleLowerCase().includes(query)));
}

export const electionCandidateGroupKey = (row: Pick<ElectionCandidate, 'countyCode' | 'office' | 'district'>): string =>
  JSON.stringify([row.countyCode, row.office, row.district]);

export interface ElectionDistrictArea { towns: string[]; note: string | null; scope?: string; source?: DistrictSource }
export interface ElectionFinderData {
  candidates: ElectionCandidate[];
  areas: Record<string, ElectionDistrictArea>;
}

/** 正式公告優先，否則延用 2022 參照；跨選區行政區不臆配到單一選區。 */
export function electionDistrictAreas(councils: CountyCandidates[], townNames: Map<string, string>): Record<string, ElectionDistrictArea> {
  const areas: Record<string, ElectionDistrictArea> = {};
  for (const county of councils) {
    const mapping = county.townToDistrict && Object.fromEntries(
      Object.entries(county.townToDistrict).filter(([code]) => !county.splitTowns.includes(code)),
    );
    const towns = districtTowns(mapping, townNames);
    const splitNames = county.splitTowns.map(code => townNames.get(code)).filter((name): name is string => !!name);
    for (const district of county.districts) {
      const key = electionCandidateGroupKey({ countyCode: county.countyCode, office: 'council', district: district.label });
      const indigenous = district.type === 'plainIndigenous' || district.type === 'mountainIndigenous';
      const names = !indigenous && district.type !== 'unknown' ? towns.get(district.no) ?? [] : [];
      let note: string | null = null;
      if (indigenous) note = `${district.type === 'plainIndigenous' ? '平地' : '山地'}原住民選區`;
      else if (!mapping || district.type === 'unknown') note = '行政區對照待確認';
      else if (!names.length) note = '尚無可顯示的行政區對照';
      if (!indigenous && county.splitTowns.length) {
        note = [note, `${splitNames.length ? splitNames.join('、') : '本縣市部分行政區'}分屬多個選區，未列入行政區對照`].filter(Boolean).join('；');
      }
      areas[key] = county.districtSource && district.scope
        ? { towns: names, note: null, scope: district.scope, source: county.districtSource }
        : { towns: names, note };
    }
  }
  return areas;
}

export interface ElectionCandidateGroup {
  key: string;
  county: string;
  office: ElectionCandidate['office'];
  district: string;
  candidates: ElectionCandidate[];
}

/** 以縣市、職務、選區分組，維持各組與組內候選人的名冊順序。 */
export function groupElectionCandidates(rows: ElectionCandidate[]): ElectionCandidateGroup[] {
  const groups = new Map<string, ElectionCandidateGroup>();
  for (const row of rows) {
    const key = electionCandidateGroupKey(row);
    let group = groups.get(key);
    if (!group) {
      group = { key, county: row.county, office: row.office, district: row.district, candidates: [] };
      groups.set(key, group);
    }
    group.candidates.push(row);
  }
  return [...groups.values()];
}

/** 人數上限是軟限制：最後一組完整呈現，不把同一選區切成兩批。 */
export function visibleElectionGroups(groups: ElectionCandidateGroup[], limit: number): ElectionCandidateGroup[] {
  const visible: ElectionCandidateGroup[] = [];
  let count = 0;
  for (const group of groups) {
    if (count >= limit) break;
    visible.push(group);
    count += group.candidates.length;
  }
  return visible;
}
