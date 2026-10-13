import type { FirstRunEvidence, NationalCandidates, CountyCandidates } from '../../src/lib/candidateTypes';

export interface FirstRunConfirmation extends FirstRunEvidence {
  slug: string;
  name: string;
  race: string;
}

/** 在連結去重完成後套用；姓名、slug、完整選區和選舉年度都必須相符。 */
export function applyFirstRuns(national: NationalCandidates, counties: CountyCandidates[], records: FirstRunConfirmation[], year: number): void {
  const entries = [
    ...national.races.flatMap(r => r.candidates.map(candidate => ({ candidate, race: r.countyName }))),
    ...counties.flatMap(c => c.districts.flatMap(d => d.candidates.map(candidate => ({ candidate, race: `${c.countyName}${d.label}` })))),
  ];
  const seen = new Set<string>();
  // 先整批驗證再套用，任一衝突都不留下部分標記。
  const checked = records.map(record => {
    if (record.year !== year || record.scope !== 'public-office') throw new Error(`首次參選年度或範圍不符：${record.name}`);
    if (seen.has(record.slug)) throw new Error(`首次參選重複確認：${record.slug}`);
    seen.add(record.slug);
    const source = record.source;
    if (!source?.title?.trim() || !/^https?:\/\//.test(source.url) || !record.basis?.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(record.reviewedOn)
      || (source.publishedOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(source.publishedOn))) {
      throw new Error(`首次參選缺少完整查證來源：${record.name}`);
    }
    const matches = entries.filter(e => e.candidate.slug === record.slug);
    if (matches.length !== 1 || matches[0].candidate.name !== record.name || matches[0].race !== record.race) {
      throw new Error(`首次參選身分或選區不符：${record.name}（${record.race}）`);
    }
    const { slug, name, race, ...evidence } = record;
    return { candidate: matches[0].candidate, evidence };
  });
  for (const { candidate, evidence } of checked) candidate.firstRun = evidence;
}
