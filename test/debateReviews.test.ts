import { describe, expect, it } from 'vitest';
import data from '../src/data/debate-reviews.json';
import policies from '../src/data/candidate-policies.json';

describe('辯論證據資料', () => {
  it('候選人、場次與報告來源均有可核對對應，查核不是政見計數', () => {
    const ids = new Set<string>();
    for (const debate of data.debates) {
      expect(debate.heldOn <= debate.reviewedOn && debate.reviewedOn <= data.updatedOn).toBe(true);
      for (const person of debate.participants) {
        expect(policies.candidates.some(p => p.slug === person.slug && p.name === person.name)).toBe(true);
      }
      for (const claim of debate.claims) {
        expect(ids.has(claim.id)).toBe(false);
        ids.add(claim.id);
        expect(debate.participants.some(p => p.slug === claim.candidateSlug)).toBe(true);
        expect(new URL(claim.source.url).hostname).toBe('tfc-taiwan.org.tw');
        expect(claim.source.publishedOn <= debate.reviewedOn).toBe(true);
        expect(claim.source.updatedOn === null || claim.source.updatedOn <= debate.reviewedOn).toBe(true);
        expect([claim.claim, claim.result, claim.summary, claim.locator].every(value => value.trim())).toBe(true);
        expect(policies.candidates.flatMap(p => p.records).some(r => r.id === claim.id)).toBe(false);
      }
    }
  });

  it('缺少逐字稿與查核的場次明示範圍，不補造時間點', () => {
    const kaohsiung = data.debates.find(d => d.id === 'kaohsiung-1030')!;
    expect(kaohsiung.transcript).toBeNull();
    expect(kaohsiung.claims).toEqual([]);
    expect(kaohsiung.scope).toContain('未完成');
    for (const debate of data.debates) {
      expect(debate.videoNote).toContain('尚未逐段核對');
      expect(new URL(debate.video.url).searchParams.has('t')).toBe(false);
    }
  });
});
