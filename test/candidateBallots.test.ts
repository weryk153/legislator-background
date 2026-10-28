import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { applyVerifiedBallots, type VerifiedBallots } from '../scraper/lib/candidateBallots';
import type { NationalCandidates, CountyCandidates } from '../src/lib/candidateTypes';
import { candidacyIndex } from '../src/lib/candidacy';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const verified = read('scraper/candidate-ballots-2026-verified.json') as VerifiedBallots;
const load = () => ({
  national: read('public/data/candidates/2026/national.json') as NationalCandidates,
  counties: readdirSync('public/data/candidates/2026/county').map(f => read(`public/data/candidates/2026/county/${f}`)) as CountyCandidates[],
});
describe('2026 審定與已查證選區號次', () => {
  it('81 位首長、1492 位議員；1433 位已核對號次，其他人不填猜測號碼', () => {
    const { national, counties } = load();
    expect(national.races.flatMap(r => r.candidates)).toHaveLength(81);
    expect(counties.flatMap(c => c.districts.flatMap(d => d.candidates))).toHaveLength(1492);
    const numbered = [...national.races.flatMap(r => r.candidates), ...counties.flatMap(c => c.districts.flatMap(d => d.candidates))].filter(c => c.number !== null);
    expect(numbered).toHaveLength(1433);
    expect(candidacyIndex(national, counties).get(numbered.find(c => c.name === '陳玉珍')!.slug!)?.number).toBe(5);
    for (const b of verified.ballots) {
      const list = b.districtNo === null ? national.races.find(r => r.countyName === b.countyName)!.candidates
        : counties.find(c => c.countyName === b.countyName)!.districts.find(d => d.no === b.districtNo)!.candidates;
      expect(list.map(c => c.name)).toEqual(b.namesByNumber);
      expect(list.map(c => c.number)).toEqual(b.namesByNumber.map((_, i) => i + 1));
      if (b.districtNo !== null) expect(counties.find(c => c.countyName === b.countyName)!.districts.find(d => d.no === b.districtNo)!.source).toEqual(b.source);
    }
    for (const county of counties) {
      for (const district of county.districts.filter(d => !verified.ballots.some(b => b.countyName === county.countyName && b.districtNo === d.no))) {
        expect(district.candidates.every(c => c.number === null)).toBe(true);
      }
    }
    expect(national.races.find(r => r.countyName === '臺北市')!.candidates.find(c => c.name === '蔣萬安')!.number).toBe(5);
    expect(national.races.find(r => r.countyName === '高雄市')!.candidates.find(c => c.name === '賴瑞隆')!.number).toBe(5);
    for (const e of verified.excluded) expect(counties.find(c => c.countyName === e.countyName)!.districts.find(d => d.no === e.districtNo)!.candidates.some(c => c.name === e.name)).toBe(false);
  });
  it('部分議員選區先收錄時保留分區來源，其他選區仍待核實', () => {
    const { national, counties } = load();
    const county = counties.find(c => c.countyName === '嘉義市')!;
    county.source = { ...verified.certification };
    for (const d of county.districts) { delete d.source; for (const c of d.candidates) c.number = null; }
    applyVerifiedBallots(national, counties, { ...verified, ballots: verified.ballots.filter(b => b.countyName !== '嘉義市' || b.districtNo !== 2) });
    expect(county.source.stage).toBe('certified');
    expect(county.districts[0].source?.url).toContain('65355');
    expect(county.districts[1].source).toBeUndefined();
    expect(county.districts[1].candidates.every(c => c.number === null)).toBe(true);
  });
  it('重跑不改結果，重建登記版也會重新套用號次', () => {
    const { national, counties } = load();
    const before = structuredClone({ national, counties });
    applyVerifiedBallots(national, counties, verified);
    expect({ national, counties }).toEqual(before);
    for (const r of national.races) { delete r.source; for (const c of r.candidates) c.number = null; }
    for (const co of counties) { co.source = { stage: 'registration', url: '', tableDate: '2026-09-07' }; for (const d of co.districts) for (const c of d.candidates) c.number = null; }
    applyVerifiedBallots(national, counties, verified);
    expect({ national, counties }).toEqual(before);
  });
  it('不覆蓋較新名冊，名單不完整或號次衝突就停止', () => {
    const later = load(); later.national.source.tableDate = '2099-01-01';
    const before = structuredClone(later); applyVerifiedBallots(later.national, later.counties, verified); expect(later).toEqual(before);
    const mismatch = load(); mismatch.national.races.find(r => r.countyName === '金門縣')!.candidates.pop();
    expect(() => applyVerifiedBallots(mismatch.national, mismatch.counties, verified)).toThrow('不一致');
    const conflict = load(); conflict.national.races.find(r => r.countyName === '金門縣')!.candidates[0].number = 2;
    expect(() => applyVerifiedBallots(conflict.national, conflict.counties, verified)).toThrow('衝突');
  });
});
