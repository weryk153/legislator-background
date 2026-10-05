// test/candidateLinks.test.ts
import { describe, it, expect } from 'vitest';
import {
  linkCandidate, identityLine, nameKey, fullKey, normalizeDistrict, countyOf, type OfficialRef,
} from '../scraper/lib/candidateLinks';
import { chiefTitle } from '../src/lib/candidateTypes';

const off = (o: Partial<OfficialRef>): OfficialRef => ({
  slug: 's', name: '王小明', officeType: 'councilor', district: '臺北市第01選舉區', isIncumbent: true, ...o,
});
const chief = (county: string) => ({ kind: 'chief' as const, county, district: county });
const council = (district: string) => ({ kind: 'council' as const, county: district.slice(0, 3), district });

describe('正規化', () => {
  it('選區補零與否視為相同', () => expect(normalizeDistrict('新北市第05選舉區')).toBe(normalizeDistrict('新北市第5選舉區')));
  it('不分區與原住民立委沒有縣市', () => {
    expect(countyOf('全國不分區及僑居國外國民')).toBeNull();
    expect(countyOf('山地原住民選舉區')).toBeNull();
    expect(countyOf('新北市第5選舉區')).toBe('新北市');
  });
  it('姓名 key 只取漢字，並統一異體字', () => {
    expect(nameKey('楊清順 Cinsun Pawtawan')).toBe(nameKey('楊清順Cinsun‧Pawtawan'));
    expect(nameKey('張啓楷')).toBe(nameKey('張啟楷'));
    expect(nameKey('瓦力司．比尤')).toBe(nameKey('瓦力司‧比尤'));
  });
  it('純羅馬拼音姓名有獨立 key，不會全部相等', () => {
    expect(nameKey('LalingYumin')).not.toBe('');
    expect(nameKey('LalingYumin')).not.toBe(nameKey('KacawYumin'));
    expect(fullKey('楊清順 Cinsun・Pawtawan')).toBe(fullKey('楊清順Cinsun‧Pawtawan'));
  });
  it('首長職稱', () => {
    expect(chiefTitle('臺北市')).toBe('臺北市長');
    expect(chiefTitle('宜蘭縣')).toBe('宜蘭縣長');
  });
});

describe('linkCandidate：自動連結', () => {
  it('現任市長選同縣市首長', () => {
    const r = linkCandidate('蔣萬安', chief('臺北市'),
      [off({ slug: 'mayor-taipei', name: '蔣萬安', officeType: 'mayor_magistrate', district: '臺北市' })], []);
    expect(r).toMatchObject({ kind: 'auto', slug: 'mayor-taipei' });
  });
  it('區域立委選本縣市首長', () => {
    const r = linkCandidate('蘇巧慧', chief('新北市'),
      [off({ slug: 'su', name: '蘇巧慧', officeType: 'legislator', district: '新北市第5選舉區' })], []);
    expect(r.kind).toBe('auto');
  });
  it('現任議員在同選區連任（補零差異不影響）', () => {
    const r = linkCandidate('王小明', council('臺北市第1選舉區'), [off({ slug: 'c' })], []);
    expect(r).toMatchObject({ kind: 'auto', slug: 'c' });
  });
  it('因參選建檔者（candidate）選其登記縣市首長', () => {
    const r = linkCandidate('李四川', chief('新北市'),
      [off({ slug: 'cand-李四川-新北市', name: '李四川', officeType: 'candidate', district: '新北市', isIncumbent: false })], []);
    expect(r.kind).toBe('auto');
  });
});

describe('linkCandidate：進審核清單', () => {
  it('不分區立委沒有縣市可比對', () => {
    const r = linkCandidate('沈伯洋', chief('臺北市'),
      [off({ name: '沈伯洋', officeType: 'legislator', district: '全國不分區及僑居國外國民' })], []);
    expect(r.kind).toBe('review');
  });
  it('同名但不同縣市', () => {
    const r = linkCandidate('王小明', council('高雄市第3選舉區'), [off({})], []);
    expect(r.kind).toBe('review');
  });
  it('議員換選區參選', () => {
    const r = linkCandidate('王小明', council('臺北市第2選舉區'), [off({})], []);
    expect(r.kind).toBe('review');
  });
  it('同名多筆', () => {
    const r = linkCandidate('王小明', council('臺北市第1選舉區'), [off({ slug: 'a' }), off({ slug: 'b' })], []);
    expect(r).toMatchObject({ kind: 'review', candidates: ['a', 'b'] });
  });
  it('已離任者不自動連結', () => {
    const r = linkCandidate('王小明', council('臺北市第1選舉區'), [off({ isIncumbent: false })], []);
    expect(r.kind).toBe('review');
  });
  it('異體字對上後仍依規則判斷（不分區 → 審核）', () => {
    const r = linkCandidate('張啓楷', chief('嘉義市'),
      [off({ name: '張啓楷', officeType: 'legislator', district: '全國不分區及僑居國外國民' })], []);
    expect(r.kind).toBe('review');
  });
});

