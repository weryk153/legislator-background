import { describe, it, expect } from 'vitest';
import { planInserts } from '../lib/insert';
import { loadTargets } from '../lib/targets';
import type { ReviewFile } from '../lib/types';

const src = { url: 'https://x', title: 't', type: 'court' as const, retrievedAt: '2026-06-01' };

function reviewWith(judgmentSource: typeof src | undefined): ReviewFile {
  return {
    targetId: 'wang-shih-chien', name: '王世堅', generatedAt: '2026-06-17T00:00:00Z',
    careers: [], assets: [],
    judgments: [{ approved: true, status: 'needs_review', data: {
      caseReason: 'x', court: '北院', caseNumber: '1', outcome: '無罪', isFinal: false,
      judgmentDate: '2024', judgmentUrl: 'u', source: judgmentSource as never, defendantNames: [], match: { confidence: 0.4, signals: [] },
    } }],
    report: [],
  };
}

describe('planInserts', () => {
  it('rejects approved judgments missing a source (validation gate)', () => {
    const plan = planInserts([reviewWith(undefined)], loadTargets());
    expect(plan.rejected.length).toBe(1);
    expect(plan.rejected[0].reason).toMatch(/missing source/);
    expect(plan.judgments.length).toBe(0);
  });

  it('accepts a valid approved judgment and assigns its natural key', () => {
    const plan = planInserts([reviewWith(src)], loadTargets());
    expect(plan.judgments.length).toBe(1);
    expect(plan.judgments[0].key).toBe('北院|1');
  });
});
