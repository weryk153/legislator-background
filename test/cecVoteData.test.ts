import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseElbase, countyCodeOf, townCodeOf } from '../scraper/lib/cecVoteData';

const V1_ELBASE = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉/V1/elbase.csv';

describe('parseElbase：行政區樹', () => {
  const csv = [
    '00,000,00,000,0000,全國',
    '63,000,00,000,0000,臺北市',
    '63,000,00,010,0000,松山區',
    '63,000,00,010,0002,莊敬里',
    '09,007,00,000,0000,連江縣',
    '09,007,00,010,0000,南竿鄉',
    '09,007,00,010,0001,介壽村',
  ].join('\n');

  it('略過「全國」列——它不是行政區', () => {
    expect(parseElbase(csv).some((a) => a.name === '全國')).toBe(false);
  });

  it('直轄市以省市別辨識，其縣市別為 000，不可誤判為非縣市層', () => {
    expect(parseElbase(csv).find((a) => a.name === '臺北市'))
      .toEqual({ code: '63-000-00-000-0000', level: 'county', name: '臺北市', parent: null });
  });

  it('省轄縣市的省市別為 09 或 10，縣市別才是識別碼', () => {
    expect(parseElbase(csv).find((a) => a.name === '連江縣'))
      .toEqual({ code: '09-007-00-000-0000', level: 'county', name: '連江縣', parent: null });
  });

  it('鄉鎮市區掛在所屬縣市之下', () => {
    expect(parseElbase(csv).find((a) => a.name === '松山區'))
      .toEqual({ code: '63-000-00-010-0000', level: 'town', name: '松山區', parent: '63-000-00-000-0000' });
  });

  it('村里掛在所屬鄉鎮市區之下', () => {
    expect(parseElbase(csv).find((a) => a.name === '莊敬里'))
      .toEqual({ code: '63-000-00-010-0002', level: 'village', name: '莊敬里', parent: '63-000-00-010-0000' });
  });
});

describe('countyCodeOf / townCodeOf：代碼上溯', () => {
  it('議員的選區代碼可上溯到縣市——席次要按縣市彙整，而選區別不是行政區', () => {
    expect(countyCodeOf('10-005-01-000-0000')).toBe('10-005-00-000-0000');
  });
  it('村里代碼可上溯到縣市與鄉鎮市區', () => {
    expect(countyCodeOf('63-000-00-010-0002')).toBe('63-000-00-000-0000');
    expect(townCodeOf('63-000-00-010-0002')).toBe('63-000-00-010-0000');
  });
  it('已是縣市層者上溯後不變', () => {
    expect(countyCodeOf('63-000-00-000-0000')).toBe('63-000-00-000-0000');
  });
});

describe('parseElbase：對真實資料', () => {
  const areas = parseElbase(readFileSync(V1_ELBASE, 'utf8'));

  it('層級數與 2022 年的行政區數相符', () => {
    const n = (l: string) => areas.filter((a) => a.level === l).length;
    expect(n('county')).toBe(22);
    expect(n('town')).toBe(368);
    expect(n('village')).toBe(7756);
  });

  it('每個非縣市節點的 parent 都存在於樹中——parent 斷鏈會讓整張地圖組不起來', () => {
    const codes = new Set(areas.map((a) => a.code));
    expect(areas.filter((a) => a.parent && !codes.has(a.parent))).toEqual([]);
  });

  it('每個村里的 townCodeOf 都指向存在的鄉鎮市區', () => {
    const towns = new Set(areas.filter((a) => a.level === 'town').map((a) => a.code));
    const bad = areas.filter((a) => a.level === 'village' && !towns.has(townCodeOf(a.code)));
    expect(bad).toEqual([]);
  });
});
