// 半自動萃取：掃 judgments/controversies 內文找候選關係，印 JSON 供人工校對。不寫入 DB。
//   pnpm exec tsx scraper/extract-relationships.ts
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';
import { extractCandidates } from '../src/lib/extractRelationships';

loadEnv();

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  const { data: judgments, error } = await supabase
    .from('judgments').select('official_id, outcome, officials(name)');
  if (error) throw new Error(error.message);

  const candidates: unknown[] = [];
  for (const j of judgments ?? []) {
    const subject = (j as { officials?: { name?: string } }).officials?.name ?? '(unknown)';
    for (const c of extractCandidates((j as { outcome: string }).outcome)) {
      if (!c.counterpartName || c.counterpartName === subject) continue;
      candidates.push({ subject, ...c });
    }
  }
  console.log(JSON.stringify(candidates, null, 2));
  console.error(`\n${candidates.length} 候選關係（請人工校對後再入庫）`);
}

main().catch((e) => { console.error(e); process.exit(1); });
