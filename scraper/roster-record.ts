// 名冊修復記錄 — 把「已人工確認」的名冊變更（改名/解職/新增）寫入 DB。
// 見 docs/superpowers/specs/2026-07-23-roster-audit-design.md「修復流程」。
//
// 來源：scraper/roster-confirmed.json（人工查證新聞/議會公告後填寫，逐案確認身分＋事實，
// 寧缺勿錯——比照 judgments-confirmed 流程；本腳本只負責安全寫入，不做身分判斷）。
//
// 設計文件原列 4 種操作（add / rename / depart / add_successor）；本實作簡化為 3 種——
// add 已把「遞補就任」「補選當選」等 career 資訊一併帶上（career_title/career_org/start_date），
// 涵蓋純新增與遞補兩種情境，不需要獨立的 add_successor：
//
//   rename: { op:'rename', from, to, office_type, district, note?, source_url, source_title }
//     → officials.name: from → to（依 name+office_type+district 精準比對，需恰一筆）。
//     　slug 不動——slug 是頁面 URL 身分，改名不搬家；異體字正名見設計文件「已確認事實」。
//
//   depart: { op:'depart', name, office_type, district, reason, source_url, source_title, date }
//     → is_incumbent=false、departed_reason=reason；另插入 news source ＋一筆
//     　career{title:'解職', organization:reason, start_date:date, end_date:date, source_id}
//     　讓出處在頁面上看得到（officials.departed_reason 本身不掛 source_id 欄位——
//     　既有已解職名單如戴寧/林茂明等亦無此機制，故比照 careers 掛出處這個既有模式）。
//
//   add: { op:'add', name, office_type, district, party, term, career_title, career_org,
//          start_date, source_url, source_title }
//     → 新增 officials 列（is_incumbent=true、bio=''、photo_url=null，photo/bio 留待既有
//     　enrichment 腳本補）＋一筆 career{title:career_title, organization:career_org,
//     　start_date, source_id}。id 交給 DB 預設 gen_random_uuid()；slug 依現有議員慣例
//     　c-{姓名}-{政黨}-{選區} 產生（見 lib/roster-record-lib.ts）。
//     　目前僅支援 office_type='councilor'——立委/首長 slug 另有慣例（羅馬拼音/自訂），
//     　confirmed 名單若混入非議員的 add，本腳本會拒絕並要求人工個案處理。
//
// 冪等（可重跑）：
//   rename：查無 from 但已存在 to（同 office_type/district）→ 視為已改名，跳過。
//   depart：已是 is_incumbent=false 且 departed_reason 完全相同 → 跳過。
//   add：(name, office_type, district) 已存在 → 跳過。
//
//   pnpm run roster:record            # 寫入
//   DRY_RUN=1 pnpm run roster:record  # 只檢查不寫
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { validateOp, generateCouncilorSlug } from './lib/roster-record-lib';
import type { ConfirmedOp, RenameOp, DepartOp, AddOp } from './lib/roster-record-lib';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = !!process.env.DRY_RUN;
const RETRIEVED_AT = '2026-07-23'; // 本次人工查證/寫入日，見 scraper/roster-confirmed.json 各筆 note/source

async function insertSource(sb: any, url: string, title: string): Promise<string> {
  const { data, error } = await sb.from('sources')
    .insert({ url, title, type: 'news', retrieved_at: RETRIEVED_AT }).select('id').single();
  if (error) throw new Error(`source insert failed: ${error.message}`);
  return data.id as string;
}

async function handleRename(sb: any, r: RenameOp): Promise<'done' | 'skip' | 'error'> {
  const { data: fromRows, error: fe } = await sb.from('officials')
    .select('id, name').eq('name', r.from).eq('office_type', r.office_type).eq('district', r.district);
  if (fe) { console.log('✗ rename', r.from, '→', r.to, 'query失敗:', fe.message); return 'error'; }

  if ((fromRows ?? []).length === 0) {
    const { data: toRows, error: te } = await sb.from('officials')
      .select('id').eq('name', r.to).eq('office_type', r.office_type).eq('district', r.district);
    if (te) { console.log('✗ rename', r.from, '→', r.to, 'query失敗:', te.message); return 'error'; }
    if ((toRows ?? []).length > 0) { console.log('= rename', r.from, '→', r.to, '已改名，跳過'); return 'skip'; }
    console.log('✗ rename', r.from, '→', r.to, `(${r.office_type}/${r.district})`, '查無符合的 from，且 to 也不存在——請確認姓名/職務/選區');
    return 'error';
  }
  if (fromRows.length > 1) {
    console.log('✗ rename', r.from, '→', r.to, `(${r.office_type}/${r.district})`, `同名同職務同選區有 ${fromRows.length} 筆，無法安全改名——請人工消歧`);
    return 'error';
  }

  const id = fromRows[0].id;
  if (DRY_RUN) { console.log('✓(dry) rename', r.from, '→', r.to); return 'done'; }
  const { error: ue } = await sb.from('officials').update({ name: r.to }).eq('id', id);
  if (ue) { console.log('✗ rename', r.from, '→', r.to, 'update失敗:', ue.message); return 'error'; }
  console.log('● rename', r.from, '→', r.to);
  return 'done';
}

