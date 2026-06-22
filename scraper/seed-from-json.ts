// Seed human-curated data (controversies + approved judgments) from the committed
// src/data/officials.json back into the database.
//
// WHY: the scraper auto-approves only careers + assets. Controversies and judgments are
// human-approved and live ONLY in the committed snapshot — they are NOT reproducible from a
// scrape. So a CI rebuild (fresh DB → scrape → import) would drop them. Run this AFTER
// import (officials + careers + assets exist) and BEFORE export, to restore the curated
// rows so the regenerated snapshot is faithful.
//
//   pnpm run scrape && pnpm run scrape:import && pnpm run seed:from-json && pnpm run export:data
//
// Idempotent: matches existing rows the same way import.ts does, so re-running is a no-op.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';
import type { Official, Source } from '../src/lib/types';

loadEnv();

async function insertSource(supabase: SupabaseClient, s: Source): Promise<string> {
  const { data, error } = await supabase
    .from('sources')
    .insert({ url: s.url, type: s.type, title: s.title, retrieved_at: s.retrievedAt })
    .select('id')
    .single();
  if (error || !data) throw new Error(`insert source failed: ${error?.message ?? 'no row'}`);
  return data.id as string;
}

// Officials are created by import (upsert by slug). Here we match them by the natural key
// name + office_type + district — unique across the roster — to attach curated rows.
async function findOfficialId(supabase: SupabaseClient, o: Official): Promise<string | null> {
  const { data, error } = await supabase
    .from('officials')
    .select('id')
    .eq('name', o.name)
    .eq('office_type', o.officeType)
    .eq('district', o.district)
    .maybeSingle();
  if (error) throw new Error(`lookup official ${o.name} failed: ${error.message}`);
  return data ? (data.id as string) : null;
}

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  const path = join(process.cwd(), 'src', 'data', 'officials.json');
  const officials = JSON.parse(readFileSync(path, 'utf8')) as Official[];

  const stat = { controversies: 0, judgments: 0, skipped: 0, unmatched: 0 };

  for (const o of officials) {
    if (o.controversies.length === 0 && o.judgments.length === 0) continue;
    const oid = await findOfficialId(supabase, o);
    if (!oid) { stat.unmatched += 1; console.warn(`no DB official for ${o.name} (${o.officeType}/${o.district})`); continue; }

    for (const c of o.controversies) {
      const { data: existing } = await supabase.from('controversies').select('id')
        .eq('official_id', oid).eq('title', c.title).maybeSingle();
      if (existing) { stat.skipped += 1; continue; }
      const { data: row, error } = await supabase.from('controversies')
        .insert({ official_id: oid, title: c.title, summary: c.summary, status: c.status, event_date: c.eventDate, report_date: c.reportDate })
        .select('id').single();
      if (error || !row) throw new Error(`insert controversy (${o.name}/${c.title}) failed: ${error?.message ?? 'no row'}`);
      for (const s of c.sources) {
        const sid = await insertSource(supabase, s);
        const { error: jErr } = await supabase.from('controversy_sources').insert({ controversy_id: row.id, source_id: sid });
        if (jErr) throw new Error(`insert controversy_source (${o.name}/${c.title}) failed: ${jErr.message}`);
      }
      stat.controversies += 1;
    }

    for (const j of o.judgments) {
      const { data: existing } = await supabase.from('judgments').select('id')
        .eq('official_id', oid).eq('court', j.court).eq('case_number', j.caseNumber).maybeSingle();
      if (existing) { stat.skipped += 1; continue; }
      const sourceId = await insertSource(supabase, j.source);
      const { error } = await supabase.from('judgments').insert({
        official_id: oid, case_reason: j.caseReason, court: j.court, case_number: j.caseNumber,
        outcome: j.outcome, is_final: j.isFinal, judgment_date: j.judgmentDate, judgment_url: j.judgmentUrl,
        source_id: sourceId,
      });
      if (error) throw new Error(`insert judgment (${o.name}/${j.caseNumber}) failed: ${error.message}`);
      stat.judgments += 1;
    }
  }

  console.log(`Seed complete. controversies:${stat.controversies} judgments:${stat.judgments} skipped(present):${stat.skipped} unmatched-officials:${stat.unmatched}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
