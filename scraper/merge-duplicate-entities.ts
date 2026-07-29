// 合併被重複建立的節點（同一人／同一派系存在兩個節點）。對照表為人工查證後寫死，
// 不做任何自動比對——依本站「常見名寧缺勿錯」原則，僅職務描述吻合者才合併。
// 見 docs/superpowers/specs/2026-07-29-relationship-graph-visual-design.md §3
//   pnpm run merge:entities -- --dry-run   先看要動什麼
//   pnpm run merge:entities                實際執行
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';
import { planMerges, type MergePair, type RelRow } from './lib/mergeNodes';

loadEnv();

// entity → official（5 組）＋ entity → entity（1 組派系）。
// UUID 取自 2026-07-29 的 graph.json / officials.json 快照。
const MERGES: MergePair[] = [
  { label: '韓國瑜',
    from: { type: 'entity', id: '0dc9c98f-1822-4467-b073-eae3a65fef76' },
    to:   { type: 'official', id: '2934ac93-29eb-4e28-90a0-9a2c093c7345' } },
  { label: '侯友宜',
    from: { type: 'entity', id: '4c935497-9f90-4e2f-b293-36812423f864' },
    to:   { type: 'official', id: '0fe86bde-9363-4cf4-a293-bf2199575b79' } },
  { label: '蔡咏鍀',
    from: { type: 'entity', id: '20c7d78d-a760-4fb6-a73f-850cf22211f8' },
    to:   { type: 'official', id: 'cb52edb8-ac4f-4a44-9533-b733e86955f3' } },
  { label: '謝典霖',
    from: { type: 'entity', id: '47d3e254-3556-48d1-bbe7-c13e5d1db7a2' },
    to:   { type: 'official', id: 'c1357d9e-724d-4351-810d-5156446f7700' } },
  { label: '許家蓓',
    from: { type: 'entity', id: 'e2b07369-96b1-4dae-9c52-d88044227375' },
    to:   { type: 'official', id: 'b3392a2c-1b4b-4978-bb02-0653c500e4a2' } },
  { label: '新潮流系（併入通用名稱節點）',
    from: { type: 'entity', id: '2a5bc90c-21c9-4cbe-8094-ca0bc9ca09ec' },
    to:   { type: 'entity', id: '04c84ea2-4cd2-4cb5-a3e7-8ce335f8aba5' } },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  // 分頁撈全部關係（PostgREST 預設上限 1000）
  const rows: RelRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('relationships')
      .select('id, from_type, from_id, to_type, to_id, relation_type, directed')
      .range(from, from + 999);
    if (error) throw new Error(`relationships query failed: ${error.message}`);
    const page = (data ?? []) as RelRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  const { updates, deletes } = planMerges(rows, MERGES);

  console.log(`關係總數 ${rows.length}`);
  console.log(`將改寫 ${updates.length} 筆、刪除 ${deletes.length} 筆（自連／重複）`);
  for (const m of MERGES) {
    const n = updates.filter((u) =>
      (u.from_type === m.to.type && u.from_id === m.to.id) ||
      (u.to_type === m.to.type && u.to_id === m.to.id)).length;
    console.log(`  ${m.label}: ${n} 筆改寫`);
  }

  if (dryRun) {
    console.log('--dry-run：未寫入任何資料');
    return;
  }

  // 順序重要：先刪除（自連／重複），再改寫，最後才刪 entity。
  // 反過來會留下端點解析不到的懸空邊，export 時會被 validate 擋下。
  if (deletes.length > 0) {
    const { error } = await supabase.from('relationships').delete().in('id', deletes);
    if (error) throw new Error(`delete relationships failed: ${error.message}`);
  }

  for (const u of updates) {
    const { error } = await supabase.from('relationships')
      .update({ from_type: u.from_type, from_id: u.from_id, to_type: u.to_type, to_id: u.to_id })
      .eq('id', u.id);
    if (error) throw new Error(`update relationship ${u.id} failed: ${error.message}`);
  }

  // 刪掉被併掉的 entity。已不存在者（重跑）不視為錯誤。
  const staleEntityIds = MERGES.filter((m) => m.from.type === 'entity').map((m) => m.from.id);
  const { error: delErr } = await supabase.from('entities').delete().in('id', staleEntityIds);
  if (delErr) throw new Error(`delete entities failed: ${delErr.message}`);

  console.log(`完成：改寫 ${updates.length}、刪除關係 ${deletes.length}、刪除 entity ${staleEntityIds.length}`);
  console.log('接著請執行 pnpm run export:graph 重新產生 src/data/graph.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
