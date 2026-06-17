import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadTargets } from './lib/targets';
import { planInserts } from './lib/insert';
import type { ReviewFile } from './lib/types';

const here = dirname(fileURLToPath(import.meta.url));

function loadReviewFiles(): ReviewFile[] {
  const dir = join(here, 'out');
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  return names
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ReviewFile);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const files = loadReviewFiles();
  const plan = planInserts(files, loadTargets());

  console.log(`careers:${plan.careers.length} assets:${plan.assets.length} judgments:${plan.judgments.length} rejected:${plan.rejected.length}`);
  for (const r of plan.rejected) console.warn(`REJECTED ${r.targetId}: ${r.reason}`);
  if (dryRun) { console.log('(dry-run: nothing written)'); return; }

  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  // Officials must already exist with id = target slug. Insert a source row per record,
  // then the fact row referencing it. (Idempotency by natural key is a follow-up; for the
  // first run, import into a clean DB.)
  for (const j of plan.judgments) {
    const { data: s } = await supabase.from('sources').insert({
      url: j.data.source.url, type: j.data.source.type, title: j.data.source.title, retrieved_at: j.data.source.retrievedAt,
    }).select('id').single();
    await supabase.from('judgments').insert({
      official_id: j.targetId, case_reason: j.data.caseReason, court: j.data.court, case_number: j.data.caseNumber,
      outcome: j.data.outcome, is_final: j.data.isFinal, judgment_date: j.data.judgmentDate, judgment_url: j.data.judgmentUrl,
      source_id: s?.id,
    });
  }
  for (const c of plan.careers) {
    const { data: s } = await supabase.from('sources').insert({
      url: c.data.source.url, type: c.data.source.type, title: c.data.source.title, retrieved_at: c.data.source.retrievedAt,
    }).select('id').single();
    await supabase.from('careers').insert({
      official_id: c.targetId, title: c.data.title, organization: c.data.organization,
      start_date: c.data.startDate, end_date: c.data.endDate, source_id: s?.id,
    });
  }
  for (const a of plan.assets) {
    const { data: s } = await supabase.from('sources').insert({
      url: a.data.source.url, type: a.data.source.type, title: a.data.source.title, retrieved_at: a.data.source.retrievedAt,
    }).select('id').single();
    await supabase.from('asset_declarations').insert({
      official_id: a.targetId, year: a.data.year, total_amount: a.data.totalAmount, source_id: s?.id,
    });
  }
  console.log('Import complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