async function handleDepart(sb: any, r: DepartOp): Promise<'done' | 'skip' | 'error'> {
  const { data: rows, error: qe } = await sb.from('officials')
    .select('id, is_incumbent, departed_reason').eq('name', r.name).eq('office_type', r.office_type).eq('district', r.district);
  if (qe) { console.log('✗ depart', r.name, 'query失敗:', qe.message); return 'error'; }
  if ((rows ?? []).length === 0) {
    console.log('✗ depart', r.name, `(${r.office_type}/${r.district})`, '查無符合此人——請確認姓名/職務/選區');
    return 'error';
  }
  if (rows.length > 1) {
    console.log('✗ depart', r.name, `(${r.office_type}/${r.district})`, `同名同職務同選區有 ${rows.length} 筆，無法安全解職——請人工消歧`);
    return 'error';
  }

  const row = rows[0];
  if (row.is_incumbent === false && row.departed_reason === r.reason) {
    console.log('= depart', r.name, '已標記解職且理由相同，跳過');
    return 'skip';
  }

  if (DRY_RUN) { console.log('✓(dry) depart', r.name, '→', r.reason); return 'done'; }

  const sourceId = await insertSource(sb, r.source_url, r.source_title);
  const { error: ue } = await sb.from('officials')
    .update({ is_incumbent: false, departed_reason: r.reason }).eq('id', row.id);
  if (ue) { console.log('✗ depart', r.name, 'update失敗:', ue.message); return 'error'; }
  const { error: ce } = await sb.from('careers').insert({
    official_id: row.id, title: '解職', organization: r.reason, start_date: r.date, end_date: r.date, source_id: sourceId,
  });
  if (ce) { console.log('✗ depart', r.name, 'career insert失敗:', ce.message); return 'error'; }
  console.log('● depart', r.name, '→', r.reason);
  return 'done';
}

async function handleAdd(sb: any, r: AddOp): Promise<'done' | 'skip' | 'error'> {
  const { data: existing, error: qe } = await sb.from('officials')
    .select('id').eq('name', r.name).eq('office_type', r.office_type).eq('district', r.district);
  if (qe) { console.log('✗ add', r.name, 'query失敗:', qe.message); return 'error'; }
  if ((existing ?? []).length > 0) { console.log('= add', r.name, '已存在，跳過'); return 'skip'; }

  if (r.office_type !== 'councilor') {
    console.log('✗ add', r.name, `office_type=${r.office_type} 尚不支援自動產生 slug（僅支援 councilor）——請人工個案處理`);
    return 'error';
  }
  const slug = generateCouncilorSlug(r.name, r.party, r.district);

  if (DRY_RUN) { console.log('✓(dry) add', r.name, `(${r.office_type}/${r.district})`, 'slug=', slug); return 'done'; }

  const sourceId = await insertSource(sb, r.source_url, r.source_title);
  const { data: off, error: oe } = await sb.from('officials').insert({
    slug, name: r.name, party: r.party, office_type: r.office_type, district: r.district, term: r.term,
    photo_url: null, bio: '', is_incumbent: true,
  }).select('id').single();
  if (oe) { console.log('✗ add', r.name, 'official insert失敗:', oe.message); return 'error'; }
  const { error: ce } = await sb.from('careers').insert({
    official_id: off.id, title: r.career_title, organization: r.career_org, start_date: r.start_date, end_date: null, source_id: sourceId,
  });
  if (ce) { console.log('✗ add', r.name, 'career insert失敗:', ce.message); return 'error'; }
  console.log('● add', r.name, `(${r.office_type}/${r.district})`, 'slug=', slug);
  return 'done';
}

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const rows = JSON.parse(readFileSync(join(here, 'roster-confirmed.json'), 'utf8')) as ConfirmedOp[];

  if (rows.length === 0) {
    console.log(DRY_RUN ? 'DRY_RUN: 0 ops' : '0 ops（roster-confirmed.json 為空)');
    return;
  }

  let done = 0, skip = 0, error = 0;
  for (const row of rows) {
    const v = validateOp(row);
    if (!v.ok) { error++; console.log('✗', JSON.stringify(row).slice(0, 80), '驗證失敗:', v.errors.join('; ')); continue; }

    let outcome: 'done' | 'skip' | 'error';
    if (row.op === 'rename') outcome = await handleRename(sb, row);
    else if (row.op === 'depart') outcome = await handleDepart(sb, row);
    else outcome = await handleAdd(sb, row);

    if (outcome === 'done') done++; else if (outcome === 'skip') skip++; else error++;
  }

  console.log(`\n完成：${DRY_RUN ? '(dry) ' : ''}執行 ${done}、跳過(已處理) ${skip}、錯誤 ${error}（共 ${rows.length} ops）`);
  if (!DRY_RUN && done) console.log('記得依設計文件「下游更新」跑 donations:record / donations:corp-record / export:data。');
  if (error) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
