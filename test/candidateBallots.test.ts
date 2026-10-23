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
describe('2026 審定與金門號次', () => {
  it('81 位首長、1492 位議員；41 位已核對號次，其他人不填猜測號碼', () => {
    const { national, counties } = load();
    expect(national.races.flatMap(r => r.candidates)).toHaveLength(81);
    expect(counties.flatMap(c => c.districts.flatMap(d => d.candidates))).toHaveLength(1492);
    const numbered = [...national.races.flatMap(r => r.candidates), ...counties.flatMap(c => c.districts.flatMap(d => d.candidates))].filter(c => c.number !== null);
    expect(numbered).toHaveLength(41);
    expect(candidacyIndex(national, counties).get(numbered.find(c => c.name === '陳玉珍')!.slug!)?.number).toBe(5);
    for (const b of verified.ballots) {
      const list = b.districtNo === null ? national.races.find(r => r.countyName === b.countyName)!.candidates
        : counties.find(c => c.countyName === b.countyName)!.districts.find(d => d.no === b.districtNo)!.candidates;
      expect(list.map(c => c.name)).toEqual(b.namesByNumber);
      expect(list.map(c => c.number)).toEqual(b.namesByNumber.map((_, i) => i + 1));
    }
    for (const county of counties.filter(c => c.countyName !== '金門縣')) {
      expect(county.districts.flatMap(d => d.candidates).every(c => c.number === null)).toBe(true);
      expect(county.source.note).toContain('2026-10-27');
    }
    for (const e of verified.excluded) expect(counties.find(c => c.countyName === e.countyName)!.districts.find(d => d.no === e.districtNo)!.candidates.some(c => c.name === e.name)).toBe(false);
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
    const later = load(); later.national.source.tableDate = '2026-10-28';
    const before = structuredClone(later); applyVerifiedBallots(later.national, later.counties, verified); expect(later).toEqual(before);
    const mismatch = load(); mismatch.national.races.find(r => r.countyName === '金門縣')!.candidates.pop();
    expect(() => applyVerifiedBallots(mismatch.national, mismatch.counties, verified)).toThrow('不一致');
    const conflict = load(); conflict.national.races.find(r => r.countyName === '金門縣')!.candidates[0].number = 2;
    expect(() => applyVerifiedBallots(conflict.national, conflict.counties, verified)).toThrow('衝突');
  });
});
