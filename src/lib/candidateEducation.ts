import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Official, Source } from './types';
import { loadCandidacies, type Candidacy } from './candidacy';

export interface EducationRecord {
  id: string;
  items: string[];
  source: Source;
  sourceYear: number | null;
  note: string;
}
export interface CandidateEducation {
  slug: string;
  name: string;
  role: string;
  records: EducationRecord[];
  /** Explicitly reviewed career IDs; never hide school jobs by keyword. */
  excludedCareerIds: string[];
}
export interface EducationDataset {
  electionYear: number;
  updatedOn: string;
  candidates: CandidateEducation[];
}

/** The current election bulletin supersedes conflicting provisional sources. */
export function educationForDisplay(candidate?: CandidateEducation): EducationRecord[] {
  const records = candidate?.records ?? [];
  const bulletin = records.filter(r => r.source.type === 'gazette' && r.sourceYear === 2026);
  return bulletin.length ? bulletin : records;
}

export function indexCandidateEducation(
  data: EducationDataset,
  officials: Pick<Official, 'slug' | 'name' | 'careers'>[],
  candidacies: Map<string, Candidacy>,
): Map<string, CandidateEducation> {
  const errors: string[] = [];
  const date = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (data.electionYear !== 2026 || !date(data.updatedOn)) errors.push('選舉年或更新日期無效');
  const people = new Map(officials.map(o => [o.slug, o]));
  const result = new Map<string, CandidateEducation>();
  const ids = new Set<string>();
  for (const p of data.candidates) {
    const o = people.get(p.slug);
    if (!o || o.name !== p.name || candidacies.get(p.slug)?.role !== p.role) errors.push(`${p.slug}：姓名或參選職位不符`);
    if (result.has(p.slug)) errors.push(`${p.slug}：重複候選人`);
    const careerIds = new Set(o?.careers.map(c => c.id));
    if (new Set(p.excludedCareerIds).size !== p.excludedCareerIds.length || p.excludedCareerIds.some(id => !careerIds.has(id))) errors.push(`${p.slug}：學歷移出經歷的 ID 不符`);
    if (p.excludedCareerIds.length && !p.records.length) errors.push(`${p.slug}：不可隱藏未收錄的學歷`);
    for (const r of p.records) {
      if (!r.id || ids.has(r.id)) errors.push(`${p.slug}：紀錄 ID 空白或重複`);
      ids.add(r.id);
      if (!r.items.length || r.items.some(t => !t.trim()) || new Set(r.items).size !== r.items.length) errors.push(`${p.slug}：學歷內容空白或重複`);
      if (!r.source.title.trim() || !date(r.source.retrievedAt) || r.source.retrievedAt > data.updatedOn) errors.push(`${p.slug}：來源標題或日期無效`);
      if (!['gov', 'gazette', 'news', 'website', 'wiki'].includes(r.source.type)) errors.push(`${p.slug}：來源類型無效`);
      if (r.sourceYear !== null && (!Number.isInteger(r.sourceYear) || r.sourceYear < 1900 || r.sourceYear > data.electionYear)) errors.push(`${p.slug}：來源年份無效`);
      try {
        const u = new URL(r.source.url);
        if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error();
        if (r.source.type === 'gazette' && (!r.sourceYear || !(u.hostname === 'cec.gov.tw' || u.hostname.endsWith('.cec.gov.tw')))) errors.push(`${p.slug}：公報須附中選會來源與年份`);
      } catch { errors.push(`${p.slug}：來源網址無效`); }
    }
    result.set(p.slug, p);
  }
  for (const slug of candidacies.keys()) if (!result.has(slug)) errors.push(`${slug}：候選人名冊漏列`);
  if (errors.length) throw new Error(`學歷資料驗證失敗：\n${errors.join('\n')}`);
  return result;
}

let cache: Map<string, CandidateEducation> | undefined;
export function loadCandidateEducation(officials: Official[]): Map<string, CandidateEducation> {
  return cache ??= indexCandidateEducation(
    JSON.parse(readFileSync(join(process.cwd(), 'src/data/candidate-education.json'), 'utf8')),
    officials, loadCandidacies(),
  );
}
