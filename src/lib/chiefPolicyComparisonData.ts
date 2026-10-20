import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadOfficials } from './data';
import { loadCandidatePolicies, type CandidatePolicies } from './candidatePolicies';
import { chiefTitle, type NationalCandidates } from './candidateTypes';
import { countyByCode } from './countyKeys';
import { orderCandidates, partyLabel } from './candidateStats';
import type { ChiefPolicyCounty } from './chiefPolicyComparison';

export function buildChiefPolicyCounties(national: NationalCandidates, policies: Map<string, CandidatePolicies>): ChiefPolicyCounty[] {
  return national.races.map(race => {
    const county = countyByCode(race.countyCode);
    if (!county) throw new Error(`未知縣市：${race.countyCode}`);
    return {
      key: county.key,
      name: race.countyName,
      people: orderCandidates(race.candidates).map(candidate => {
        const policy = candidate.slug ? policies.get(candidate.slug) : undefined;
        const role = chiefTitle(race.countyName);
        if (policy && policy.role !== role) throw new Error(`政見參選職位不符：${candidate.slug}`);
        return {
          id: candidate.slug ?? `unlinked:${candidate.name}`,
          slug: candidate.slug,
          name: candidate.name,
          party: partyLabel(candidate),
          role,
          records: policy?.records ?? [],
        };
      }),
    };
  });
}

export async function loadChiefPolicyComparison() {
  const national = JSON.parse(readFileSync(join(process.cwd(), 'public/data/candidates/2026/national.json'), 'utf8')) as NationalCandidates;
  const policies = loadCandidatePolicies(await loadOfficials());
  const counties = buildChiefPolicyCounties(national, policies);
  const reviewedOn = counties.flatMap(c => c.people.flatMap(p => p.records.map(r => r.reviewedOn))).sort().at(-1) ?? null;
  return { counties, reviewedOn, rosterSource: national.source };
}
