import { describe, expect, it } from 'vitest';
import { electionCandidates, electionCandidateGroupKey, electionDistrictAreas, filterElectionCandidates, groupElectionCandidates, visibleElectionGroups, type ElectionCandidate } from '../src/lib/electionFinder';
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
  it('選區篩選同時使用縣市與職務身分，仍可搭配姓名搜尋', () => {
    const other = { ...rows[2], district: rows[1].district };
    expect(filterElectionCandidates([...rows, other], { county: '', office: '', query: '陳', districtKey: electionCandidateGroupKey(rows[1]) })).toEqual([rows[1]]);
    expect(filterElectionCandidates(rows, { county: 'a', office: '', query: '不存在', districtKey: electionCandidateGroupKey(rows[1]) })).toEqual([]);
  });
  it('支援姓名異體字，不跨用政黨或其他欄位搜尋', () => {
    expect(filterElectionCandidates(rows, { county: '', office: '', query: '戴瑋姗' })).toEqual([rows[0]]);
    expect(filterElectionCandidates(rows, { county: '', office: '', query: '第一選區' })).toEqual([]);
  });
  it('同名不同選區不合併，空白條件保留原始順序', () => {
    expect(filterElectionCandidates(rows, { county: '', office: '', query: '陳甲' })).toEqual(rows.slice(1));
    expect(filterElectionCandidates(rows, { county: '', office: '', query: '  ' })).toEqual(rows);
  });
  it('不同縣市、職務與選區不混組；同組保留名冊順序及無個人檔案者', () => {
    const otherCounty = { ...rows[2], district: rows[1].district };
    const another = { ...rows[1], name: '陳乙' };
    const groups = groupElectionCandidates([rows[0], rows[1], otherCounty, another]);
    expect(groups.map(g => g.candidates.map(c => c.name))).toEqual([['戴瑋姍'], ['陳甲', '陳乙'], ['陳甲']]);
    expect(new Set(groups.map(g => g.key)).size).toBe(3);
    expect(groups[1].candidates.every(c => c.slug === null)).toBe(true);
    expect(groupElectionCandidates([{ ...rows[0], district: '同名選區' }, { ...rows[1], district: '同名選區' }])).toHaveLength(2);
  });
  it('分頁完整顯示跨過人數上限的選區，載入更多不重複或漏人', () => {
    const groups = groupElectionCandidates([rows[0], ...Array.from({ length: 30 }, (_, i) => ({ ...rows[1], name: `候選人${i}` })), rows[2]]);
    const first = visibleElectionGroups(groups, 24);
    expect(first).toEqual(groups.slice(0, 2));
    const shownCount = first.reduce((n, g) => n + g.candidates.length, 0);
    expect(shownCount).toBe(31);
    expect(visibleElectionGroups(groups, shownCount + 24)).toEqual(groups);
    expect(visibleElectionGroups([], 24)).toEqual([]);
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

describe('選區行政區對照', () => {
  const county: CountyCandidates = {
    source: { stage: 'registration', url: '/source', tableDate: '2026-09-04' }, countyCode: 'a', countyName: '甲市',
    districts: [
      { no: 1, label: '第1選舉區', type: 'regional', candidates: [] },
      { no: 2, label: '第2選舉區（平地原住民）', type: 'plainIndigenous', candidates: [] },
    ], townToDistrict: { town2: 1, town1: 1, missing: 1, indigenous: 2 }, splitTowns: [], mappingNote: null,
  };
  const names = new Map([['town1', '甲區'], ['town2', '乙區'], ['indigenous', '不可誤配區']]);
  const area = (c: CountyCandidates, i = 0) => electionDistrictAreas([c], names)[JSON.stringify(['a', 'council', c.districts[i].label])];
  it('行政區依代碼排序，缺少名稱略過；原住民選區不套用區域選區地名', () => {
    expect(area(county).towns).toEqual(['甲區', '乙區']);
    expect(area(county, 1)).toEqual({ towns: [], note: '平地原住民選區' });
  });
  it('待確認的縣市與類型不推定範圍', () => {
    expect(area({ ...county, townToDistrict: null })).toEqual({ towns: [], note: '行政區對照待確認' });
    expect(area({ ...county, districts: [{ ...county.districts[0], type: 'unknown' }] }).towns).toEqual([]);
  });
  it('跨選區行政區即使出現在對照中也排除，另附明確說明', () => {
    expect(area({ ...county, splitTowns: ['town1'] })).toEqual({ towns: ['乙區'], note: '甲區分屬多個選區，未列入行政區對照' });
  });
});
