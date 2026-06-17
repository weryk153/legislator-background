import { createClient } from '@supabase/supabase-js';
import type { Official, RawOfficial } from './types';
import { toOfficial } from './transform';
import { validateAll } from './validate';

const SELECT = `
  id, name, party, office_type, district, term, photo_url, bio, is_incumbent,
  careers ( id, title, organization, start_date, end_date, source:sources(*) ),
  judgments ( id, case_reason, court, case_number, outcome, is_final, judgment_date, judgment_url, source:sources(*) ),
  controversies ( id, title, summary, status, event_date, report_date, controversy_sources ( source:sources(*) ) ),
  asset_declarations ( id, year, source:sources(*), asset_items ( category, amount, label ) )
`;

// Pure assembly + validation gate — unit tested without a network call.
export function assembleOfficials(raw: RawOfficial[]): Official[] {
  const officials = raw.map(toOfficial);
  const errors = validateAll(officials);
  if (errors.length > 0) {
    throw new Error(`Data validation failed (build aborted):\n- ${errors.join('\n- ')}`);
  }
  return officials;
}

// Build-time fetch. Uses the service-role key (server-only, never shipped to the client).
export async function loadOfficials(): Promise<Official[]> {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key);
  // PostgREST caps a response at ~1000 rows, so page through with .range() until
  // a short page signals the end (the roster now exceeds 1000 officials).
  const pageSize = 1000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('officials').select(SELECT).range(from, from + pageSize - 1);
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return assembleOfficials(rows as RawOfficial[]);
}
