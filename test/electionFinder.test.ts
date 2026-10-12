import { describe, expect, it } from 'vitest';
import { electionCandidates, filterElectionCandidates, type ElectionCandidate } from '../src/lib/electionFinder';
import type { NationalCandidates, CountyCandidates } from '../src/lib/candidateTypes';

const rows: ElectionCandidate[] = [
  { name: '戴瑋姍', party: '甲', county: '臺北市', countyCode: 'a', office: 'chief', district: '臺北市長', slug: 'you', countyHref: '/a/', number: null },
  { name: '陳甲', party: '乙', county: '臺北市', countyCode: 'a', office: 'council', district: '第一選區', slug: null, countyHref: '/a/', number: 2 },
  { name: '陳甲', party: '甲', county: '臺南市', countyCode: 'b', office: 'council', district: '第三選區', slug: 'chen', countyHref: '/b/', number: 1 },
];
describe('candidate finder', () => {
  it('組合縣市、職務、姓名條件，保留無個人檔案者', () => {
    expect(filterElectionCandidates(rows, { county: 'a', office: 'council', query: ' 陳 ' })).toEqual([rows[1]]);
  });
  it('支援姓名異體字，不跨用政黨或其他欄位搜尋', () => {
    expect(filterElectionCandidates(rows, { county: '', office: '', query: '戴瑋姗' })).toEqual([rows[0]]);
    expect(filterElectionCandidates(rows, { county: '', office: '', query: '第一選區' })).toEqual([]);
  });
  it('同名不同選區不合併，空白條件保留原始順序', () => {
    expect(filterElectionCandidates(rows, { county: '', office: '', query: '陳甲' })).toEqual(rows.slice(1));
    expect(filterElectionCandidates(rows, { county: '', office: '', query: '  ' })).toEqual(rows);
  });
  it('轉換首長及議員名冊，保留號次、無黨籍與所屬選區', () => {
    const source = { stage: 'registration' as const, url: '/source', tableDate: '2026-09-04' };
    const candidate = { name: '候選人', partyName: '無', partyCode: null, number: null, registeredOn: '', slug: null, identity: null };
    const national: NationalCandidates = { source, races: [{ countyCode: '63-000-00-000-0000', countyName: '臺北市', isMunicipality: true, candidates: [candidate], incumbent2022: null }] };
    const councils: CountyCandidates[] = [{ source, countyCode: national.races[0].countyCode, countyName: '臺北市', districts: [{ no: 1, label: '第一選區', type: 'regional', candidates: [{ ...candidate, number: 3 }] }], townToDistrict: null, splitTowns: [], mappingNote: null }];
    const result = electionCandidates(national, councils);
    expect(result.map(c => [c.office, c.district, c.party, c.number, c.slug])).toEqual([['chief', '臺北市長', '無黨籍', null, null], ['council', '第一選區', '無黨籍', 3, null]]);
    expect(result.every(c => c.countyHref === '/elections/2026/taipei/')).toBe(true);
  });
});
