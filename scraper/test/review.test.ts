import { describe, it, expect } from 'vitest';
import { buildReviewFile, collectApproved } from '../lib/review';
import type { AdapterResult, Target, ReviewFile } from '../lib/types';

const target: Target = { id: 't1', name: '王世堅', party: '民進黨', district: '台北市', office: 'legislator', keywords: [], aliases: [] };
const src = { url: 'https://x', title: 't', type: 'gov' as const, retrievedAt: '2026-06-01' };

const results: AdapterResult[] = [
  { source: 'ly', ok: true, careers: [{ title: '議員', organization: '台北市議會', startDate: '2010', endDate: '2024', source: src }] },
  { source: 'cy', ok: true, assets: [{ year: 2024, totalAmount: 0, source: { ...src, type: 'gazette' } }] },
  { source: 'judgments', ok: true, judgments: [{ caseReason: '妨害名譽', court: '北院', caseNumber: '1', outcome: '無罪', isFinal: false, judgmentDate: '2024', judgmentUrl: 'https://j', source: { ...src, type: 'court' }, match: { confidence: 0.4, signals: ['name-exact'] } }] },
];

describe('buildReviewFile', () => {
  it('groups candidates, careers approved, assets+judgments need human approval', () => {
    const rf = buildReviewFile(target, results, '2026-06-17T00:00:00Z');
    expect(rf.targetId).toBe('t1');
    expect(rf.careers[0].approved).toBe(true);
    expect(rf.assets[0].approved).toBe(false); // gazette amount unknown → must be reviewed
    expect(rf.judgments[0].approved).toBe(false);
    expect(rf.judgments[0].status).toBe('needs_review');
    expect(rf.report.find((r) => r.source === 'cy')?.ok).toBe(true);
  });
});

describe('collectApproved', () => {
  it('returns only approved items with their targetId', () => {
    const rf: ReviewFile = buildReviewFile(target, results, '2026-06-17T00:00:00Z');
    rf.judgments[0].approved = true; // simulate human approval
    const out = collectApproved([rf]);
    expect(out.careers).toHaveLength(1);
    expect(out.judgments).toHaveLength(1);
    expect(out.careers[0].targetId).toBe('t1');
  });

  it('excludes unapproved judgments', () => {
    const rf = buildReviewFile(target, results, '2026-06-17T00:00:00Z'); // judgment stays approved:false
    const out = collectApproved([rf]);
    expect(out.judgments).toHaveLength(0);
  });
});
