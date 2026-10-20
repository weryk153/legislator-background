import type { EducationRecord } from './candidateEducation';
import type { PolicyRecord } from './candidatePolicies';
import type { Source } from './types';

export const MAX_COMPARISON = 4;
export interface ComparisonCandidate {
  id: string;
  slug: string | null;
  name: string;
  party: string;
  number: number | null;
  photoUrl: string | null;
  photoCredit?: { author: string; license: string; commonsUrl: string };
  education: EducationRecord[];
  careers: { text: string; source: Source }[];
  policies: PolicyRecord[];
  donations: { id: string; electionName: string; reportSeq: string; totalIncome: number; totalExpense: number; source: Source }[];
}

/** Scope every URL identity to this district; never match people by name. */
export function readComparison(search: string, candidates: Pick<ComparisonCandidate, 'id'>[]) {
  const requested = new URLSearchParams(search).getAll('compare');
  const allowed = new Set(candidates.map(c => c.id));
  const unique = [...new Set(requested)];
  const valid = unique.filter(id => allowed.has(id));
  return { ids: valid.slice(0, MAX_COMPARISON), adjusted: valid.length !== requested.length || valid.length > MAX_COMPARISON };
}

export function comparisonUrl(canonical: string, ids: string[], topic: ComparisonTopic = 'education'): string {
  const url = new URL(canonical);
  url.search = '';
  for (const id of [...new Set(ids)].slice(0, MAX_COMPARISON)) url.searchParams.append('compare', id);
  if (topic !== 'education' && ids.length >= 2) url.searchParams.set('topic', topic);
  url.hash = ids.length >= 2 ? 'comparison-results' : 'compare';
  return url.href;
}

export function toggleComparison(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(value => value !== id)
    : ids.length < MAX_COMPARISON ? [...ids, id] : ids;
}

export const COMPARISON_TOPICS = ['education', 'careers', 'policies', 'donations'] as const;
export type ComparisonTopic = typeof COMPARISON_TOPICS[number];
export function readComparisonTopic(search: string): ComparisonTopic {
  const value = new URLSearchParams(search).get('topic');
  return COMPARISON_TOPICS.find(topic => topic === value) ?? 'education';
}

/** Put the chosen person in one of the two mobile columns without losing the other selections. */
export function swapComparison(ids: string[], column: 0 | 1, id: string): string[] {
  const from = ids.indexOf(id);
  if (ids.length < 2 || from < 0 || from === 1 - column) return ids;
  const next = [...ids];
  [next[column], next[from]] = [next[from], next[column]];
  return next;
}
