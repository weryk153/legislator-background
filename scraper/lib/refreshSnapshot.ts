import { createHash } from 'node:crypto';
import { planInserts } from './insert';
import { careerKey } from './keys';
import type { Official, Source } from '../../src/lib/types';
import type { EvidenceSource, ReviewFile, Target } from './types';

const id = (kind: string, key: string) => `refresh-${kind}-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
const source = (s: EvidenceSource): Source => ({ ...s, id: id('source', s.url) });
const normalizedDate = (s: string) => s.replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/u,
  (_, year, month, day) => `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
const careerIdentity = (slug: string, c: { organization: string; startDate: string }) => careerKey(slug, { ...c, startDate: normalizedDate(c.startDate) });

// Refresh only factual records on existing profiles. The snapshot owns identities,
// photos, current/departed status, donations and all manually reviewed information.
export interface ConfirmedRename { op: string; from?: string; to?: string; office_type?: string; district?: string; source_url?: string }
export function refreshSnapshot(snapshot: Official[], reviews: ReviewFile[], targets: Target[], renames: ConfirmedRename[] = []) {
  const officials = structuredClone(snapshot);
  const bySlug = new Map(officials.map(o => [o.slug, o]));
  if (bySlug.size !== officials.length) throw new Error('Duplicate profile slugs');
  const byTarget = new Map(targets.map(t => [t.id, t]));
  const seen = new Set<string>();
  for (const r of reviews) {
    const t = byTarget.get(r.targetId);
    const o = bySlug.get(r.targetId);
    const confirmedRename = t && o && renames.some(c => c.op === 'rename' && c.from === t.name && c.to === o.name
      && c.office_type === t.office && c.office_type === o.officeType && c.district === t.district && c.district === o.district && c.source_url);
    if (!t || !o || r.name !== t.name || (t.name !== o.name && !confirmedRename)) throw new Error(`Refresh identity mismatch: ${r.targetId}`);
    if (seen.has(r.targetId)) throw new Error(`Duplicate review: ${r.targetId}`);
    seen.add(r.targetId);
  }
  // Do not publish sensitive records even if an old review file has approved=true.
  const plan = planInserts(reviews.map(r => ({ ...r, judgments: [], wikiControversies: [] })), targets);
  if (plan.rejected.length) throw new Error(`Invalid refresh records: ${JSON.stringify(plan.rejected)}`);
  const stat = { careersAdded: 0, assetsAdded: 0, assetsEnriched: 0 };
  for (const c of plan.careers) {
    const o = bySlug.get(c.targetId)!;
    if (o.careers.some(old => careerIdentity(o.slug, old) === careerIdentity(o.slug, c.data) && old.title === c.data.title)) continue;
    o.careers.push({ ...c.data, id: id('career', `${c.key}|${c.data.title}`), source: source(c.data.source) });
    stat.careersAdded++;
  }
  for (const a of plan.assets) {
    const o = bySlug.get(a.targetId)!;
    if (!Number.isInteger(a.data.year) || a.data.year < 1912 || a.data.items.some(i => !Number.isFinite(i.amount) || i.amount < 0)) {
      throw new Error(`Invalid asset amounts/year: ${a.targetId}`);
    }
    const old = o.assets.find(x => x.year === a.data.year);
    const items = a.data.items.map(i => ({ ...i, label: i.label ?? null }));
    if (!old) {
      o.assets.push({ id: id('asset', a.key), year: a.data.year, items, source: source(a.data.source) });
      stat.assetsAdded++;
    } else if (!old.items.length && items.length) {
      old.items = items;
      old.source = source(a.data.source);
      stat.assetsEnriched++;
    }
  }
  return { officials, stat, changed: Object.values(stat).some(n => n > 0) };
}
