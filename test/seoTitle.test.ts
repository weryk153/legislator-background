import { describe, it, expect } from 'vitest';
import { officeRole, shortParty, officialPageTitle } from '../src/lib/seoTitle';

describe('officeRole', () => {
  it('參選人：2026＋縣市首長職稱＋參選人', () => {
    expect(officeRole('candidate', '新北市')).toBe('2026 新北市長參選人');
    expect(officeRole('candidate', '臺東縣')).toBe('2026 臺東縣長參選人');
  });
  it('縣市首長：縣市名＋長', () => {
    expect(officeRole('mayor_magistrate', '臺北市')).toBe('臺北市長');
    expect(officeRole('mayor_magistrate', '宜蘭縣')).toBe('宜蘭縣長');
  });
  it('議員：縣市名＋議員（去掉選區編號）', () => {
    expect(officeRole('councilor', '新竹縣第08選舉區')).toBe('新竹縣議員');
  });
  it('立委：區域、單一選區、不分區、原住民', () => {
    expect(officeRole('legislator', '臺中市第4選舉區')).toBe('臺中市立委');
    expect(officeRole('legislator', '宜蘭縣選舉區')).toBe('宜蘭縣立委');
    expect(officeRole('legislator', '全國不分區及僑居國外國民')).toBe('不分區立委');
    expect(officeRole('legislator', '山地原住民選舉區')).toBe('山地原住民立委');
    expect(officeRole('legislator', '平地原住民選舉區')).toBe('平地原住民立委');
  });
  it('無法辨識縣市時退回通用職稱', () => {
    expect(officeRole('councilor', '')).toBe('議員');
    expect(officeRole('legislator', '不明')).toBe('立委');
  });
});

describe('shortParty', () => {
  it('縮短無黨籍，其他黨名不動', () => {
    expect(shortParty('無黨籍及未經政黨推薦')).toBe('無黨籍');
    expect(shortParty('無黨團結聯盟')).toBe('無黨團結聯盟');
    expect(shortParty('民進黨')).toBe('民進黨');
  });
});

describe('officialPageTitle', () => {
  it('姓名與關鍵字落在前 30 字內', () => {
    const t = officialPageTitle({ name: '上官秋燕', party: '國民黨', officeType: 'councilor', district: '新竹縣第08選舉區' });
    expect(t).toBe('上官秋燕（國民黨・新竹縣議員）經歷、判決、財產與政治獻金｜政治人物背景');
    expect(t.indexOf('政治獻金')).toBeLessThan(30);
  });
});
