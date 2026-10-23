import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { educationForDisplay, indexCandidateEducation, type EducationDataset } from '../src/lib/candidateEducation';
import { loadCandidacies } from '../src/lib/candidacy';
import type { Official } from '../src/lib/types';

const people = [{ slug: 'a', name: '甲', careers: [{ id: 'degree' }, { id: 'teacher' }] }] as Official[];
const candidacies = new Map([['a', { role: '臺北市長', countyKey: 'taipei', label: '2026 參選：臺北市長' }]]);
const fixture = (): EducationDataset => ({
  electionYear: 2026, updatedOn: '2026-10-16',
  candidates: [{ slug: 'a', name: '甲', role: '臺北市長', excludedCareerIds: ['degree'], records: [{
    id: 'old', items: ['某大學博士班肄業'], sourceYear: 2022, note: '保留原文狀態',
    source: { id: 's', title: '2022 年選舉公報', url: 'https://bulletin.cec.gov.tw/2022.pdf', type: 'gazette', retrievedAt: '2026-10-16' },
  }] }],
});
const index = (data: EducationDataset) => indexCandidateEducation(data, people, candidacies);

describe('候選人學歷與公報優先規則', () => {
  it('2026 公報取代暫列來源；舊屆公報不會排除其他來源', () => {
    const p = fixture().candidates[0];
    const official = structuredClone(p.records[0]);
    official.id = 'official'; official.source.type = 'gov'; official.sourceYear = null;
    official.items = ['某大學碩士'];
    p.records.push(official);
    expect(educationForDisplay(p)).toHaveLength(2);
    const current = structuredClone(p.records[0]); current.id = 'current'; current.sourceYear = 2026;
    current.items = ['某大學碩士、博士班肄業']; p.records.push(current);
    expect(educationForDisplay(p)).toEqual([current]);
    expect(p.records).toHaveLength(3);
  });
  it('未收錄仍保留名冊，不能隱藏經歷', () => {
    const d = fixture(); d.candidates[0].records = [];
    expect(() => index(d)).toThrow('不可隱藏');
    d.candidates[0].excludedCareerIds = [];
    expect(educationForDisplay(index(d).get('a'))).toEqual([]);
  });
  it.each(['name', 'slug', 'role'] as const)('拒絕同名或跨選區的錯置：%s', field => {
    const d = fixture(); d.candidates[0][field] = '另一人';
    expect(() => index(d)).toThrow('不符');
  });
  it('拒絕重複人、漏人、無效經歷 ID 及不安全來源', () => {
    const d = fixture(); d.candidates.push(structuredClone(d.candidates[0]));
    expect(() => index(d)).toThrow('重複候選人');
    d.candidates = []; expect(() => index(d)).toThrow('漏列');
    const bad = fixture(); bad.candidates[0].excludedCareerIds = ['unrelated'];
    expect(() => index(bad)).toThrow('ID 不符');
    bad.candidates[0].excludedCareerIds = [];
    bad.candidates[0].records[0].source.url = 'javascript:alert(1)';
    expect(() => index(bad)).toThrow('網址無效');
  });
  it('公報優先必須有中選會來源及明確年份', () => {
    const d = fixture(); d.candidates[0].records[0].source.url = 'https://example.com/profile';
    expect(() => index(d)).toThrow('公報須附中選會來源');
  });
  it('正式快照覆蓋全部候選人，來源與移出經歷的 ID 均可驗證', () => {
    const d = JSON.parse(readFileSync('src/data/candidate-education.json', 'utf8')) as EducationDataset;
    const officials = JSON.parse(readFileSync('src/data/officials.json', 'utf8')) as Official[];
    const map = indexCandidateEducation(d, officials, loadCandidacies());
    expect(map.size).toBe(1573);
    expect([...map.values()].filter(p => p.records.length).length).toBe(1164);
    // A university job or a foundation named after a PhD must remain in careers.
    const forbidden = /基金會董事|兼任講師|家長會長/;
    for (const p of map.values()) {
      const o = officials.find(o => o.slug === p.slug)!;
      expect(o.careers.filter(c => p.excludedCareerIds.includes(c.id)).some(c => forbidden.test(c.title))).toBe(false);
      expect(p.records.some(r => r.items.some(t => t === 'Academic Qualifications'))).toBe(false);
    }
    // Independent ownership checks stop a cited colleague's page being assigned to the subject.
    const qiu = [...map.values()].find(p => p.name === '邱莉莉')!;
    expect(qiu.records.flatMap(r => r.items).join(' ')).not.toContain('南臺工專');
    const lin = [...map.values()].find(p => p.name === '林智鴻')!;
    expect(lin.records.flatMap(r => r.items).join(' ')).not.toContain('公共衛生');
  });
});
