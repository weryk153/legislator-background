import { describe, it, expect } from 'vitest';
import { normalizeName, normalizeDistrict, diffRoster } from '../lib/roster';
import type { CecWinner, OfficialRecord } from '../lib/roster';

describe('normalizeName', () => {
  it('merges 姍/姗 variant', () => {
    expect(normalizeName('戴瑋姗')).toBe(normalizeName('戴瑋姍'));
  });
  it('merges 台/臺 variant', () => {
    expect(normalizeName('台北')).toBe(normalizeName('臺北'));
  });
  it('merges 峯/峰 variant', () => {
    expect(normalizeName('黃聖峰')).toBe(normalizeName('黃聖峯'));
  });
  it('merges 恆/恒 variant', () => {
    expect(normalizeName('洪志恒')).toBe(normalizeName('洪志恆'));
  });
  it('strips whitespace and middle-dot variants so aboriginal names align across sources', () => {
    // CEC 用間隔點分隔羅馬拼音，站上有時用空白分隔——正規化後應相同
    expect(normalizeName('鄭天財 Sra‧Kacaw')).toBe(normalizeName('鄭天財Sra Kacaw'));
    expect(normalizeName('伍麗華 Saidhai．Tahovecahe')).toBe(normalizeName('伍麗華Saidhai‧Tahovecahe'));
  });
  it('does not merge unrelated names', () => {
    expect(normalizeName('陳其邁')).not.toBe(normalizeName('陳其萬'));
  });
});

describe('normalizeDistrict', () => {
  it('strips leading zero in 第0X選舉區', () => {
    expect(normalizeDistrict('新北市第05選舉區')).toBe(normalizeDistrict('新北市第5選舉區'));
  });
  it('unifies 選區/選舉區', () => {
    expect(normalizeDistrict('臺北市第01選區')).toBe(normalizeDistrict('臺北市第1選舉區'));
  });
  it('leaves non-numbered districts (mayors, at-large) unchanged', () => {
    expect(normalizeDistrict('嘉義市')).toBe('嘉義市');
    expect(normalizeDistrict('全國不分區及僑居國外國民')).toBe('全國不分區及僑居國外國民');
  });
});

