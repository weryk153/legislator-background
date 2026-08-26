import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeAreaName, areaKey, buildKeyIndex, buildCodeIndex } from '../scraper/lib/areaMatch';
import { parseElbase } from '../scraper/lib/cecVoteData';

const V1_ELBASE = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉/V1/elbase.csv';

describe('normalizeAreaName', () => {
  it('台一律正規化為臺——兩種寫法在官方檔案裡都出現', () => {
    expect(normalizeAreaName('台北市')).toBe('臺北市');
    expect(normalizeAreaName('臺北市')).toBe('臺北市');
  });
  it('去除空白', () => {
    expect(normalizeAreaName(' 松山 區 ')).toBe('松山區');
  });
  it('全形數字轉半形', () => {
    expect(normalizeAreaName('中山１里')).toBe('中山1里');
  });
  it('空值不拋錯', () => {
    expect(normalizeAreaName('')).toBe('');
  });
});

describe('areaKey：複合鍵', () => {
  it('三段以斜線相連', () => {
    expect(areaKey('臺北市', '松山區', '莊敬里')).toBe('臺北市/松山區/莊敬里');
  });
  it('省略下層即為該層的鍵', () => {
    expect(areaKey('臺北市', '松山區')).toBe('臺北市/松山區');
    expect(areaKey('臺北市')).toBe('臺北市');
  });
  it('組鍵時一併正規化，呼叫端不必先處理', () => {
    expect(areaKey('台北市', '松山區', '莊敬里')).toBe('臺北市/松山區/莊敬里');
  });
});

describe('buildKeyIndex：對真實資料', () => {
  const areas = parseElbase(readFileSync(V1_ELBASE, 'utf8'));

  it('全國每個行政區的複合鍵唯一——鍵若碰撞會把某村的村里長掛到另一村頭上', () => {
    expect(buildKeyIndex(areas).size).toBe(areas.length);
  });

  it('單以村里名不唯一，故複合鍵必須含上層', () => {
    const villages = areas.filter((a) => a.level === 'village');
    expect(new Set(villages.map((v) => v.name)).size).toBeLessThan(villages.length);
  });

  it('可用鍵反查代碼，也可用代碼反查鍵', () => {
    expect(buildKeyIndex(areas).get('臺北市/松山區/莊敬里')).toBe('63-000-00-010-0002');
    expect(buildCodeIndex(areas).get('63-000-00-010-0002')).toBe('臺北市/松山區/莊敬里');
  });
});
