import { describe, it, expect } from 'vitest';
import { extractCandidates } from '../src/lib/extractRelationships';

describe('extractCandidates', () => {
  it('picks up a spouse cue with the counterpart name', () => {
    const out = extractCandidates('被告之配偶白惠萍共同犯詐欺罪');
    expect(out).toContainEqual({ relationType: 'spouse', counterpartName: '白惠萍', cue: '配偶' });
  });

  it('picks up an aide cue', () => {
    const out = extractCandidates('李雲強之助理孫韻璇負責處理助理費');
    expect(out.some((c) => c.relationType === 'aide')).toBe(true);
  });

  it('returns empty when no relationship cue present', () => {
    expect(extractCandidates('被告犯酒後駕車罪，處拘役')).toEqual([]);
  });
});
