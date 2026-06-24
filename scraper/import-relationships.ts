// 匯入經研究查證的人物關係（scraper/relationships-curated.json）至本地 Supabase。
// 來源為維基百科／新聞（事實性親屬與政治關係，每筆附 URL）。可重跑：先清除所有
// 非 court 來源的關係與其孤立 entity，再重新匯入（保留判決來源的種子關係）。
//   pnpm run import:relationships
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));

type Curated = {
  subject: string; counterpartName: string; counterpartRole: string;
  counterpartKind: 'official' | 'entity';
  counterpartEntityType?: string;
  relationType: string; parentName?: string; note: string;
  sourceUrl: string; sourceType: 'wiki' | 'news';
};

const ENTITY_TYPES = new Set(['businessperson', 'religious', 'celebrity', 'media', 'family_member', 'organization', 'other']);

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key);

  const rows = JSON.parse(readFileSync(join(here, 'relationships-curated.json'), 'utf8')) as Curated[];

  // 名冊：name → official id。同名（多筆）者記錄為「不可唯一匹配」，counterpart 端遇到就降級為 entity。
  const officials: { id: string; name: string; office_type: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('officials').select('id, name, office_type').range(from, from + 999);
    if (error) throw new Error(`officials query failed: ${error.message}`);
    officials.push(...(data ?? []) as typeof officials);
    if ((data?.length ?? 0) < 1000) break;
  }
  const byName = new Map<string, string[]>();
  for (const o of officials) (byName.get(o.name) ?? byName.set(o.name, []).get(o.name)!).push(o.id);
  const NATIONAL = new Set(['legislator', 'mayor_magistrate']);
  const officialId = (name: string, restrict?: boolean): string | null => {
    const pool = officials.filter((o) => o.name === name && (!restrict || NATIONAL.has(o.office_type)));
    return pool.length === 1 ? pool[0].id : null; // 僅唯一匹配才連，避免同名錯掛
  };

  // 冪等：清掉先前由本匯入產生的資料（wiki/news 來源的關係 + 之後變孤立的 entity）。
  await supabase.from('relationships').delete().in('source_id',
    (await supabase.from('sources').select('id').in('type', ['wiki', 'news'])).data?.map((s) => s.id) ?? ['00000000-0000-0000-0000-000000000000']);

  // entity 去重快取（name → id）
  const entityCache = new Map<string, string>();
  async function ensureEntity(name: string, etype: string, desc: string): Promise<string> {
    if (entityCache.has(name)) return entityCache.get(name)!;
    const subtype = ENTITY_TYPES.has(etype) ? etype : 'other';
    const { data, error } = await supabase.from('entities').insert({ name, entity_type: subtype, description: desc }).select('id').single();
    if (error) throw new Error(`entity insert failed (${name}): ${error.message}`);
    entityCache.set(name, data.id);
    return data.id;
  }

  let inserted = 0, skipped = 0;
  const skips: string[] = [];
  for (const r of rows) {
    const subjId = officialId(r.subject, true);
    if (!subjId) { skipped++; skips.push(`subject 未匹配: ${r.subject}`); continue; }

    // counterpart 端點
    let toType: 'official' | 'entity', toId: string;
    const asOfficial = r.counterpartKind === 'official' ? officialId(r.counterpartName) : null;
    if (asOfficial) { toType = 'official'; toId = asOfficial; }
    else { toType = 'entity'; toId = await ensureEntity(r.counterpartName, r.counterpartEntityType ?? 'other', r.counterpartRole || r.note); }

    // 方向：parent_child 為有向（from=父母）。其餘無向。
    let fromType: 'official' | 'entity' = 'official', fromId = subjId;
    let directed = false;
    if (r.relationType === 'parent_child') {
      directed = true;
      const subjectIsParent = r.parentName && r.parentName === r.subject;
      if (!subjectIsParent) {
        // counterpart 是父母 → 反向（from=counterpart, to=subject）
        [fromType, fromId, toType, toId] = [toType, toId, 'official', subjId] as [typeof fromType, string, typeof toType, string];
      }
    }

    const { data: src, error: se } = await supabase.from('sources')
      .insert({ url: r.sourceUrl, type: r.sourceType, title: `${r.subject}關係資料：${r.relationType}`, retrieved_at: '2026-06-25' })
      .select('id').single();
    if (se) throw new Error(`source insert failed: ${se.message}`);

    const { error: re } = await supabase.from('relationships').insert({
      from_type: fromType, from_id: fromId, to_type: toType, to_id: toId,
      relation_type: r.relationType, directed, note: r.note, source_id: src.id,
    });
    if (re) { skipped++; skips.push(`relationship 失敗 ${r.subject}-${r.counterpartName}: ${re.message}`); continue; }
    inserted++;
  }

  console.log(`匯入完成：${inserted} 筆關係、entity ${entityCache.size} 筆；略過 ${skipped}`);
  if (skips.length) console.log('略過明細:\n  ' + skips.join('\n  '));
}

main().catch((e) => { console.error(e); process.exit(1); });
