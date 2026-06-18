import type {
  AdapterResult, CandidateAsset, CandidateCareer, CandidateControversy, CandidateJudgment, ReviewFile, Target,
} from './types';

export function buildReviewFile(target: Target, results: AdapterResult[], generatedAt: string): ReviewFile {
  const careers = results.flatMap((r) => r.careers ?? []).map((data) => ({ approved: true, data }));
  // Assets require human approval: current gazette sources expose no machine-readable
  // amounts (items start empty), so a reviewer must fill the real figures from the
  // 公報 PDF before publish — never auto-publish a misleading empty declaration.
  const assets = results.flatMap((r) => r.assets ?? []).map((data) => ({ approved: false, data }));
  // Judgments require explicit human approval — always start approved:false / needs_review.
  const judgments = results.flatMap((r) => r.judgments ?? []).map((data) => ({
    approved: false,
    status: 'needs_review' as const,
    data,
  }));
  // Controversies require explicit human approval — always start approved:false / needs_review.
  const wikiControversies = results.flatMap((r) => r.controversies ?? []).map((data) => ({
    approved: false,
    status: 'needs_review' as const,
    data,
  }));

  const report = results.map((r) => ({
    source: r.source,
    ok: r.ok,
    error: r.error,
    counts: {
      careers: r.careers?.length ?? 0,
      assets: r.assets?.length ?? 0,
      judgments: r.judgments?.length ?? 0,
      controversies: r.controversies?.length ?? 0,
    },
  }));

  return { targetId: target.id, name: target.name, generatedAt, careers, assets, judgments, wikiControversies, report };
}

export interface ApprovedBundle {
  careers: Array<{ targetId: string; data: CandidateCareer }>;
  assets: Array<{ targetId: string; data: CandidateAsset }>;
  judgments: Array<{ targetId: string; data: CandidateJudgment }>;
  controversies: Array<{ targetId: string; data: CandidateControversy }>;
}

export function collectApproved(files: ReviewFile[]): ApprovedBundle {
  const bundle: ApprovedBundle = { careers: [], assets: [], judgments: [], controversies: [] };
  for (const f of files) {
    for (const c of f.careers) if (c.approved) bundle.careers.push({ targetId: f.targetId, data: c.data });
    for (const a of f.assets) if (a.approved) bundle.assets.push({ targetId: f.targetId, data: a.data });
    for (const j of f.judgments) if (j.approved) bundle.judgments.push({ targetId: f.targetId, data: j.data });
    for (const c of f.wikiControversies) if (c.approved) bundle.controversies.push({ targetId: f.targetId, data: c.data });
  }
  return bundle;
}
