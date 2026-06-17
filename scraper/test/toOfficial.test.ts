import { describe, it, expect } from 'vitest';
import { approvedToOfficial } from '../lib/toOfficial';
import { validateOfficial } from '../../src/lib/validate';
import type { Target } from '../lib/types';

const target: Target = { id: 't1', name: '王世堅', party: '民進黨', district: '台北市', office: 'legislator', keywords: [], aliases: [] };
const src = { url: 'https://x', title: 't', type: 'court' as const, retrievedAt: '2026-06-01' };

describe('approvedToOfficial', () => {
  it('builds an Official whose judgments carry sources (passes validateOfficial)', () => {
    const o = approvedToOfficial(target, {
      careers: [], assets: [],
      judgments: [{ caseReason: 'x', court: 'c', caseNumber: '1', outcome: '無罪', isFinal: false, judgmentDate: '2024', judgmentUrl: 'u', source: src, match: { confidence: 0.4, signals: [] } }],
    });
    expect(o.judgments[0].source.url).toBe('https://x');
    expect(validateOfficial(o)).toEqual([]);
  });

  it('a judgment missing a source is caught by validateOfficial', () => {
    const o = approvedToOfficial(target, {
      careers: [], assets: [],
      judgments: [{ caseReason: 'x', court: 'c', caseNumber: '1', outcome: '無罪', isFinal: false, judgmentDate: '2024', judgmentUrl: 'u', source: undefined as never, match: { confidence: 0.4, signals: [] } }],
    });
    expect(validateOfficial(o)).toContain('judgment c-1: missing source');
  });
});
