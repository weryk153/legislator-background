import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexCandidatePolicies, indexPolicyReviews, policyCount, type PolicyDataset } from '../src/lib/candidatePolicies';
import { loadCandidacies } from '../src/lib/candidacy';

const fixture = (): PolicyDataset => ({
  electionYear: 2026,
  updatedOn: '2026-10-16',
  candidates: [{
    slug: 'incumbent-legislator', name: '甲', role: '臺北市長',
    records: [{
      id: 'transport', title: '交通主張', announcedOn: '2026-07-08', reviewedOn: '2026-10-16',
      source: { type: 'news', title: '報導', url: 'https://example.com/report', publishedOn: '2026-07-09' },
      proposals: [{ topic: '通學安全', summary: '提出改善通學步道。' }],
    }],
  }],
});
const people = [{ slug: 'incumbent-legislator', name: '甲' }];
const candidacies = new Map([['incumbent-legislator', { role: '臺北市長', label: '2026 參選：臺北市長', countyKey: 'taipei' }]]);
const index = (data: PolicyDataset) => indexCandidatePolicies(data, people, candidacies);

describe('2026 政見收錄檢核', () => {
  it('使用現有 slug 與參選職位，可收錄現任立委的市長政見', () => {
    const candidate = index(fixture()).get('incumbent-legislator');
    expect(candidate?.role).toBe('臺北市長');
    expect(policyCount(candidate)).toBe(1);
    expect(policyCount(undefined)).toBe(0);
  });

  it.each(['name', 'slug', 'role'] as const)('拒絕錯置的 %s', (field) => {
    const data = fixture();
    data.candidates[0][field] = '另一人或另一選區';
    expect(() => index(data)).toThrow(/不符|不存在/);
  });

  it('拒絕不在本屆候選人名單內的個人檔案', () => {
    expect(() => indexCandidatePolicies(fixture(), people, new Map())).toThrow('不在名單');
    const data = fixture();
    data.electionYear = 2022;
    expect(() => index(data)).toThrow('2026');
  });

  it('拒絕重複人與重複紀錄，避免計數重複或覆蓋', () => {
    const data = fixture();
    data.candidates.push(structuredClone(data.candidates[0]));
    expect(() => index(data)).toThrow('重複候選人');
    data.candidates.pop();
    data.candidates[0].records.push(structuredClone(data.candidates[0].records[0]));
    expect(() => index(data)).toThrow('ID 空白或重複');
  });

  it.each(['javascript:alert(1)', '', 'https://user:password@example.com'])('拒絕無效或含憑證來源 %s', (url) => {
    const data = fixture();
    data.candidates[0].records[0].source.url = url;
    expect(() => index(data)).toThrow('來源網址無效');
  });

  it('拒絕無來源或空摘要', () => {
    const data = fixture();
    data.candidates[0].records[0].source.title = ' ';
    expect(() => index(data)).toThrow('來源類型或標題');
    data.candidates[0].records[0].source.title = '報導';
    data.candidates[0].records[0].proposals[0].summary = '';
    expect(() => index(data)).toThrow('摘要不可空白');
  });

  it('拒絕無效日期、來源先於發表，以及核對早於來源的紀錄', () => {
    for (const announcedOn of ['2026-02-30', '2026-07-10']) {
      const data = fixture();
      data.candidates[0].records[0].announcedOn = announcedOn;
      expect(() => index(data)).toThrow(/日期無效|順序不符/);
    }
    const data = fixture();
    data.candidates[0].records[0].reviewedOn = '2026-07-08';
    expect(() => index(data)).toThrow('順序不符');
  });

  it('新發表在前，保留舊紀錄及來源，不改動輸入', () => {
    const data = fixture();
    const newer = structuredClone(data.candidates[0].records[0]);
    newer.id = 'newer';
    newer.announcedOn = newer.source.publishedOn = '2026-08-11';
    data.candidates[0].records.push(newer);
    const result = index(data).get('incumbent-legislator')!;
    expect(result.records.map(r => r.id)).toEqual(['newer', 'transport']);
    expect(data.candidates[0].records[0].id).toBe('transport');
    expect(policyCount(result)).toBe(2);
  });

  it('未載明發表日可明示未知，不接受空字串冒充來源日期', () => {
    const data = fixture();
    data.candidates[0].records[0].announcedOn = null;
    data.candidates[0].records[0].source.type = 'civic';
    expect(index(data).get('incumbent-legislator')?.records[0].announcedOn).toBeNull();
    data.candidates[0].records[0].source.publishedOn = '';
    expect(() => index(data)).toThrow('日期無效');
  });

  it('無日期官網保留未知，仍以核對日檢查未來日期並穩定排序', () => {
    const data = fixture();
    const record = data.candidates[0].records[0];
    record.announcedOn = null;
    record.source.publishedOn = null;
    record.source.type = 'campaign';
    const result = index(data).get('incumbent-legislator')!.records[0];
    expect(result.source.publishedOn).toBeNull();
    expect(result.announcedOn).toBeNull();
    record.announcedOn = '2026-10-17';
    expect(() => index(data)).toThrow('順序不符');
  });

  it('實際收錄的每人、每筆均通過名冊、來源與日期檢查', () => {
    const data = JSON.parse(readFileSync('src/data/candidate-policies.json', 'utf8'));
    const officials = JSON.parse(readFileSync('src/data/officials.json', 'utf8'));
    const policies = indexCandidatePolicies(data, officials, loadCandidacies());
    expect(policies.size).toBeGreaterThanOrEqual(3);
    expect([...policies.values()].reduce((total, candidate) => total + policyCount(candidate), 0)).toBeGreaterThanOrEqual(12);
  });
});

