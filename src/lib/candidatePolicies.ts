import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Official } from './types';
import { loadCandidacies, type Candidacy } from './candidacy';

export interface PolicyRecord {
  id: string;
  title: string;
  announcedOn: string | null;
  reviewedOn: string;
  source: {
    type: 'news' | 'campaign' | 'gazette' | 'civic';
    title: string;
    url: string;
    publishedOn: string | null;
  };
  proposals: { topic: string; summary: string }[];
}

export interface CandidatePolicies {
  slug: string;
  name: string;
  role: string;
  records: PolicyRecord[];
}

export interface PolicyDataset {
  electionYear: number;
  updatedOn: string;
  candidates: CandidatePolicies[];
}

export const POLICY_SOURCE_LABEL = { news: '新聞報導', campaign: '候選人／政黨競選資訊', gazette: '選舉公報', civic: '公民團體公開紀錄' };

const validDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const hasText = (value: string): boolean => typeof value === 'string' && value.trim().length > 0;

/** 核對 slug、姓名與參選職位，避免同名者或立委身分的市長參選人對錯檔案。 */
export function indexCandidatePolicies(
  data: PolicyDataset,
  officials: Pick<Official, 'slug' | 'name'>[],
  candidacies: Map<string, Candidacy>,
): Map<string, CandidatePolicies> {
  const errors: string[] = [];
  if (data.electionYear !== 2026) errors.push('政見須屬於 2026 選舉');
  if (!validDate(data.updatedOn)) errors.push('updatedOn 日期無效');
  const people = new Map(officials.map(o => [o.slug, o.name]));
  const index = new Map<string, CandidatePolicies>();
  const ids = new Set<string>();
  for (const candidate of data.candidates) {
    const key = candidate.slug;
    if (index.has(key)) errors.push(`${key}：重複候選人`);
    if (!people.has(key) || people.get(key) !== candidate.name) errors.push(`${key}：檔案姓名不符或不存在`);
    if (!candidacies.has(key) || candidacies.get(key)?.role !== candidate.role) errors.push(`${key}：參選職位不符或不在名單中`);
    if (!candidate.records.length) errors.push(`${key}：沒有政見紀錄，請勿建立空收錄`);
    for (const record of candidate.records) {
      const label = `${key}/${record.id}`;
      if (!hasText(record.id) || ids.has(record.id)) errors.push(`${label}：紀錄 ID 空白或重複`);
      ids.add(record.id);
      if (!hasText(record.title)) errors.push(`${label}：缺少標題`);
      if ((record.announcedOn !== null && !validDate(record.announcedOn)) || !validDate(record.reviewedOn) || (record.source.publishedOn !== null && !validDate(record.source.publishedOn))) {
        errors.push(`${label}：日期無效`);
      }
      if ((record.announcedOn !== null && record.announcedOn > (record.source.publishedOn ?? record.reviewedOn)) || (record.source.publishedOn !== null && record.source.publishedOn > record.reviewedOn) || record.reviewedOn > data.updatedOn) {
        errors.push(`${label}：發表、來源刊登、核對與更新日期順序不符`);
      }
      if (!Object.hasOwn(POLICY_SOURCE_LABEL, record.source.type) || !hasText(record.source.title)) errors.push(`${label}：缺少來源類型或標題`);
      try {
        const url = new URL(record.source.url);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
      } catch { errors.push(`${label}：來源網址無效`); }
      if (!record.proposals.length || record.proposals.some(p => !hasText(p.topic) || !hasText(p.summary))) errors.push(`${label}：政見主題與摘要不可空白`);
    }
    index.set(key, { ...candidate, records: [...candidate.records].sort((a, b) => (b.announcedOn ?? b.source.publishedOn ?? b.reviewedOn).localeCompare(a.announcedOn ?? a.source.publishedOn ?? a.reviewedOn) || a.id.localeCompare(b.id)) });
  }
  if (errors.length) throw new Error(`政見資料驗證失敗：\n- ${errors.join('\n- ')}`);
  return index;
}

let cache: Map<string, CandidatePolicies> | undefined;

/** 獨立的策展快照，不經 officials 匯出，定期資料刷新不會覆蓋政見。 */
export function loadCandidatePolicies(officials: Pick<Official, 'slug' | 'name'>[]): Map<string, CandidatePolicies> {
  if (!cache) {
    const data = JSON.parse(readFileSync(join(process.cwd(), 'src/data/candidate-policies.json'), 'utf8')) as PolicyDataset;
    cache = indexCandidatePolicies(data, officials, loadCandidacies());
  }
  return cache;
}

export function policyCount(candidate: CandidatePolicies | undefined): number {
  return candidate?.records.reduce((sum, record) => sum + record.proposals.length, 0) ?? 0;
}

export interface PolicyReview {
  slug: string;
  name: string;
  role: string;
  reviewedOn: string;
  status: 'collected' | 'pending-source';
  note: string;
  queries: string[];
  sources: { title: string; url: string }[];
}
export interface PolicyReviewDataset {
  electionYear: number;
  updatedOn: string;
  rosterDate: string;
  candidates: PolicyReview[];
}

/** 全名冊盤點與實際收錄分開，查不到不等於未發表。 */
export function indexPolicyReviews(data: PolicyReviewDataset, roster: Pick<PolicyReview, 'slug' | 'name' | 'role'>[], policies: Map<string, CandidatePolicies>): Map<string, PolicyReview> {
  if (data.electionYear !== 2026 || !validDate(data.updatedOn) || !validDate(data.rosterDate) || data.rosterDate > data.updatedOn) throw new Error('政見查核年度或日期無效');
  const people = new Map(roster.map(c => [c.slug, c]));
  const result = new Map<string, PolicyReview>();
  for (const review of data.candidates) {
    const person = people.get(review.slug);
    if (!person || person.name !== review.name || person.role !== review.role || result.has(review.slug)) throw new Error(`政見查核名冊不符或重複：${review.slug}`);
    if (!validDate(review.reviewedOn) || review.reviewedOn > data.updatedOn || !hasText(review.note)) throw new Error(`政見查核日期或說明無效：${review.slug}`);
    if (review.status !== (policies.has(review.slug) ? 'collected' : 'pending-source')) throw new Error(`政見查核狀態與收錄不符：${review.slug}`);
    if (!review.sources.length && !review.queries.length) throw new Error(`政見查核缺少來源或查詢紀錄：${review.slug}`);
    for (const source of review.sources) {
      const url = new URL(source.url);
      if (!hasText(source.title) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`政見查核來源無效：${review.slug}`);
    }
    result.set(review.slug, review);
  }
  if (result.size !== people.size) throw new Error('政見查核未涵蓋全體首長候選人');
  return result;
}

let reviewCache: Map<string, PolicyReview> | undefined;
export function loadPolicyReviews(policies: Map<string, CandidatePolicies>): Map<string, PolicyReview> {
  if (!reviewCache) {
    const data = JSON.parse(readFileSync(join(process.cwd(), 'src/data/candidate-policy-reviews.json'), 'utf8')) as PolicyReviewDataset;
    const roster = JSON.parse(readFileSync(join(process.cwd(), 'public/data/candidates/2026/national.json'), 'utf8')) as { source: { tableDate: string }; races: { countyName: string; candidates: { slug: string; name: string }[] }[] };
    if (data.rosterDate !== roster.source.tableDate) throw new Error('政見查核名冊日期已過期，請重新盤點');
    reviewCache = indexPolicyReviews(data, roster.races.flatMap(r => r.candidates.map(c => ({ ...c, role: `${r.countyName}長` }))), policies);
  }
  return reviewCache;
}
