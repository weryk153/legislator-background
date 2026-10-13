import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyVerifiedDistricts, reconcileCounty, type VerifiedDistricts } from '../scraper/lib/councilDistricts';
import { electionDistrictAreas, electionCandidateGroupKey } from '../src/lib/electionFinder';
import { assemble } from '../scraper/lib/candidateAssemble';
import type { CountyCandidates } from '../src/lib/candidateTypes';
import data from '../scraper/council-districts-2026-verified.json';
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const national = read('public/data/map/national.json');
const towns = new Map<string, { code: string; name: string }[]>(national.areas.map((a: { code: string; name: string }) =>
  [a.name, read(`public/data/map/county/${a.code}.json`).areas]));
const refs = applyVerifiedDistricts(new Map(), data, towns);
const codes = { 新竹縣: '10-004', 彰化縣: '10-007', 雲林縣: '10-009', 基隆市: '10-017', 新竹市: '10-018' };
const counties = Object.values(codes).map(c => read(`public/data/candidates/2026/county/${c}-00-000-0000.json`) as CountyCandidates);

describe('2026 正式選區核對', () => {
  it('五縣市共 48 區，所有名冊選區均命中公告且帶原始來源', () => {
    expect(data.counties.reduce((n, c) => n + c.districts.length, 0)).toBe(48);
    for (const county of counties) {
      const ref = refs.get(county.countyName)!;
      expect(reconcileCounty(ref, county.districts.map(d => d.no)).confirmed).toBe(true);
      expect(county.districtSource?.documentNo).toBe('中選務字第1153150253號');
      expect(county.districts.every(d => d.scope && d.type !== 'unknown')).toBe(true);
      expect(county.mappingNote).toBeNull();
    }
  });
  it('竹北兩區不整市配對，湖口等其他鄉鎮依新編號配對', () => {
    const county = counties[0];
    expect(county.splitTowns).toEqual(['10-004-00-010-0000']);
    expect(county.townToDistrict?.['10-004-00-010-0000']).toBeUndefined();
    expect(county.townToDistrict?.['10-004-00-050-0000']).toBe(3);
    expect(county.districts[0].scope).toContain('尚義里');
    expect(county.districts[1].scope).toContain('竹北里');
    const villages = county.districts.slice(0, 2).map(d => d.scope!.replace(/^竹北市/, '').split('、'));
    expect(villages.map(v => v.length)).toEqual([15, 16]);
    expect(new Set(villages.flat()).size).toBe(31);
  });
  it('新竹市東區與北區維持按里切分，香山區可整區配對', () => {
    const county = counties[4];
    expect(county.splitTowns).toEqual(['10-018-00-010-0000', '10-018-00-020-0000']);
    expect(county.townToDistrict).toEqual({ '10-018-00-030-0000': 5 });
    expect(county.districts.slice(0, 5).map(d => d.scope!.split('、').length)).toEqual([36, 17, 15, 30, 24]);
  });
  it('新增原住民選區正確分類，不混入一般鄉鎮對應', () => {
    for (const [i, no] of [[1, 10], [2, 8], [3, 9], [4, 7]]) {
      expect(counties[i].districts.find(d => d.no === no)?.type).toBe('mountainIndigenous');
      expect(Object.values(counties[i].townToDistrict!)).not.toContain(no);
    }
    expect(counties[2].districts.find(d => d.no === 7)?.type).toBe('plainIndigenous');
  });
  it('查詢資料保留按里公告範圍與來源，不把部分行政區当成完整涵蓋', () => {
    const area = electionDistrictAreas(counties, new Map([...towns.values()].flat().map(t => [t.code, t.name])));
    const key = electionCandidateGroupKey({ countyCode: counties[0].countyCode, office: 'council', district: '第1選舉區' });
    expect(area[key].towns).toEqual([]);
    expect(area[key].scope).toBe(counties[0].districts[0].scope);
    expect(area[key].source?.publishedOn).toBe('2026-08-20');
  });
  it('錯誤地名、重複選區、無效類型直接停止產出', () => {
    for (const change of [
      (x: VerifiedDistricts) => { x.counties[0].districts[0].townNames = ['不存在市']; },
      (x: VerifiedDistricts) => { x.counties[0].districts[1].no = 1; },
      (x: VerifiedDistricts) => { x.counties[0].districts[0].type = 'unknown'; },
    ]) {
      const invalid = structuredClone(data); change(invalid);
      expect(() => applyVerifiedDistricts(new Map(), invalid, towns)).toThrow();
    }
  });
  it('新名冊與正式公告不符時不繼續標為已確認或帶舊公告範圍', () => {
    const result = assemble({
      source: counties[0].source, chiefRows: [],
      councilRows: [{ district: '新竹縣第15選舉區', name: '測試', party: '無', number: null, registeredOn: '2026-09-01', note: '' }],
      countyOrder: [{ code: counties[0].countyCode, name: '新竹縣' }],
      partyCode: () => '999', link: () => ({ kind: 'none', slug: null, reason: '' }), identity: () => null, districtRefs: refs,
    });
    expect(result.counties[0]).toMatchObject({ townToDistrict: null, districts: [{ no: 15, type: 'unknown' }] });
    expect(result.counties[0].districtSource).toBeUndefined();
    expect(result.counties[0].districts[0].scope).toBeUndefined();
    expect(result.warnings[0]).toContain('2026 公告');
  });
});