describe('首長政見全名冊查核', () => {
  const actual = () => {
    const policiesData = JSON.parse(readFileSync('src/data/candidate-policies.json', 'utf8'));
    const officials = JSON.parse(readFileSync('src/data/officials.json', 'utf8'));
    const policies = indexCandidatePolicies(policiesData, officials, loadCandidacies());
    const data = JSON.parse(readFileSync('src/data/candidate-policy-reviews.json', 'utf8'));
    const national = JSON.parse(readFileSync('public/data/candidates/2026/national.json', 'utf8'));
    const roster = national.races.flatMap((r: { countyName: string; candidates: { slug: string; name: string }[] }) => r.candidates.map(c => ({ ...c, role: `${r.countyName}長` })));
    return { policies, data, roster, national };
  };
  it('全81人均有查核紀錄，收錄與待補狀態吻合且22縣市均有內容', () => {
    const { data, roster, policies, national } = actual();
    const reviews = indexPolicyReviews(data, roster, policies);
    expect(data.rosterDate).toBe(national.source.tableDate);
    expect(reviews.size).toBe(81);
    expect(roster.filter((c: { slug: string }) => policies.has(c.slug))).toHaveLength(75);
    expect([...policies.values()].filter(c => c.role.endsWith('議員'))).toHaveLength(2);
    expect([...reviews.values()].filter(r => r.status === 'pending-source')).toHaveLength(6);
    expect(national.races.every((r: { candidates: { slug: string }[] }) => r.candidates.some(c => policies.has(c.slug)))).toBe(true);
  });
  it('漏掉候選人、姓名錯置或重複都會阻止建置', () => {
    for (const mutation of ['missing', 'wrong', 'duplicate']) {
      const { data, roster, policies } = actual();
      if (mutation === 'missing') data.candidates.pop();
      if (mutation === 'wrong') data.candidates[0].name = '同名錯人';
      if (mutation === 'duplicate') data.candidates.push(data.candidates[0]);
      expect(() => indexPolicyReviews(data, roster, policies)).toThrow(/未涵蓋|不符|重複/);
    }
  });
  it('不能把無政見者標為已收錄，也不能留下無查核依據的狀態', () => {
    const { data, roster, policies } = actual();
    const pending = data.candidates.find((c: { status: string }) => c.status === 'pending-source');
    pending.status = 'collected';
    expect(() => indexPolicyReviews(data, roster, policies)).toThrow('狀態與收錄不符');
    pending.status = 'pending-source';
    pending.sources = []; pending.queries = [];
    expect(() => indexPolicyReviews(data, roster, policies)).toThrow('缺少來源或查詢紀錄');
  });
});
