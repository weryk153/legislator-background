type CandidateSource = { stage?: string; tableDate?: string };
type ElectionData = { source?: CandidateSource; races?: Array<{ source?: CandidateSource }> };
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

// A source date describes that dataset only. A new build or a single numbered county
// must never imply that all profiles or all counties were refreshed that day.
export function dataFreshness(meta: { generatedAt?: string }, election: ElectionData, councils: Array<{ source?: CandidateSource; districts?: Array<{ source?: CandidateSource }> }> = []) {
  const sources = [election.source, ...(election.races ?? []).map(r => r.source), ...councils.flatMap(c => [c.source, ...(c.districts ?? []).map(d => d.source)])].filter(Boolean) as CandidateSource[];
  const numbered = sources.filter(s => s.stage === 'numbered' || s.stage === 'announced')
    .map(s => s.tableDate).filter(validDate).sort();
  return {
    profiles: validDate(meta.generatedAt) ? meta.generatedAt : null,
    roster: validDate(election.source?.tableDate) ? election.source.tableDate : null,
    ballots: numbered.at(-1) ?? null,
  };
}
