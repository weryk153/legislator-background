// Export the assembled, validated officials dataset from local Supabase to a committed
// JSON snapshot (src/data/officials.json). The site then builds from this JSON with NO
// database — so CI / any machine can build & deploy. Run after scrape+import:
//   pnpm run export:data
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assembleOfficials } from '../src/lib/data';
import { loadEnv } from './lib/loadEnv';
import type { RawOfficial } from '../src/lib/types';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));

const SELECT = `
  id, slug, name, party, office_type, district, term, photo_url, bio, is_incumbent,
  careers ( id, title, organization, start_date, end_date, source:sources(*) ),
  judgments ( id, case_reason, court, case_number, outcome, is_final, judgment_date, judgment_url, source:sources(*) ),
  controversies ( id, title, summary, status, event_date, report_date, controversy_sources ( source:sources(*) ) ),
  asset_declarations ( id, year, source:sources(*), asset_items ( category, amount, label ) )
`;

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  const pageSize = 1000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('officials').select(SELECT).range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  // assembleOfficials transforms raw rows → Official[] AND runs the validation gate.
  const officials = assembleOfficials(rows as RawOfficial[]);

  // Publish only controversies backed by at least one NON-Wikipedia (original media) source.
  // Wikipedia is user-edited and not a credible primary source for 合理查證; a controversy we
  // can only point to a wiki page for is too weakly sourced to publish about a real person.
  const isWiki = (url: string) => /wikipedia\.org/u.test(url || '');
  let dropped = 0;
  for (const o of officials) {
    const before = o.controversies.length;
    o.controversies = o.controversies.filter((c) => (c.sources ?? []).some((s) => !isWiki(s.url)));
    dropped += before - o.controversies.length;
  }
  if (dropped) console.log(`dropped ${dropped} wiki-only controvers${dropped === 1 ? 'y' : 'ies'} (no original-media source)`);

  // stable order so the committed JSON diff is meaningful
  officials.sort((a, b) => a.id.localeCompare(b.id));

  const outDir = join(here, '..', 'src', 'data');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'officials.json');
  writeFileSync(outFile, JSON.stringify(officials));

  // Freshness stamp for the site footer — when this snapshot was generated (not build time).
  const generatedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(join(outDir, 'meta.json'), JSON.stringify({ generatedAt, officials: officials.length }, null, 2) + '\n');
  console.log(`exported ${officials.length} officials → src/data/officials.json (generated ${generatedAt})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
