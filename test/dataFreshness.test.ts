import { describe, expect, it } from 'vitest';
import { dataFreshness } from '../src/lib/dataFreshness';

describe('dataset source dates', () => {
  it('does not relabel all profiles or all rosters with a numbered county date', () => {
    expect(dataFreshness({ generatedAt: '2026-10-13' }, {
      source: { stage: 'certified', tableDate: '2026-10-16' },
      races: [
        { source: { stage: 'certified', tableDate: '2026-10-16' } },
        { source: { stage: 'numbered', tableDate: '2026-10-24' } },
      ],
    })).toEqual({ profiles: '2026-10-13', roster: '2026-10-16', ballots: '2026-10-24' });
  });
  it('omits unavailable dates rather than substituting build time', () => {
    expect(dataFreshness({}, {})).toEqual({ profiles: null, roster: null, ballots: null });
  });
  it('includes council source dates even when a chief roster has not changed', () => {
    expect(dataFreshness({}, { source: { tableDate: '2026-10-16' } }, [
      { source: { stage: 'numbered', tableDate: '2026-10-27' } },
    ])).toMatchObject({ roster: '2026-10-16', ballots: '2026-10-27' });
  });
});
