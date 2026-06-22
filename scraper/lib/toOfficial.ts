import type { Official, Source } from '../../src/lib/types';
import type { CandidateAsset, CandidateCareer, CandidateControversy, CandidateJudgment, EvidenceSource, Target } from './types';

function toSource(e: EvidenceSource): Source {
  // EvidenceSource already matches Source's view-model shape (camelCase). Pass undefined
  // through so the validator's "missing source" check fires instead of crashing.
  if (!e) return e as unknown as Source;
  return { id: e.url, url: e.url, type: e.type, title: e.title, retrievedAt: e.retrievedAt };
}

export interface ApprovedForTarget {
  careers: CandidateCareer[];
  assets: CandidateAsset[];
  judgments: CandidateJudgment[];
  controversies: CandidateControversy[];
}

// Assemble a partial Official so we can reuse src/lib/validate.ts as the single
// validation gate. Judgment ids are court-casenumber for readable error messages.
export function approvedToOfficial(t: Target, a: ApprovedForTarget): Official {
  return {
    id: t.id, slug: t.id, name: t.name, party: t.party, officeType: 'legislator', district: t.district,
    term: '11', photoUrl: null, bio: '', isIncumbent: true,
    careers: a.careers.map((c, i) => ({
      id: `career-${i}`, title: c.title, organization: c.organization,
      startDate: c.startDate, endDate: c.endDate, source: toSource(c.source),
    })),
    judgments: a.judgments.map((j) => ({
      id: `${j.court}-${j.caseNumber}`, caseReason: j.caseReason, court: j.court, caseNumber: j.caseNumber,
      outcome: j.outcome, isFinal: j.isFinal, judgmentDate: j.judgmentDate, judgmentUrl: j.judgmentUrl,
      source: toSource(j.source),
    })),
    controversies: a.controversies.map((c, i) => ({
      id: `controversy-${i}`, title: c.title, summary: c.summary, status: c.status,
      eventDate: c.eventDate, reportDate: c.reportDate,
      sources: c.sources.map((s) => toSource(s)),
    })),
    assets: a.assets.map((as, i) => ({
      id: `asset-${i}`, year: as.year, source: toSource(as.source),
      items: as.items.map((it) => ({ category: it.category, amount: it.amount, label: it.label ?? null })),
    })),
  };
}
