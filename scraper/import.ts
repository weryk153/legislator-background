import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadTargets } from './lib/targets';
import { planInserts } from './lib/insert';
import { loadEnv } from './lib/loadEnv';
import type { ReviewFile, Target, EvidenceSource } from './lib/types';

loadEnv();

const here = dirname(fileURLToPath(import.meta.url));

function loadReviewFiles(): ReviewFile[] {
  const dir = join(here, 'out');
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  return names
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ReviewFile);
}

// Upsert officials by slug (= target id) and return a slug → uuid map. Idempotent:
// re-running updates the same row rather than creating duplicates.
async function ensureOfficials(
  supabase: SupabaseClient,
  targets: Target[],
  slugs: string[],
): Promise<Map<string, string>> {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const map = new Map<string, string>();
  for (const slug of slugs) {
    const t = byId.get(slug);
    if (!t) throw new Error(`Plan references unknown target slug: ${slug}`);
    const { data, error } = await supabase
      .from('officials')
      .upsert(
        { slug: t.id, name: t.name, party: t.party, office_type: t.office, district: t.district, term: '11', is_incumbent: true },
        { onConflict: 'slug' },
      )
      .select('id')
      .single();
    if (error || !data) throw new Error(`ensureOfficial(${slug}) failed: ${error?.message ?? 'no row'}`);
    map.set(slug, data.id as string);
  }
  return map;
}

// Insert a source row and return its id (only called when a new fact is being written).
async function insertSource(supabase: SupabaseClient, s: EvidenceSource): Promise<string> {
  const { data, error } = await supabase
    .from('sources')
    .insert({ url: s.url, type: s.type, title: s.title, retrieved_at: s.retrievedAt })
    .select('id')
    .single();
  if (error || !data) throw new Error(`insert source failed: ${error?.message ?? 'no row'}`);
  return data.id as string;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const files = loadReviewFiles();
  const targets = loadTargets();
  const plan = planInserts(files, targets);

  console.log(`planned → careers:${plan.careers.length} assets:${plan.assets.length} judgments:${plan.judgments.length} rejected:${plan.rejected.length}`);
  for (const r of plan.rejected) console.warn(`REJECTED ${r.targetId}: ${r.reason}`);
  if (dryRun) { console.log('(dry-run: nothing written)'); return; }

  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  const slugs = [...new Set([
    ...plan.careers.map((x) => x.targetId),
    ...plan.assets.map((x) => x.targetId),
    ...plan.judgments.map((x) => x.targetId),
  ])];
  const officialId = await ensureOfficials(supabase, targets, slugs);

  const stat = { inserted: 0, skipped: 0 };

  for (const c of plan.careers) {
    const oid = officialId.get(c.targetId)!;
    const { data: existing } = await supabase.from('careers').select('id')
      .eq('official_id', oid).eq('organization', c.data.organization).eq('start_date', c.data.startDate).maybeSingle();
    if (existing) { stat.skipped += 1; continue; }
    const sourceId = await insertSource(supabase, c.data.source);
    const { error } = await supabase.from('careers').insert({
      official_id: oid, title: c.data.title, organization: c.data.organization,
      start_date: c.data.startDate, end_date: c.data.endDate, source_id: sourceId,
    });
    if (error) throw new Error(`insert career (${c.key}) failed: ${error.message}`);
    stat.inserted += 1;
  }

  for (const a of plan.assets) {
    const oid = officialId.get(a.targetId)!;
    const { data: existing } = await supabase.from('asset_declarations').select('id')
      .eq('official_id', oid).eq('year', a.data.year).maybeSingle();
    if (existing) { stat.skipped += 1; continue; }
    const sourceId = await insertSource(supabase, a.data.source);
    const { error } = await supabase.from('asset_declarations').insert({
      official_id: oid, year: a.data.year, total_amount: null, source_id: sourceId,
    });
    if (error) throw new Error(`insert asset (${a.key}) failed: ${error.message}`);
    stat.inserted += 1;
  }

  for (const j of plan.judgments) {
    const oid = officialId.get(j.targetId)!;
    const { data: existing } = await supabase.from('judgments').select('id')
      .eq('official_id', oid).eq('court', j.data.court).eq('case_number', j.data.caseNumber).maybeSingle();
    if (existing) { stat.skipped += 1; continue; }
    const sourceId = await insertSource(supabase, j.data.source);
    const { error } = await supabase.from('judgments').insert({
      official_id: oid, case_reason: j.data.caseReason, court: j.data.court, case_number: j.data.caseNumber,
      outcome: j.data.outcome, is_final: j.data.isFinal, judgment_date: j.data.judgmentDate, judgment_url: j.data.judgmentUrl,
      source_id: sourceId,
    });
    if (error) throw new Error(`insert judgment (${j.key}) failed: ${error.message}`);
    stat.inserted += 1;
  }

  console.log(`Import complete. inserted:${stat.inserted} skipped(already present):${stat.skipped} officials:${officialId.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
