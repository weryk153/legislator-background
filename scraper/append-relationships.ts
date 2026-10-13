// 增量匯入已審定關係；不刪除／改寫既有節點、關係或來源。
// pnpm run append:relationships          # 唯讀預檢
// pnpm run append:relationships --apply  # 寫入本機 Supabase，可重跑
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { planRelationshipBatch, type BatchEntity, type BatchRelationship, type BatchSource } from './lib/relationshipBatch';
import type { CuratedRelationship } from './lib/curatedRelationships';
import type { Roster } from './lib/relEndpoints';

const here = dirname(fileURLToPath(import.meta.url));
async function main() {
  if (process.argv.slice(2).some((a) => a !== '--apply')) throw new Error('只接受 --apply；省略時為唯讀預檢');
  loadEnv();
  const url = process.env.PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing local Supabase environment');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('此增量工具僅供本機 Supabase 使用');
  const db = createClient(url, key);
  const rows = JSON.parse(readFileSync(join(here, 'relationships-curated.json'), 'utf8')) as CuratedRelationship[];
  const identities = JSON.parse(readFileSync(join(here, 'entity-identities.json'), 'utf8')) as Record<string, string>;
  async function all<T>(table: string, columns: string): Promise<T[]> {
    const result: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select(columns).order('id').range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      result.push(...(data ?? []) as unknown as T[]);
      if ((data?.length ?? 0) < 1000) return result;
    }
  }
  const [roster, entities, relationships] = await Promise.all([
    all<Roster[number]>('officials', 'id,name,office_type'),
    all<BatchEntity>('entities', 'id,name,entity_type,description'),
    all<BatchRelationship>('relationships', 'id,from_type,from_id,to_type,to_id,relation_type,directed,note,source_id'),
  ]);
  // sources 有上萬列，只取既有關係與本批固定 ID 會用到的來源；含上次中途失敗已建出的來源。
  const sourceIds = [...new Set([...relationships.map((r) => r.source_id), ...rows.flatMap((r) => r.id ? [r.id] : [])])];
  const sources: BatchSource[] = [];
  for (let i = 0; i < sourceIds.length; i += 100) {
    const { data, error } = await db.from('sources').select('id,url,type,title,retrieved_at').in('id', sourceIds.slice(i, i + 100));
    if (error) throw new Error(`sources: ${error.message}`);
    sources.push(...(data ?? []));
  }
  const plan = planRelationshipBatch(rows, roster, identities, { entities, sources, relationships });
  console.log(`預檢通過：新增 ${plan.entities.length} 個人物、${plan.sources.length} 筆來源、${plan.relationships.length} 條關係；${plan.unchanged} 條已存在且一致。`);
  if (!process.argv.includes('--apply')) { console.log('唯讀預檢完成；加 --apply 才會寫入。'); return; }
  // 先建端點與來源，再建關係。若中途失敗，重跑會逐筆比對已完成項目並接續，絕不 upsert 覆蓋。
  const batches: [string, Record<string, unknown>[]][] = [
    ['entities', plan.entities], ['sources', plan.sources], ['relationships', plan.relationships],
  ];
  for (const [table, data] of batches) {
    for (let i = 0; i < data.length; i += 100) {
      const { error } = await db.from(table).insert(data.slice(i, i + 100));
      if (error) throw new Error(`${table} 寫入失敗（可重跑接續）: ${error.message}`);
    }
  }
  console.log('增量匯入完成。請執行 pnpm run export:graph 更新網站快照。');
}
main().catch((e) => { console.error(e); process.exit(1); });
