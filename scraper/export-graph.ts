// 從本地 Supabase 匯出關係圖快照（src/data/graph.json）。build 不需 DB。
//   pnpm run export:graph
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildGraphData } from '../src/lib/graph';
import { loadEnv } from './lib/loadEnv';
import type { RawEntity, RawRelationship } from '../src/lib/types';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  // officials（只取建節點需要的欄位，分頁撈）
  const officials: { id: string; slug: string; name: string; party: string; office_type: string }[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('officials').select('id, slug, name, party, office_type').range(from, from + pageSize - 1);
    if (error) throw new Error(`officials query failed: ${error.message}`);
    const page = data ?? [];
    officials.push(...(page as typeof officials));
    if (page.length < pageSize) break;
  }

  const { data: entities, error: eErr } = await supabase
    .from('entities').select('id, name, entity_type, description, photo_url, wikipedia_url');
  if (eErr) throw new Error(`entities query failed: ${eErr.message}`);

  const { data: relationships, error: rErr } = await supabase
    .from('relationships')
    .select('id, from_type, from_id, to_type, to_id, relation_type, directed, note, source:sources(*)');
  if (rErr) throw new Error(`relationships query failed: ${rErr.message}`);

  const { data, errors } = buildGraphData(
    officials as Parameters<typeof buildGraphData>[0],
    (entities ?? []) as RawEntity[],
    (relationships ?? []) as unknown as RawRelationship[],
  );
  if (errors.length > 0) {
    throw new Error(`Graph validation failed (export aborted):\n- ${errors.join('\n- ')}`);
  }

  const outDir = join(here, '..', 'src', 'data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'graph.json'), JSON.stringify(data));
  console.log(`exported graph: ${data.nodes.length} nodes, ${data.edges.length} edges → src/data/graph.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