describe('linkCandidate：人工確認檔優先', () => {
  const offs = [off({ slug: 'shen', name: '沈伯洋', officeType: 'legislator', district: '全國不分區及僑居國外國民' })];
  it('確認是本人', () => {
    const r = linkCandidate('沈伯洋', chief('臺北市'), offs,
      [{ name: '沈伯洋', race: '臺北市', slug: 'shen', basis: '民進黨提名新聞' }]);
    expect(r).toMatchObject({ kind: 'confirmed', slug: 'shen' });
  });
  it('確認非本人會壓掉自動連結', () => {
    const r = linkCandidate('王小明', council('臺北市第1選舉區'), [off({ slug: 'c' })],
      [{ name: '王小明', race: '臺北市第01選舉區', slug: null, basis: '年齡不符' }]);
    expect(r.kind).toBe('rejected');
  });
  it('確認檔指向不存在的 slug 直接拋錯', () => {
    expect(() => linkCandidate('沈伯洋', chief('臺北市'), offs,
      [{ name: '沈伯洋', race: '臺北市', slug: 'nope', basis: 'x' }])).toThrow(/nope/);
  });
});

describe('linkCandidate：無同名', () => {
  it('不連結', () => expect(linkCandidate('郭璽', chief('臺北市'), [off({})], []).kind).toBe('none'));
});

describe('identityLine', () => {
  it('現任市長', () => expect(identityLine(off({ officeType: 'mayor_magistrate', district: '臺北市' }))).toBe('現任臺北市長'));
  it('不分區立委', () => expect(identityLine(off({ officeType: 'legislator', district: '全國不分區及僑居國外國民' }))).toBe('現任不分區立委'));
  it('區域立委', () => expect(identityLine(off({ officeType: 'legislator', district: '新北市第5選舉區' }))).toBe('現任立委（新北市第5選舉區）'));
  it('議員（去補零）', () => expect(identityLine(off({}))).toBe('現任議員（臺北市第1選舉區）'));
  it('已離任', () => expect(identityLine(off({ isIncumbent: false }))).toBe('前任議員（臺北市第1選舉區）'));
  it('因參選建檔者沒有公職身分', () => expect(identityLine(off({ officeType: 'candidate' }))).toBeNull());
});

describe('linkCandidate：確認檔以完整姓名比對', () => {
  const offs = [off({ slug: 'A', name: '楊清順' }), off({ slug: 'B', name: '楊清順 ' })];
  const race = council('臺北市第1選舉區');
  const confs = [
    { name: '楊清順Cinsun‧Pawtawan', race: '臺北市第1選舉區', slug: 'A', basis: 'a' },
    { name: '楊清順Lisin‧Pawtawan', race: '臺北市第01選舉區', slug: 'B', basis: 'b' },
  ];
  it('同選區兩位漢字相同者各自對到自己的 slug', () => {
    expect(linkCandidate('楊清順Cinsun‧Pawtawan', race, offs, confs)).toMatchObject({ kind: 'confirmed', slug: 'A' });
    expect(linkCandidate('楊清順Lisin‧Pawtawan', race, offs, confs)).toMatchObject({ kind: 'confirmed', slug: 'B' });
  });
  it('他人的確認不套用到拼音不同者', () => {
    // 確認檔不套用 → 回到一般規則；雙方都有拼音且不同 → 審核
    const r = linkCandidate('楊清順Lisin‧Pawtawan', race, [off({ slug: 'A', name: '楊清順 Cinsun Pawtawan' })], [confs[0]]);
    expect(r.kind).toBe('review');
  });
  it('雙方拼音相同（空白與分隔符不計）→ auto', () => {
    const r = linkCandidate('楊清順Cinsun‧Pawtawan', race, [off({ slug: 'A', name: '楊清順 Cinsun Pawtawan' })], []);
    expect(r).toMatchObject({ kind: 'auto', slug: 'A' });
  });
  it('只有一方有拼音 → 照常 auto', () => {
    const r = linkCandidate('楊清順', race, [off({ slug: 'A', name: '楊清順 Cinsun Pawtawan' })], []);
    expect(r).toMatchObject({ kind: 'auto', slug: 'A' });
  });
  it('分隔符變體仍相符', () => {
    const r = linkCandidate('楊清順Cinsun‧Pawtawan', race, offs,
      [{ name: '楊清順Cinsun・Pawtawan', race: '臺北市第1選舉區', slug: 'A', basis: 'a' }]);
    expect(r).toMatchObject({ kind: 'confirmed', slug: 'A' });
  });
});
