import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Official, RawOfficial } from './types';
import { toOfficial } from './transform';
import { validateAll } from './validate';

// Pure assembly + validation gate (raw DB rows → Official[]). Used by the export step
// (scraper/export-officials.ts) and unit-tested without a network call.
export function assembleOfficials(raw: RawOfficial[]): Official[] {
  const officials = raw.map(toOfficial);
  const errors = validateAll(officials);
  if (errors.length > 0) {
    throw new Error(`Data validation failed (build aborted):\n- ${errors.join('\n- ')}`);
  }
  return officials;
}

// Build-time data source: the committed snapshot at src/data/officials.json, produced by
// `pnpm run export:data` from local Supabase. The site builds with NO database, so CI or
// any machine can build & deploy it. The validation gate still runs (defence in depth).
export async function loadOfficials(): Promise<Official[]> {
  // Resolved from the project root (cwd at build time) so it works regardless of where
  // Vite bundles this module.
  const path = join(process.cwd(), 'src', 'data', 'officials.json');
  const officials = JSON.parse(readFileSync(path, 'utf8')) as Official[];
  const errors = validateAll(officials);
  if (errors.length > 0) {
    throw new Error(`Data validation failed (build aborted):\n- ${errors.join('\n- ')}`);
  }
  return officials;
}
