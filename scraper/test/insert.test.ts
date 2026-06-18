import { describe, it, expect } from 'vitest';
import { planInserts } from '../lib/insert';
import type { ReviewFile, Target } from '../lib/types';

const src = { url: 'https://x', title: 't', type: 'court' as const, retrievedAt: '2026-06-01' };

// Self-contained target fixture (don't depend on the live roster file).
const targets: Target[] = [
  { id: 'wang-shih-chien', name: '王世堅', party: '民進黨', district: '臺北市', office: 'legislator', keywords: [], aliases: [] },
];

function reviewWith(judgmentSource: typeof src | undefined): ReviewFile {
  return {
    targetId: 'wang-shih-chien', name: '王世堅', generatedAt: '2026-06-17T00:00:00Z',
    careers: [], assets: [],
    judgments: [{ approved: true, status: 'needs_review', data: {
      caseReason: 'x', court: '北院', caseNumber: '1', outcome: '無罪', isFinal: false,
      judgmentDate: '2024', judgmentUrl: 'u', source: judgmentSource as never, defendantNames: [], match: { confidence: 0.4, signals: [] },
    } }],
    wikiControversies: [],
    report: [],
  };
}

describe('planInserts', () => {
  it('rejects approved judgments missing a source (validation gate)', () => {
    const plan = planInserts([reviewWith(undefined)], targets);
    expect(plan.rejected.length).toBe(1);
    expect(plan.rejected[0].reason).toMatch(/missing source/);
    expect(plan.judgments.length).toBe(0);
  });

  it('accepts a valid approved judgment and assigns its natural key', () => {
    const plan = planInserts([reviewWith(src)], targets);
    expect(plan.judgments.length).toBe(1);
    expect(plan.judgments[0].key).toBe('北院|1');
  });
});
