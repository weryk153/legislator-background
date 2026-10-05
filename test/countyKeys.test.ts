import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COUNTY_KEYS, countyByCode, countyByKey, countyByName, countyPagePath } from '../src/lib/countyKeys';
import type { NationalCandidates } from '../src/lib/candidateTypes';

describe('countyKeys', () => {
  it('22 個縣市', () => expect(COUNTY_KEYS).toHaveLength(22));

  it('縣市名、key、代碼各自唯一，雙向查得回同一筆', () => {
    for (const field of ['name', 'key', 'code'] as const) {
      expect(new Set(COUNTY_KEYS.map((c) => c[field])).size).toBe(22);
    }
    for (const c of COUNTY_KEYS) {
      expect(countyByKey(c.key)).toBe(c);
      expect(countyByCode(c.code)).toBe(c);
      expect(countyByName(c.name)).toBe(c);
    }
  });

  it('key 只用小寫英文與連字號', () => {
    for (const c of COUNTY_KEYS) expect(c.key).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('查無時回 undefined', () => {
    expect(countyByKey('taipei-city')).toBeUndefined();
    expect(countyByName('台北市')).toBeUndefined();
  });

  it('頁面路徑結尾斜線', () => expect(countyPagePath('new-taipei')).toBe('/elections/2026/new-taipei/'));

  // 與實際名冊對照：代碼、縣市名、順序一致，key 等於現任縣市長 slug 去掉 mayor-。
  it('與 2026 名冊一致', () => {
    const national = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'candidates', '2026', 'national.json'), 'utf8')) as NationalCandidates;
    expect(national.races.map((r) => r.countyCode)).toEqual(COUNTY_KEYS.map((c) => c.code));
    for (const r of national.races) {
      const c = countyByCode(r.countyCode)!;
      expect(c.name).toBe(r.countyName);
      if (r.incumbent2022?.slug?.startsWith('mayor-')) expect(`mayor-${c.key}`).toBe(r.incumbent2022.slug);
    }
  });
});
