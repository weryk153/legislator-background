import type { CandidateEntry } from './candidateTypes';
import type { CandidateEducation } from './candidateEducation';
import { educationForDisplay } from './candidateEducation';
import type { CandidatePolicies } from './candidatePolicies';
import type { Official } from './types';
import type { ComparisonCandidate } from './candidateComparison';
import { partyLabel } from './candidateStats';
import { careerText } from './careerCategory';
import { candidatePhotoCredits } from './candidatePhotos';

/** Build-time projection: no unrelated judicial, donor or relationship data in the island. */
export function comparisonCandidate(candidate: CandidateEntry, official?: Official,
  education?: CandidateEducation, policies?: CandidatePolicies): ComparisonCandidate {
  // The reviewed roster slug is authoritative; names may use official variant glyphs.
  if (official && official.slug !== candidate.slug) {
    throw new Error(`比較人物與名冊不符：${candidate.name}`);
  }
  if (education && education.slug !== candidate.slug || policies && policies.slug !== candidate.slug) {
    throw new Error(`比較資料與人物不符：${candidate.name}`);
  }
  return {
    id: candidate.slug ?? `unlinked:${candidate.name}`, slug: candidate.slug,
    name: candidate.name, party: partyLabel(candidate), number: candidate.number,
    photoUrl: official?.photoUrl ?? null,
    photoCredit: candidate.slug ? candidatePhotoCredits().get(candidate.slug) : undefined,
    education: educationForDisplay(education),
    careers: (official?.careers ?? []).filter(c => !education?.excludedCareerIds.includes(c.id)
      && !/2026.*選舉登記參選/.test(c.title)).map(c => ({ text: careerText(c.organization, c.title), source: c.source })),
    policies: policies?.records ?? [],
    donations: (official?.donations ?? []).map(d => ({ id: d.id, electionName: d.electionName,
      reportSeq: d.reportSeq, totalIncome: d.totalIncome, totalExpense: d.totalExpense, source: d.source })),
  };
}
