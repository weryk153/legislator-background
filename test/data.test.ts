import { describe, it, expect } from 'vitest';
import { assembleOfficials } from '../src/lib/data';
import type { RawOfficial, RawSource } from '../src/lib/types';

const rawSrc: RawSource = { id: 's1', url: 'https://x', type: 'court', title: 't', retrieved_at: '2026-01-01' };

function rawOfficial(over: Partial<RawOfficial> = {}): RawOfficial {
  return {
    id: 'o1', slug: 'o1', name: '測試', party: '無', office_type: 'legislator', district: 'd', term: '11', departed_reason: null,
    photo_url: null, bio: '', is_incumbent: true,
    careers: [], judgments: [], controversies: [], asset_declarations: [], ...over,
  };
}

describe('assembleOfficials', () => {
  it('returns transformed officials when data is valid', () => {
    const result = assembleOfficials([rawOfficial()]);
    expect(result).toHaveLength(1);
    expect(result[0].officeType).toBe('legislator');
  });

  it('throws when a fact row is missing its source', () => {
    const bad = rawOfficial({
      judgments: [{ id: 'j1', case_reason: 'x', court: 'c', case_number: 'n', outcome: 'o', is_final: true, judgment_date: 'd', judgment_url: 'u', source: undefined as unknown as RawSource }],
    });
    expect(() => assembleOfficials([bad])).toThrow(/missing source/);
  });
});
