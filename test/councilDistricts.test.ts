import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDistrictRefs, reconcileCounty } from '../scraper/lib/councilDistricts';

const T1 = [
  '00,000,00,000,0000,全國',
  '10,018,00,000,0000,新竹市',
  '10,018,01,000,0000,第01選舉區',
  '10,018,01,010,0000,東區',
  '10,018,01,010,0001,某里',
  '10,018,02,000,0000,第02選舉區',
  '10,018,02,010,0000,東區',
  '10,018,02,030,0000,香山區',
].join('\n');
const T2 = [
  '10,018,00,000,0000,新竹市',
  '10,018,03,000,0000,第03選舉區',
  '10,018,03,010,0000,東區',
  '10,018,03,030,0000,香山區',
].join('\n');

describe('buildDistrictRefs', () => {
  const refs = buildDistrictRefs([
    { type: 'regional', elbaseCsv: T1 }, { type: 'plainIndigenous', elbaseCsv: T2 },
  ]);
  const hc = refs.get('新竹市')!;
  it('選區編號與類型取自所在類別', () => {
    expect([...hc.districts.keys()].sort()).toEqual([1, 2, 3]);
    expect(hc.districts.get(3)!.type).toBe('plainIndigenous');
  });
  it('鄉鎮市區代碼轉成地圖檔格式', () => {
    expect(hc.districts.get(2)!.townCodes).toContain('10-018-00-030-0000');
  });
  it('同一鄉鎮市區分屬兩個區域選區時標為切分，不歸給任何一區', () => {
    expect(hc.splitTownCodes.has('10-018-00-010-0000')).toBe(true);
    expect(hc.splitTownCodes.has('10-018-00-030-0000')).toBe(false);
  });
  it('原住民選區涵蓋全縣，不算切分', () => {
    expect(hc.splitTownCodes.size).toBe(1);
  });
});

describe('reconcileCounty', () => {
  const refs = buildDistrictRefs([{ type: 'regional', elbaseCsv: T1 }]);
  it('選區編號集合相同才確認', () => {
    expect(reconcileCounty(refs.get('新竹市'), [2, 1, 1]).confirmed).toBe(true);
  });
  it('2026 多出選區即未確認，並說明原因', () => {
    const r = reconcileCounty(refs.get('新竹市'), [1, 2, 3]);
    expect(r.confirmed).toBe(false);
    expect(r.reason).toMatch(/2 個.*3 個/);
  });
  it('2022 查無此縣市即未確認', () => {
    expect(reconcileCounty(undefined, [1]).confirmed).toBe(false);
  });
});

describe('真實 2022 資料', () => {
  const R = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉';
  const read = (cat: string) => ['city', 'prv'].map((s) => readFileSync(`${R}/${cat}/${s}/elbase.csv`, 'utf8')).join('\n');
  const refs = buildDistrictRefs([
    { type: 'regional', elbaseCsv: read('T1') },
    { type: 'plainIndigenous', elbaseCsv: read('T2') },
    { type: 'mountainIndigenous', elbaseCsv: read('T3') },
  ]);
  it('22 縣市都有參照', () => expect(refs.size).toBe(22));
  it('新竹市東區、北區被切分', () => {
    expect([...refs.get('新竹市')!.splitTownCodes].sort()).toEqual(['10-018-00-010-0000', '10-018-00-020-0000']);
  });
  it('高雄有三個山地原住民選區', () => {
    const mt = [...refs.get('高雄市')!.districts.values()].filter((d) => d.type === 'mountainIndigenous');
    expect(mt.map((d) => d.no).sort((a, b) => a - b)).toEqual([13, 14, 15]);
  });
});
