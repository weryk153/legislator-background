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
        const sourceHost = new URL(claim.source.url).hostname;
        if (claim.reviewer === '台灣事實查核中心（摘要）') {
          expect(sourceHost).toBe('tfc-taiwan.org.tw');
        } else {
          expect(claim.reviewer).toBe('本站核對（官方統計）');
          expect(sourceHost.endsWith('.gov.tw')).toBe(true);
          expect(claim.statementSource?.url).toBeTruthy();
          expect(claim.sourceLocation).toBeTruthy();
        }
        for (const source of [claim.statementSource, ...claim.additionalSources].filter(s => s !== null)) {
          const url = new URL(source.url);
          expect(url.protocol).toBe('https:');
          expect(url.username || url.password).toBe('');
          expect(source.title.trim()).toBeTruthy();
        }
        expect(claim.source.publishedOn <= debate.reviewedOn).toBe(true);
        expect(claim.source.updatedOn === null || claim.source.updatedOn <= debate.reviewedOn).toBe(true);
        expect([claim.claim, claim.result, claim.summary, claim.locator].every(value => value.trim())).toBe(true);
        expect(policies.candidates.flatMap(p => p.records).some(r => r.id === claim.id)).toBe(false);
      }
    }
  });

  it('局部查核保留全程逐字稿與時間未核對的限制', () => {
    const kaohsiung = data.debates.find(d => d.id === 'kaohsiung-1030')!;
    expect(kaohsiung.transcript).toBeNull();
    expect(kaohsiung.claims).toHaveLength(2);
    expect(kaohsiung.scope).toContain('非整場查核');
    for (const debate of data.debates) {
      expect(debate.videoNote).toContain('尚未逐段核對');
      expect(new URL(debate.video.url).searchParams.has('t')).toBe(false);
    }
  });
});
