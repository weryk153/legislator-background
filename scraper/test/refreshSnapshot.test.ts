import { describe, expect, it } from 'vitest';
import { refreshSnapshot } from '../lib/refreshSnapshot';
import { buildReviewFile } from '../lib/review';
import { approvedToOfficial } from '../lib/toOfficial';
import type { Target } from '../lib/types';

const target: Target = { id: 'test-person', name: '測試人物', party: '無黨籍', office: 'councilor', district: '臺北市', keywords: [], aliases: [] };
const source = { url: 'https://example.gov.tw/record', title: '公開資料', type: 'gov' as const, retrievedAt: '2026-10-26' };
const career = { title: '議員', organization: '議會', startDate: '2022-12-25', endDate: null, source };
const asset = { year: 2026, items: [{ category: 'deposit' as const, amount: 100, label: '存款' }], source };
const review = () => buildReviewFile(target, [{ source: 'cec', ok: true, careers: [structuredClone(career)], assets: [structuredClone(asset)] }], '2026-10-26T02:00:00Z');
function person() {
  const o = approvedToOfficial(target, { careers: [], assets: [], judgments: [], controversies: [] });
  return { ...o, id: 'permanent-uuid', photoUrl: '/photos/existing.webp', isIncumbent: false, departedReason: '任期結束', bio: '人工補錄簡介' };
}

describe('factual snapshot refresh', () => {
  it('preserves every profile, identity and curated field, including candidates outside scraper targets', () => {
    const o = person();
    o.donations = [{ id: 'manual-donation' } as any];
    o.controversies = [{ id: 'manual-controversy' } as any];
    o.judgments = [{ id: 'manual-judgment' } as any];
    const candidate = { ...person(), id: 'other-id', slug: 'new-candidate', officeType: 'candidate' as const };
    const originals = [o, candidate];
    const result = refreshSnapshot(originals, [review()], [target]);
    expect(result.officials).toHaveLength(2);
    expect(result.officials[1]).toEqual(candidate);
    const { careers, assets, ...rest } = result.officials[0];
    const { careers: oldCareers, assets: oldAssets, ...oldRest } = o;
    expect(rest).toEqual(oldRest);
    expect(careers).toHaveLength(1);
    expect(assets).toHaveLength(1);
    expect(o.careers).toEqual([]); // Pure: no partial writes on later validation errors.
    expect(refreshSnapshot(result.officials, [review()], [target])).toMatchObject({ changed: false, officials: result.officials });
  });
  it('never auto-publishes judgments or controversies from even an approved review file', () => {
    const r = review();
    r.judgments = [{ approved: true, status: 'needs_review', data: {} as any }];
    r.wikiControversies = [{ approved: true, status: 'needs_review', data: {} as any }];
    expect(refreshSnapshot([person()], [r], [target]).officials[0]).toMatchObject({ judgments: [], controversies: [] });
  });
  it('fills missing amounts but preserves existing populated amounts', () => {
    const o = person();
    o.assets = [{ id: 'keep-id', year: 2026, items: [], source: { ...source, id: 'old-source' } }];
    const enriched = refreshSnapshot([o], [review()], [target]);
    expect(enriched.stat.assetsEnriched).toBe(1);
    expect(enriched.officials[0].assets[0]).toMatchObject({ id: 'keep-id', items: [{ amount: 100 }] });
    enriched.officials[0].assets[0].items[0].amount = 999;
    expect(refreshSnapshot(enriched.officials, [review()], [target]).officials[0].assets[0].items[0].amount).toBe(999);
  });
  it('rejects mismatched identities, duplicated batches and invalid money before changing input', () => {
    const o = person();
    expect(() => refreshSnapshot([o], [{ ...review(), name: '同名誤配' }], [target])).toThrow('identity mismatch');
    expect(() => refreshSnapshot([o], [review(), review()], [target])).toThrow('Duplicate review');
    const r = review(); r.assets[0].data.items[0].amount = NaN;
    expect(() => refreshSnapshot([o], [r], [target])).toThrow('Invalid asset');
    expect(o.assets).toEqual([]);
  });
  it('allows only sourced, district-specific confirmed renames without reverting the canonical name', () => {
    const o = { ...person(), name: '已正名人物', officeType: 'councilor' as const };
    const correction = { op: 'rename', from: target.name, to: o.name, office_type: 'councilor', district: target.district, source_url: source.url };
    expect(refreshSnapshot([o], [review()], [target], [correction]).officials[0].name).toBe(o.name);
    expect(() => refreshSnapshot([o], [review()], [target], [{ ...correction, district: '另一選區' }])).toThrow('identity mismatch');
  });
  it('does not duplicate the same career when source date separators change', () => {
    const o = person();
    o.careers = [{ ...career, id: 'existing-career', startDate: '2022/12/25', source: { ...source, id: 'existing-source' } }];
    const result = refreshSnapshot([o], [review()], [target]);
    expect(result.stat.careersAdded).toBe(0);
    expect(result.officials[0].careers).toEqual(o.careers);
  });
});
