import { describe, it, expect } from 'vitest';
import { selectCandidates, focusCountyCode, countyCodeOf, townCodeOf, groupDistricts } from '../src/lib/candidateView';
import type { NationalCandidates, CountyCandidates, CandidateEntry } from '../src/lib/candidateTypes';

const c = (name: string): CandidateEntry =>
  ({ name, partyName: '無', partyCode: '999', number: null, registeredOn: '2026-09-02', slug: null, identity: null });
const src = { stage: 'registration' as const, url: '', tableDate: '' };
const national: NationalCandidates = {
  source: src,
  races: [
    { countyCode: '63-000-00-000-0000', countyName: '臺北市', isMunicipality: true, candidates: [c('甲'), c('乙')], incumbent2022: null },
    { countyCode: '10-017-00-000-0000', countyName: '基隆市', isMunicipality: false, candidates: [c('丙')], incumbent2022: null },
  ],
};
const taipei: CountyCandidates = {
  source: src, countyCode: '63-000-00-000-0000', countyName: '臺北市',
  districts: [{ no: 1, label: '第1選舉區', type: 'regional', candidates: [c('丁')] }],
  townToDistrict: { '63-000-00-110-0000': 1 }, splitTowns: [], mappingNote: null,
};
const keelung: CountyCandidates = {
  source: src, countyCode: '10-017-00-000-0000', countyName: '基隆市',
  districts: [{ no: 9, label: '第9選舉區', type: 'unknown', candidates: [c('戊')] }],
  townToDistrict: null, splitTowns: [], mappingNote: '議員選區與 2022 年劃分不同',
};
const countyLayer = { parentName: '臺北市', areas: [{ code: '63-000-00-110-0000' }] };

describe('代碼換算', () => {
  it('鄉鎮、村里代碼 → 縣市代碼', () => {
    expect(countyCodeOf('63-000-00-010-0002')).toBe('63-000-00-000-0000');
  });
  it('村里代碼 → 鄉鎮代碼', () => expect(townCodeOf('63-000-00-010-0002')).toBe('63-000-00-010-0000'));
});

describe('selectCandidates', () => {
  it('全國層未選取：六都完整、其他壓縮成人數', () => {
    const s = selectCandidates('national', null, { parentName: '全國', areas: [] }, national, null);
    expect(s).toEqual({
      mode: 'nationalOverview',
      municipalities: [national.races[0]],
      others: [{ countyCode: '10-017-00-000-0000', countyName: '基隆市', count: 1 }],
    });
  });
  it('全國層 hover 縣市：該縣市首長候選人', () => {
    const s = selectCandidates('national', { code: '10-017-00-000-0000', name: '基隆市' }, { parentName: '全國', areas: [] }, national, null);
    expect(s).toMatchObject({ mode: 'chief', countyName: '基隆市', race: { countyName: '基隆市' } });
  });
  it('縣市層 hover 行政區：顯示其所屬選區', () => {
    const s = selectCandidates('county', { code: '63-000-00-110-0000', name: '北投區' }, countyLayer, national, taipei);
    expect(s).toMatchObject({ mode: 'county', highlight: { no: 1 }, townNote: null });
  });
  it('選區對應未確認的縣市 hover 行政區：不顯示任何選區，只給說明', () => {
    const s = selectCandidates('county', { code: '10-017-00-010-0000', name: '中正區' },
      { parentName: '基隆市', areas: [{ code: '10-017-00-010-0000' }] }, national, keelung);
    expect(s).toMatchObject({ mode: 'county', highlight: null });
    expect((s as { townNote: string }).townNote).toMatch(/2022/);
  });
  it('跨選區的鄉鎮市區不歸給任一選區', () => {
    const split = { ...taipei, townToDistrict: {}, splitTowns: ['63-000-00-110-0000'] };
    const s = selectCandidates('county', { code: '63-000-00-110-0000', name: '北投區' }, countyLayer, national, split);
    expect(s).toMatchObject({ highlight: null });
    expect((s as { townNote: string }).townNote).toMatch(/分屬多個選區/);
  });
  it('村里層：顯示該鄉鎮所屬選區', () => {
    const s = selectCandidates('town', null, { parentName: '北投區', areas: [{ code: '63-000-00-110-0001' }] }, national, taipei);
    expect(s).toMatchObject({ mode: 'town', townName: '北投區', district: { no: 1 } });
  });
  it('縣市檔尚未載入時 county 為 null，不拋錯', () => {
    const s = selectCandidates('county', null, countyLayer, national, null);
    expect(s).toMatchObject({ mode: 'county', county: null });
  });
});

describe('focusCountyCode', () => {
  it('全國層 hover 縣市不載入縣市檔', () => {
    expect(focusCountyCode('national', { code: '63-000-00-000-0000', name: '臺北市' }, { parentName: '全國', areas: [] })).toBeNull();
  });
  it('縣市層由圖層內的行政區推得，略過未編定村里', () => {
    expect(focusCountyCode('town', null, { parentName: '北投區', areas: [{ code: '未編定:12' }, { code: '63-000-00-110-0001' }] }))
      .toBe('63-000-00-000-0000');
  });
});

describe('groupDistricts：原住民選區自成一組（spec §6.2）', () => {
  const d = (no: number, type: 'regional' | 'plainIndigenous' | 'mountainIndigenous' | 'unknown') =>
    ({ no, label: `第${no}選舉區`, type, candidates: [] });
  it('區域（含類型未知）在前、原住民選區另列，各自保持原序', () => {
    const g = groupDistricts([d(1, 'regional'), d(2, 'unknown'), d(3, 'plainIndigenous'), d(4, 'mountainIndigenous'), d(5, 'regional')]);
    expect(g.regional.map((x) => x.no)).toEqual([1, 2, 5]);
    expect(g.indigenous.map((x) => x.no)).toEqual([3, 4]);
  });
  it('沒有原住民選區時 indigenous 為空', () => {
    expect(groupDistricts([d(1, 'regional')]).indigenous).toEqual([]);
  });
});
