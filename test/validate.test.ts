import { describe, it, expect } from 'vitest';
import { validateOfficial, validateAll } from '../src/lib/validate';
import type { Official, Source } from '../src/lib/types';

const src: Source = { id: 's1', url: 'https://x', type: 'court', title: 't', retrievedAt: '2026-01-01' };

function baseOfficial(over: Partial<Official> = {}): Official {
  return {
    id: 'o1', slug: 'o1', name: '陳〇〇', party: '無', officeType: 'legislator', district: '北市3',
    term: '11', photoUrl: null, bio: '', isIncumbent: true,
    careers: [], judgments: [], controversies: [], assets: [], ...over,
  };
}

describe('validateOfficial', () => {
  it('passes a clean official with no fact rows', () => {
    expect(validateOfficial(baseOfficial())).toEqual([]);
  });

  it('flags a judgment missing a source', () => {
    const o = baseOfficial({ judgments: [
      { id: 'j1', caseReason: '貪污', court: '北院', caseNumber: '111', outcome: '有罪', isFinal: true, judgmentDate: '2024-01-01', judgmentUrl: 'https://j', source: undefined as unknown as Source },
    ]});
    expect(validateOfficial(o)).toContain('judgment j1: missing source');
  });

  it('flags a judgment missing an outcome', () => {
    const o = baseOfficial({ judgments: [
      { id: 'j1', caseReason: '貪污', court: '北院', caseNumber: '111', outcome: '   ', isFinal: true, judgmentDate: '2024-01-01', judgmentUrl: 'https://j', source: src },
    ]});
    expect(validateOfficial(o)).toContain('judgment j1: missing outcome');
  });

  it('flags a controversy with zero sources', () => {
    const o = baseOfficial({ controversies: [
      { id: 'c1', title: 'x', summary: 'y', status: 'investigating', eventDate: '2024-01-01', reportDate: '2024-01-02', sources: [] },
    ]});
    expect(validateOfficial(o)).toContain('controversy c1: needs at least one source');
  });

  it('flags a controversy missing reportDate', () => {
    const o = baseOfficial({ controversies: [
      { id: 'c1', title: 'x', summary: 'y', status: 'investigating', eventDate: '2024-01-01', reportDate: '', sources: [src] },
    ]});
    expect(validateOfficial(o)).toContain('controversy c1: missing reportDate');
  });

  it('flags a career and an asset missing a source', () => {
    const o = baseOfficial({
      careers: [{ id: 'k1', title: 'x', organization: 'y', startDate: '2020', endDate: null, source: undefined as unknown as Source }],
      assets: [{ id: 'a1', year: 2024, items: [], source: undefined as unknown as Source }],
    });
    const errs = validateOfficial(o);
    expect(errs).toContain('career k1: missing source');
    expect(errs).toContain('asset a1: missing source');
  });
});

describe('validateAll', () => {
  it('prefixes each error with the official name', () => {
    const o = baseOfficial({ judgments: [
      { id: 'j1', caseReason: '', court: '', caseNumber: '', outcome: '', isFinal: true, judgmentDate: '', judgmentUrl: '', source: undefined as unknown as Source },
    ]});
    expect(validateAll([o])).toContain('陳〇〇: judgment j1: missing source');
  });
});
