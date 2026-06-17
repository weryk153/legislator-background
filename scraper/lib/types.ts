import type { SourceType } from '../../src/lib/types';

export interface Target {
  id: string;          // slug, becomes officials.id mapping at import time
  name: string;
  party: string;
  district: string;
  office: 'legislator';
  profession?: string;
  keywords: string[];  // organizations, schools, district place-names — used for matching
  aliases: string[];
}

export interface EvidenceSource {
  url: string;
  title: string;
  type: SourceType;
  retrievedAt: string; // ISO date
}

export interface CandidateCareer {
  title: string; organization: string; startDate: string; endDate: string | null; source: EvidenceSource;
}
export interface CandidateAsset {
  year: number; totalAmount: number; source: EvidenceSource;
}
export interface CandidateJudgment {
  caseReason: string; court: string; caseNumber: string; outcome: string; isFinal: boolean;
  judgmentDate: string; judgmentUrl: string; source: EvidenceSource;
  // Names of 被告/當事人 extracted from the judgment; used for identity matching and
  // shown to human reviewers. NOT persisted into the published Official.
  defendantNames: string[];
  match: { confidence: number; signals: string[] };
}

export interface AdapterResult {
  source: string;
  ok: boolean;
  error?: string;
  careers?: CandidateCareer[];
  assets?: CandidateAsset[];
  judgments?: CandidateJudgment[];
}

export interface SourceAdapter {
  name: string;
  fetchFor(target: Target): Promise<AdapterResult>;
}

export interface ReviewItem<T> { approved: boolean; data: T; }

export interface ReviewFile {
  targetId: string;
  name: string;
  generatedAt: string;
  careers: ReviewItem<CandidateCareer>[];
  assets: ReviewItem<CandidateAsset>[];
  judgments: Array<ReviewItem<CandidateJudgment> & { status: 'needs_review' }>;
  report: Array<{ source: string; ok: boolean; error?: string; counts: Record<string, number> }>;
}
