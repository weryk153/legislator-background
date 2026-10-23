import { describe, it, expect } from 'vitest';
import { pageShareUrl } from '../src/lib/share';
import { readComparison, comparisonUrl, toggleComparison, swapComparison, readComparisonTopic } from '../src/lib/candidateComparison';
import { comparisonCandidate } from '../src/lib/candidateComparisonData';
import { loadDistrictPages } from '../src/lib/districtPageData';
import { loadOfficials } from '../src/lib/data';
import { loadCandidateEducation } from '../src/lib/candidateEducation';
import { loadCandidatePolicies } from '../src/lib/candidatePolicies';
import type { CandidateEntry } from '../src/lib/candidateTypes';

const candidates = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }));
describe('同選區比較與分享', () => {
  it('按勾選順序還原，排除跨區身分、重複及第五人', () => {
    expect(readComparison('?compare=b&compare=a', candidates)).toEqual({ ids: ['b', 'a'], adjusted: false });
    expect(readComparison('?compare=other-district&compare=a&compare=a&compare=b&compare=c&compare=d&compare=e', candidates))
      .toEqual({ ids: ['a', 'b', 'c', 'd'], adjusted: true });
    expect(readComparison('?compare=<script>', candidates)).toEqual({ ids: [], adjusted: true });
  });
  it('選四人後可取消更換；不自動選擇或替換其他人', () => {
    expect(toggleComparison(['a', 'b', 'c', 'd'], 'e')).toEqual(['a', 'b', 'c', 'd']);
    expect(toggleComparison(['a', 'b', 'c', 'd'], 'b')).toEqual(['a', 'c', 'd']);
    expect(toggleComparison(['a', 'c', 'd'], 'e')).toEqual(['a', 'c', 'd', 'e']);
    expect(readComparison('', candidates).ids).toEqual([]);
  });
  it('分享只含比較身分、保留中文長名字，移除追蹤參數', () => {
    const ids = ['中文-name', 'unlinked:名字 Haisul Islituan'];
    const url = new URL(comparisonUrl('https://example.test/elections/2026/taipei/district-6/?utm_source=x#x', ids));
    expect(url.origin).toBe('https://example.test');
    expect([...url.searchParams.keys()]).toEqual(['compare', 'compare']);
    expect(readComparison(url.search, ids.map(id => ({ id }))).ids).toEqual(ids);
    expect(url.hash).toBe('#comparison-results');
  });
  it('選區頁頂端分享也保留比較，且不把本機網域或追蹤參數帶出去', () => {
    expect(pageShareUrl('https://example.test/elections/2026/taipei/district-6/',
      'http://localhost:4322/elections/2026/taipei/district-6/?compare=b&compare=a&utm_source=x'))
      .toBe('https://example.test/elections/2026/taipei/district-6/?compare=b&compare=a#comparison-results');
  });
  it('手機換人保留四人且不讓左右變成同一人', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(swapComparison(ids, 0, 'c')).toEqual(['c', 'b', 'a', 'd']);
    expect(swapComparison(ids, 1, 'd')).toEqual(['a', 'd', 'c', 'b']);
    expect(swapComparison(ids, 0, 'b')).toEqual(ids);
    expect(swapComparison(ids, 1, 'other-district')).toEqual(ids);
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });
  it('分享還原目前對照兩人和項目，忽略非法項目', () => {
    const ids = swapComparison(['a', 'b', 'c', 'd'], 0, 'c');
    const url = new URL(comparisonUrl('https://example.test/elections/2026/taipei/district-6/', ids, 'donations'));
    expect(readComparison(url.search, candidates).ids.slice(0, 2)).toEqual(['c', 'b']);
    expect(readComparisonTopic(url.search)).toBe('donations');
    expect(readComparisonTopic('?topic=unknown')).toBe('education');
    expect(pageShareUrl('https://example.test/elections/2026/taipei/district-6/',
      'http://localhost:4322/elections/2026/taipei/district-6/?compare=c&compare=b&topic=donations&utm_source=x'))
      .toBe('https://example.test/elections/2026/taipei/district-6/?compare=c&compare=b&topic=donations#comparison-results');
  });
  it('缺檔案仍保留名冊身分，缺資料不補零、不找同名替代', () => {
    const candidate: CandidateEntry = { name: '測試同名', slug: null, partyName: '無', partyCode: null, registeredOn: '2026-09-01', number: null, identity: null };
    const result = comparisonCandidate(candidate);
    expect(result).toMatchObject({ id: 'unlinked:測試同名', name: '測試同名', slug: null, photoUrl: null, donations: [], policies: [], education: [], careers: [] });
  });
  it('221 區全名冊逐人可比較、不跨區；保留教育資格、來源及各份獻金申報', async () => {
    const officials = await loadOfficials();
    const bySlug = new Map(officials.map(o => [o.slug, o]));
    const education = loadCandidateEducation(officials);
    const policies = loadCandidatePolicies(officials);
    let count = 0;
    for (const page of loadDistrictPages()) {
      const people = page.district.candidates.map(c => comparisonCandidate(c, c.slug ? bySlug.get(c.slug) : undefined,
        c.slug ? education.get(c.slug) : undefined, c.slug ? policies.get(c.slug) : undefined));
      expect(new Set(people.map(p => p.id)).size).toBe(people.length);
      for (const person of people) {
        count++;
        const original = person.slug ? bySlug.get(person.slug) : undefined;
        expect(person.donations.map(d => [d.electionName, d.reportSeq, d.totalIncome, d.totalExpense, d.source]))
          .toEqual((original?.donations ?? []).map(d => [d.electionName, d.reportSeq, d.totalIncome, d.totalExpense, d.source]));
        for (const r of person.education) expect(r.items).toEqual(education.get(person.slug!)?.records.find(e => e.id === r.id)?.items);
        expect(person.careers.some(c => /2026.*選舉登記參選/.test(c.text))).toBe(false);
        if (original) expect(() => comparisonCandidate({ ...page.district.candidates[0], slug: 'different-person' }, original)).toThrow();
      }
      const ids = people.slice(0, 4).map(p => p.id);
      expect(readComparison(new URL(comparisonUrl(`https://example.test${page.path}`, ids)).search, people).ids).toEqual(ids);
    }
    expect(count).toBe(1492);
  });
});