describe('diffRoster', () => {
  const base = { party: '民進黨' };

  it('exact match produces no bucket entries', () => {
    const cec: CecWinner[] = [{ office: 'councilor', name: '王小明', district: '新北市第1選舉區', election: '2022 T1', ...base }];
    const officials: OfficialRecord[] = [{ id: '1', name: '王小明', office_type: 'councilor', district: '新北市第1選舉區', party: '民進黨' }];
    const result = diffRoster(cec, officials);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.transferred).toHaveLength(0);
    expect(result.near_miss).toHaveLength(0);
  });

  it('variant-char match (戴瑋姗 CEC ≡ 戴瑋姍 site) produces no bucket entries', () => {
    const cec: CecWinner[] = [{ office: 'councilor', name: '戴瑋姗', district: '新北市第5選舉區', election: '2022 T1', ...base }];
    const officials: OfficialRecord[] = [{ id: '1', name: '戴瑋姍', office_type: 'councilor', district: '新北市第05選舉區', party: '民進黨' }];
    const result = diffRoster(cec, officials);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.transferred).toHaveLength(0);
  });

  it('transferred: councilor winner now sits on site as legislator → transferred bucket, not missing', () => {
    const cec: CecWinner[] = [{ office: 'councilor', name: '葉元之', district: '新北市第8選舉區', election: '2022 T1', party: '國民黨' }];
    const officials: OfficialRecord[] = [
      { id: '1', name: '葉元之', office_type: 'legislator', district: '新北市第8選舉區', party: '國民黨' },
    ];
    const result = diffRoster(cec, officials);
    expect(result.missing).toHaveLength(0);
    expect(result.transferred).toHaveLength(1);
    expect(result.transferred[0].cec.name).toBe('葉元之');
    expect(result.transferred[0].foundAs.office_type).toBe('legislator');
    expect(result.transferred[0].vacatedDistrict).toBe('新北市第8選舉區');
  });

  it('homonym guard: two same-named CEC winners contesting one same-named official are disambiguated by party', () => {
    // 真實案例：兩位不同市的「李柏毅」議員，只有高雄市那位轉任立委；臺北市那位是另一人。
    const cec: CecWinner[] = [
      { office: 'councilor', name: '李柏毅', district: '臺北市第6選舉區', election: '2022 T1', party: '國民黨' },
      { office: 'councilor', name: '李柏毅', district: '高雄市第4選舉區', election: '2022 T1', party: '民進黨' },
    ];
    const officials: OfficialRecord[] = [
      { id: '1', name: '李柏毅', office_type: 'legislator', district: '高雄市第3選舉區', party: '民進黨' },
    ];
    const result = diffRoster(cec, officials);
    expect(result.transferred).toHaveLength(1);
    expect(result.transferred[0].cec.district).toBe('高雄市第4選舉區');
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].cec.district).toBe('臺北市第6選舉區');
  });

  it('a single (uncontested) name match transfers even if the CEC party label differs from the site record', () => {
    // 常見：議員選舉登記「無黨籍及未經政黨推薦」，日後以政黨籍參選立委——無衝突時仍信任姓名比對。
    const cec: CecWinner[] = [{ office: 'councilor', name: '牛小庭', district: '桃園市第2選舉區', election: '2022 T1', party: '無黨籍及未經政黨推薦' }];
    const officials: OfficialRecord[] = [{ id: '1', name: '牛小庭', office_type: 'legislator', district: '桃園市第1選舉區', party: '國民黨' }];
    const result = diffRoster(cec, officials);
    expect(result.transferred).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
  });

  it('missing: CEC winner absent from site under any office', () => {
    const cec: CecWinner[] = [{ office: 'councilor', name: '石一佑', district: '新北市第9選舉區', election: '2024 補選', party: '民進黨' }];
    const officials: OfficialRecord[] = [];
    const result = diffRoster(cec, officials);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].cec.name).toBe('石一佑');
    expect(result.transferred).toHaveLength(0);
  });

  it('extra: site incumbent absent from CEC winners of their office', () => {
    const cec: CecWinner[] = [];
    const officials: OfficialRecord[] = [{ id: '1', name: '黃俊哲', office_type: 'councilor', district: '新北市第9選舉區', party: '民進黨' }];
    const result = diffRoster(cec, officials);
    expect(result.extra).toHaveLength(1);
    expect(result.extra[0].official.name).toBe('黃俊哲');
  });

  it('near_miss: same office+district+party, name differs by more than a variant-map char', () => {
    const cec: CecWinner[] = [{ office: 'councilor', name: '林大同', district: '桃園市第1選舉區', election: '2022 T1', party: '國民黨' }];
    const officials: OfficialRecord[] = [{ id: '1', name: '林大仝', office_type: 'councilor', district: '桃園市第01選舉區', party: '國民黨' }];
    const result = diffRoster(cec, officials);
    // 不自動合併：仍各自落在 missing / extra
    expect(result.missing).toHaveLength(1);
    expect(result.extra).toHaveLength(1);
    expect(result.near_miss).toHaveLength(1);
    expect(result.near_miss[0].cec.name).toBe('林大同');
    expect(result.near_miss[0].official.name).toBe('林大仝');
  });

  it('near_miss does not fire when multiple candidates share the same district+party (ambiguous, e.g. at-large lists)', () => {
    const cec: CecWinner[] = [
      { office: 'legislator', name: '甲候選', district: '全國不分區及僑居國外國民', election: '2024', party: '民進黨' },
      { office: 'legislator', name: '乙候選', district: '全國不分區及僑居國外國民', election: '2024', party: '民進黨' },
    ];
    const officials: OfficialRecord[] = [
      { id: '1', name: '丙官員', office_type: 'legislator', district: '全國不分區及僑居國外國民', party: '民進黨' },
      { id: '2', name: '丁官員', office_type: 'legislator', district: '全國不分區及僑居國外國民', party: '民進黨' },
    ];
    const result = diffRoster(cec, officials);
    expect(result.missing).toHaveLength(2);
    expect(result.extra).toHaveLength(2);
    expect(result.near_miss).toHaveLength(0);
  });

  it('near_miss does not fire across different districts or parties', () => {
    const cec: CecWinner[] = [{ office: 'councilor', name: '林大同', district: '桃園市第1選舉區', election: '2022 T1', party: '國民黨' }];
    const officials: OfficialRecord[] = [
      { id: '1', name: '林大仝', office_type: 'councilor', district: '桃園市第2選舉區', party: '國民黨' },
      { id: '2', name: '林大仝仝', office_type: 'councilor', district: '桃園市第1選舉區', party: '民進黨' },
    ];
    const result = diffRoster(cec, officials);
    expect(result.near_miss).toHaveLength(0);
  });
});
