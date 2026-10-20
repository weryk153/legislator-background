import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadChiefPolicyComparison, buildChiefPolicyCounties } from '../src/lib/chiefPolicyComparisonData';
import { readChiefPolicyState, chiefPolicyUrl, filterChiefPolicies, legacyChiefPolicyPath } from '../src/lib/chiefPolicyComparison';
import { loadCandidatePolicies } from '../src/lib/candidatePolicies';
import { loadOfficials } from '../src/lib/data';
import type { NationalCandidates } from '../src/lib/candidateTypes';

describe('同縣市縣市長完整政見比較', () => {
  it('舊獨立入口轉回縣市頁，保留人選並排除任意導向與追蹤參數', () => {
    expect(legacyChiefPolicyPath('?county=new-taipei&left=a&right=b&q=教育&utm_source=x')).toBe('/elections/2026/new-taipei/?county=new-taipei&left=a&right=b&q=%E6%95%99%E8%82%B2#policy-comparison');
    expect(legacyChiefPolicyPath('?county=taipei')).toBe('/elections/2026/taipei/?county=taipei#chief-title');
    expect(legacyChiefPolicyPath('?county=https://other.test')).toBe('/elections/#finder-title');
    expect(legacyChiefPolicyPath('')).toBe('/elections/#finder-title');
  });
  it('全體名冊沿用既有政見全文與來源，沒有交通或其他議題限定', async () => {
    const { counties } = await loadChiefPolicyComparison();
    const national = JSON.parse(readFileSync('public/data/candidates/2026/national.json', 'utf8')) as NationalCandidates;
    const policies = loadCandidatePolicies(await loadOfficials());
    expect(counties.flatMap(c => c.people.map(p => p.slug))).toEqual(national.races.flatMap(r => r.candidates.map(p => p.slug)));
    for (const county of counties) for (const person of county.people) {
      expect(person.role).toBe(`${county.name}長`);
      expect(person.records).toEqual(policies.get(person.slug!)?.records ?? []);
    }
    const topics = counties.flatMap(c => c.people.flatMap(p => p.records.flatMap(r => r.proposals.map(p => p.topic))));
    expect(topics).toContain('教師權益');
    expect(topics).toContain('青年育兒宅');
    expect(topics).toContain('長照補助');
    expect(counties.flatMap(c => c.people).filter(p => p.records.length)).toHaveLength(policies.size);
  });
  it('沒有有效縣市時不帶入任何人或搜尋；不跨縣市、不讓左右同人', async () => {
    const { counties } = await loadChiefPolicyComparison();
    const [taipei, newTaipei] = counties;
    const a = taipei.people[0].id;
    const b = taipei.people[1].id;
    const other = newTaipei.people[0].id;
    const read = (values: Record<string, string>) => readChiefPolicyState(new URLSearchParams(values).toString(), counties);
    expect(read({ left: a, right: b, q: '交通' })).toEqual({ county: '', left: '', right: '', q: '' });
    expect(read({ county: 'unknown', left: a })).toEqual({ county: '', left: '', right: '', q: '' });
    expect(read({ county: taipei.key, left: a, right: other })).toMatchObject({ county: taipei.key, left: a, right: '' });
    expect(read({ county: taipei.key, left: a, right: a })).toMatchObject({ left: a, right: '' });
    expect(read({ county: newTaipei.key, left: a, right: b })).toMatchObject({ county: newTaipei.key, left: '', right: '' });
  });
  it('即使沒有政見仍保留同縣市候選人身分，不能找同名替代', async () => {
    const { counties } = await loadChiefPolicyComparison();
    const county = counties.find(c => c.people.some(p => !p.records.length))!;
    const person = county.people.find(p => !p.records.length)!;
    expect(readChiefPolicyState(new URLSearchParams({ county: county.key, left: person.id }).toString(), counties).left).toBe(person.id);
    expect(person.records).toEqual([]);
  });
  it('縣市頁直接比較：網址不能切換縣市，分享與重新載入保留原頁及人選', async () => {
    const { counties } = await loadChiefPolicyComparison();
    const [taipei, newTaipei] = counties;
    const params = new URLSearchParams({ county: newTaipei.key, left: taipei.people[0].id, right: newTaipei.people[0].id });
    const state = readChiefPolicyState(params.toString(), [taipei], taipei.key);
    expect(state).toEqual({ county: taipei.key, left: taipei.people[0].id, right: '', q: '' });
    const base = `https://example.test/elections/2026/${taipei.key}/`;
    const url = new URL(chiefPolicyUrl(base, { ...state, right: taipei.people[1].id }));
    expect(url.pathname).toBe(`/elections/2026/${taipei.key}/`);
    expect(readChiefPolicyState(url.search, [taipei], taipei.key)).toEqual({ ...state, right: taipei.people[1].id });
    expect(readChiefPolicyState('', [taipei], taipei.key)).toEqual({ county: taipei.key, left: '', right: '', q: '' });
  });
  it('關鍵字只縮小原摘要，保留構想與評估限定語；清空恢復完整資料', async () => {
    const { counties } = await loadChiefPolicyComparison();
    const person = counties.find(c => c.key === 'hualien')!.people.find(p => p.name === '魏嘉賢')!;
    const original = JSON.stringify(person.records);
    const found = filterChiefPolicies(person.records, '高鐵');
    expect(found.length).toBeGreaterThan(0);
    expect(found.flatMap(r => r.proposals).some(p => p.summary.includes('非承諾立即興建'))).toBe(true);
    expect(filterChiefPolicies(person.records, '沒有符合的關鍵字')).toEqual([]);
    expect(filterChiefPolicies(person.records, '')).toEqual(person.records);
    expect(JSON.stringify(person.records)).toBe(original);
  });
  it('分享固定正式網址、還原同縣市左右人選及關鍵字、排除其他參數', async () => {
    const { counties } = await loadChiefPolicyComparison();
    const county = counties[0];
    const state = { county: county.key, left: county.people[1].id, right: county.people[0].id, q: '通學' };
    const url = new URL(chiefPolicyUrl('https://example.test/elections/2026/policies/?utm_source=x#old', state));
    expect(url.origin).toBe('https://example.test');
    expect([...url.searchParams.keys()]).toEqual(['county', 'left', 'right', 'q']);
    expect(url.hash).toBe('');
    expect(readChiefPolicyState(url.search, counties)).toEqual(state);
    expect(readChiefPolicyState(`?county=${county.key}&q=${'字'.repeat(100)}`, counties).q).toHaveLength(80);
  });
  it('錯誤職位的政見不能顯示在縣市長比較中', async () => {
    const national = JSON.parse(readFileSync('public/data/candidates/2026/national.json', 'utf8')) as NationalCandidates;
    const policies = new Map(loadCandidatePolicies(await loadOfficials()));
    const [slug, person] = [...policies][0];
    policies.set(slug, { ...person, role: '議員' });
    expect(() => buildChiefPolicyCounties(national, policies)).toThrow('職位不符');
  });
});
