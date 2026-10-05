import { describe, it, expect } from 'vitest';
import {
  DESCRIPTION_MAX, countyPageDescription, countyPageHeading, countyPageTitle, countyRaceName, districtTowns, groupDistricts,
} from '../src/lib/countyPage';
import type { CouncilDistrict } from '../src/lib/candidateTypes';

describe('標題組字', () => {
  it('h1', () => expect(countyPageHeading('新北市')).toBe('2026 新北市長與新北市議員選舉候選人'));
  it('縣', () => expect(countyPageHeading('宜蘭縣')).toBe('2026 宜蘭縣長與宜蘭縣議員選舉候選人'));
  it('title', () => expect(countyPageTitle('新北市')).toBe('2026 新北市長候選人與新北市議員候選人名單｜政治人物背景'));
  it('選舉名稱', () => expect(countyRaceName('臺東縣')).toBe('2026 臺東縣長與臺東縣議員選舉'));
});

describe('countyPageDescription', () => {
  it('人數少時全列', () => {
    expect(countyPageDescription('新北市', ['甲', '乙', '丙'], 13, 112)).toBe(
      '2026 新北市長候選人：甲、乙、丙；新北市議員 13 個選區、112 位候選人名單，附候選人經歷、判決、爭議與政治獻金。');
  });

  it('超過上限時只列前 6 位＋「等 n 人」', () => {
    const names = Array.from({ length: 30 }, (_, i) => `候選人${i}號`);
    const d = countyPageDescription('金門縣', names, 3, 30);
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(d).toContain('候選人0號、候選人1號、候選人2號、候選人3號、候選人4號、候選人5號等 30 人；');
    expect(d).not.toContain('候選人6號');
  });

  it('姓名極長時再減少列出人數，仍不超過上限', () => {
    const names = Array.from({ length: 8 }, (_, i) => `黃宏成台灣阿成世界偉人財神總統${i}`);
    const d = countyPageDescription('嘉義市', names, 2, 20);
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(d).toMatch(/等 8 人；/);
  });

  it('自訂上限：剛好超過一字就截斷', () => {
    const names = ['甲甲甲', '乙乙乙', '丙丙丙'];
    const max = countyPageDescription('臺北市', names, 8, 90).length - 1;
    const d = countyPageDescription('臺北市', names, 8, 90, max);
    expect(d.length).toBeLessThanOrEqual(max);
    expect(d).toContain('：甲甲甲等 3 人；');
  });
});

describe('districtTowns', () => {
  const names = new Map([['A-010', '板橋區'], ['A-020', '三重區'], ['A-140', '蘆洲區'], ['A-100', '石門區']]);
  it('反查選區 → 鄉鎮市區名，依代碼排序', () => {
    const m = districtTowns({ 'A-140': 4, 'A-010': 5, 'A-020': 4, 'A-100': 1 }, names);
    expect(m.get(4)).toEqual(['三重區', '蘆洲區']);
    expect(m.get(5)).toEqual(['板橋區']);
    expect(m.get(1)).toEqual(['石門區']);
  });
  it('查不到名稱的代碼略過', () => expect(districtTowns({ 'A-999': 2 }, names).has(2)).toBe(false));
  it('對應未確認（null）回空', () => expect(districtTowns(null, names).size).toBe(0));
});

describe('groupDistricts', () => {
  const d = (no: number, type: CouncilDistrict['type']): CouncilDistrict => ({ no, label: `第${no}選舉區`, type, candidates: [] });
  it('原住民選區另成一組，類型未知歸區域', () => {
    const g = groupDistricts([d(1, 'regional'), d(2, 'unknown'), d(3, 'plainIndigenous'), d(4, 'mountainIndigenous')]);
    expect(g.regional.map((x) => x.no)).toEqual([1, 2]);
    expect(g.indigenous.map((x) => x.no)).toEqual([3, 4]);
  });
});
