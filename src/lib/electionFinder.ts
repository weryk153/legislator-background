import { normalizeNameChars } from './nameVariant';
import { chiefTitle, type NationalCandidates, type CountyCandidates } from './candidateTypes';
import { countyByCode, countyPagePath } from './countyKeys';

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
    }));
    return [
      ...rows(race.candidates, 'chief', chiefTitle(race.countyName)),
      ...(councils.find(c => c.countyCode === race.countyCode)?.districts.flatMap(d => rows(d.candidates, 'council', d.label)) ?? []),
    ];
  });
}

export function filterElectionCandidates(rows: ElectionCandidate[], options: { county: string; office: string; query: string }): ElectionCandidate[] {
  const query = normalizeNameChars(options.query.trim()).toLocaleLowerCase();
  return rows.filter(row => (!options.county || row.countyCode === options.county)
    && (!options.office || row.office === options.office)
    && (!query || normalizeNameChars(row.name).toLocaleLowerCase().includes(query)));
}
