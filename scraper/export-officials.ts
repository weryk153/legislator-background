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
  // stable order so the committed JSON diff is meaningful
  officials.sort((a, b) => a.id.localeCompare(b.id));

  const outDir = join(here, '..', 'src', 'data');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'officials.json');
  writeFileSync(outFile, JSON.stringify(officials));
  console.log(`exported ${officials.length} officials → src/data/officials.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
