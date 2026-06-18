import { collectApproved } from './review';
import { approvedToOfficial } from './toOfficial';
import { validateOfficial } from '../../src/lib/validate';
import { judgmentKey, assetKey, careerKey, controversyKey } from './keys';
import type { ReviewFile, Target, CandidateJudgment, CandidateCareer, CandidateAsset, CandidateControversy } from './types';

export interface InsertPlan {
  careers: Array<{ targetId: string; key: string; data: CandidateCareer }>;
  assets: Array<{ targetId: string; key: string; data: CandidateAsset }>;
  judgments: Array<{ targetId: string; key: string; data: CandidateJudgment }>;
  controversies: Array<{ targetId: string; key: string; data: CandidateControversy }>;
  rejected: Array<{ targetId: string; reason: string }>;
}

// Pure: turn approved review items into an insert plan, rejecting any target whose
// approved records fail the shared validation gate (reuses src/lib/validate.ts).
export function planInserts(files: ReviewFile[], targets: Target[]): InsertPlan {
  const approved = collectApproved(files);
  const plan: InsertPlan = { careers: [], assets: [], judgments: [], controversies: [], rejected: [] };

  for (const t of targets) {
    const careers = approved.careers.filter((c) => c.targetId === t.id).map((c) => c.data);
    const assets = approved.assets.filter((a) => a.targetId === t.id).map((a) => a.data);
    const judgments = approved.judgments.filter((j) => j.targetId === t.id).map((j) => j.data);
    const controversies = approved.controversies.filter((c) => c.targetId === t.id).map((c) => c.data);
    if (!careers.length && !assets.length && !judgments.length && !controversies.length) continue;

    const official = approvedToOfficial(t, { careers, assets, judgments, controversies });
    const errors = validateOfficial(official);
    if (errors.length) {
      for (const e of errors) plan.rejected.push({ targetId: t.id, reason: e });
      continue; // skip this target's batch — do not import partially invalid data
    }
    for (const c of careers) plan.careers.push({ targetId: t.id, key: careerKey(t.id, c), data: c });
    for (const a of assets) plan.assets.push({ targetId: t.id, key: assetKey(t.id, a), data: a });
    for (const j of judgments) plan.judgments.push({ targetId: t.id, key: judgmentKey(j), data: j });
    for (const c of controversies) plan.controversies.push({ targetId: t.id, key: controversyKey(t.id, c), data: c });
  }
  return plan;
}
