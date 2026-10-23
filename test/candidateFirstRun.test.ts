import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { applyFirstRuns, type FirstRunConfirmation } from '../scraper/lib/candidateFirstRun';
import { candidacyIndex } from '../src/lib/candidacy';
import { electionCandidates } from '../src/lib/electionFinder';
import type { CandidateEntry, CountyCandidates, NationalCandidates } from '../src/lib/candidateTypes';

const record: FirstRunConfirmation = {
  slug: 'new-a', name: '同名', race: '臺北市第1選舉區', year: 2026, scope: 'public-office',
  source: { title: '具名參選報導', url: 'https://example.org/report', publishedOn: '2026-09-01' },
  reviewedOn: '2026-10-13', basis: '報導明確確認本次為第一次參選公職。',
};
const candidate = (slug: string): CandidateEntry => ({
  name: '同名', slug, partyName: '無', partyCode: '999', number: null, registeredOn: '2026-09-01', identity: null,
});
function fixture() {
  const source = { stage: 'registration' as const, url: 'https://example.org/roster', tableDate: '2026-09-07' };
  const national: NationalCandidates = { source, races: [{ countyCode: '63-000-00-000-0000', countyName: '臺北市', isMunicipality: true, candidates: [candidate('chief')], incumbent2022: null }] };
  const counties: CountyCandidates[] = [{ source, countyCode: '63-000-00-000-0000', countyName: '臺北市', townToDistrict: null, splitTowns: [], mappingNote: null,
    districts: [{ no: 1, label: '第1選舉區', type: 'regional', candidates: [candidate('new-a'), candidate('new-b')] }] }];
  return { national, counties };
}

describe('有來源的首次參選標記', () => {
  it('只套用確認的本人；同名與沒有歷史資料的人仍不標記', () => {
    const { national, counties } = fixture();
    applyFirstRuns(national, counties, [record], 2026);
    expect(counties[0].districts[0].candidates[0].firstRun?.source.url).toBe(record.source.url);
    expect(counties[0].districts[0].candidates[1].firstRun).toBeUndefined();
    expect(national.races[0].candidates[0].firstRun).toBeUndefined();
  });
  it.each([
    { ...record, name: '別人' }, { ...record, race: '臺北市第2選舉區' },
    { ...record, slug: 'not-linked' }, { ...record, year: 2022 },
    { ...record, source: { ...record.source, url: 'javascript:alert(1)' } },
    { ...record, basis: '' },
  ])('拒絕年度、身分或來源不符：%j', invalid => {
    const { national, counties } = fixture();
    expect(() => applyFirstRuns(national, counties, [invalid], 2026)).toThrow();
    expect(counties[0].districts[0].candidates.every(c => !c.firstRun)).toBe(true);
  });
  it('重複確認會中止，且不留下部分標記', () => {
    const { national, counties } = fixture();
    expect(() => applyFirstRuns(national, counties, [record, record], 2026)).toThrow(/重複/);
    expect(counties[0].districts[0].candidates[0].firstRun).toBeUndefined();
  });
  it('查詢名冊與個人頁索引保留年度及來源', () => {
    const { national, counties } = fixture();
    applyFirstRuns(national, counties, [record], 2026);
    expect(candidacyIndex(national, counties).get('new-a')?.firstRun?.year).toBe(2026);
    expect(electionCandidates(national, counties).find(c => c.slug === 'new-a')?.firstRun?.source).toEqual(record.source);
    expect(candidacyIndex(national, counties).get('new-b')?.firstRun).toBeUndefined();
  });
  it('實際查證表與目前名冊身分、選區一致', () => {
    const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
    const dir = 'public/data/candidates/2026';
    const national = read(`${dir}/national.json`) as NationalCandidates;
    const counties = readdirSync(`${dir}/county`).filter(f => f.endsWith('.json')).map(f => read(`${dir}/county/${f}`)) as CountyCandidates[];
    const records = read('scraper/candidate-first-runs-confirmed.json') as FirstRunConfirmation[];
    expect(records.length).toBeGreaterThan(0);
    expect(() => applyFirstRuns(national, counties, records, 2026)).not.toThrow();
  });
  it('全國逐人查核完整涵蓋名冊，且只發布已確認的首次參選者', () => {
    const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
    const dir = 'public/data/candidates/2026';
    const national = read(`${dir}/national.json`) as NationalCandidates;
    const counties = readdirSync(`${dir}/county`).filter(f => f.endsWith('.json')).map(f => read(`${dir}/county/${f}`)) as CountyCandidates[];
    const entries = [...national.races.flatMap(r => r.candidates), ...counties.flatMap(c => c.districts.flatMap(d => d.candidates))];
    const audit = read('scraper/candidate-first-run-audit.json').records as Array<{ slug: string; status: string; reviewedOn: string; evidence: Array<{ url: string; title: string; basis: string }>; searches: unknown[]; reason?: string }>;
    const confirmed = read('scraper/candidate-first-runs-confirmed.json') as FirstRunConfirmation[];
    expect(new Set(audit.map(r => r.slug)).size).toBe(audit.length);
    const excluded = new Set(read('scraper/candidate-registrations-2026-excluded.json').records.map((r: { candidate: { slug: string } }) => r.candidate.slug));
    expect(audit.filter(r => !excluded.has(r.slug)).map(r => r.slug).sort()).toEqual(entries.map(r => r.slug).sort());
    expect(audit.filter(r => excluded.has(r.slug))).toHaveLength(10);
    for (const r of audit) {
      expect(['first-run', 'previously-ran', 'unresolved']).toContain(r.status);
      expect(r.reviewedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (r.status === 'unresolved') {
        expect(r.searches.length).toBeGreaterThan(0);
        expect(r.reason).toBeTruthy();
      } else {
        expect(r.evidence.length).toBeGreaterThan(0);
        for (const e of r.evidence) {
          expect(e.url).toMatch(/^https?:\/\//);
          expect(e.title).toBeTruthy();
          expect(e.basis).toBeTruthy();
        }
      }
    }
    const first = audit.filter(r => r.status === 'first-run').map(r => r.slug).sort();
    expect(confirmed.map(r => r.slug).sort()).toEqual(first);
    expect(entries.filter(r => r.firstRun).map(r => r.slug).sort()).toEqual(first);
    for (const r of confirmed) {
      const evidence = audit.find(a => a.slug === r.slug)!.evidence[0];
      expect(r.source.url).toBe(evidence.url);
      expect(r.basis).toBe(evidence.basis);
    }
  });
});
