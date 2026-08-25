// 匯入經研究查證的人物關係（scraper/relationships-curated.json）至本地 Supabase。
// 來源為維基百科／新聞（事實性親屬與政治關係，每筆附 URL）。可重跑：先清除所有
// 非 court 來源的關係與其孤立 entity，再重新匯入（保留判決來源的種子關係）。
//   pnpm run import:relationships
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { loadEntitiesWiki, indexEntitiesWiki, entityWikiKey } from './lib/entitiesWiki';
import { resolveSubject, resolveCounterpart, officialIdIn, type Roster } from './lib/relEndpoints';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));

type Curated = {
  subject: string; counterpartName: string; counterpartRole: string;
  // 人工判斷的「同名不同人」註記，只有在真的是不同人時才會出現（例如李佳芬同時是
  // 謝龍介之妻與韓國瑜之妻）。由人查證後手寫，不是從 counterpartRole 字串推論。
  // 一旦標記，此列即：(1) 拆開 entity 去重快取鍵；(2) 絕不走名冊姓名比對（見下方
  // counterpart 端點）；(3) 不再列入「疑為同一人重複記錄」的覆核警示。
  // 2 度關係：subject 為既有 entity（如柯文哲）。省略＝official。subjectDistinct 對應建立該 entity
  // 那列的 counterpartDistinct，一字不差。
  subjectKind?: 'official' | 'entity';
  subjectDistinct?: string;
  counterpartDistinct?: string;
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
  const roster: Roster = officials;
  const officialId = (name: string, restrict?: boolean) => officialIdIn(roster, name, restrict);

  // 冪等清除：刪掉先前由本匯入產生的關係（保留判決 court 來源的種子關係）。
  // 注意：sources 表有上萬筆（官員生涯/判決/公報來源），不可用 .select('id').in('type',[...])
  // 反查 source_id —— PostgREST 預設上限 1000 會漏抓，導致殘留關係跨次累積成重複邊。
  // 改為分頁掃描 relationships＋其來源型別，逐批刪除所有非 court 者。
  {
    const stale: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('relationships').select('id, source:sources(type)').range(from, from + 999);
      if (error) throw new Error(`relationships scan failed: ${error.message}`);
      for (const r of (data ?? []) as { id: string; source?: { type?: string } }[]) {
        if (r.source?.type !== 'court') stale.push(r.id);
      }
      if ((data?.length ?? 0) < 1000) break;
    }
    for (let i = 0; i < stale.length; i += 100) {
      const { error } = await supabase.from('relationships').delete().in('id', stale.slice(i, i + 100));
      if (error) throw new Error(`relationship clear failed: ${error.message}`);
    }
  }

  // entity 去重快取。鍵預設只用姓名（絕大多數同名列都是「同一人的不同寫法」，
  // 例如柯文哲的職稱在不同列分別寫成「台灣民眾黨創黨主席」「臺灣民眾黨主席」——
  // 若拿 counterpartRole／描述字串本身當鍵，這種措辭差異會被誤判成不同人，
  // 讓柯文哲、朱立倫、賴清德…等連結全站最多人的樞紐人物被拆成兩三個節點，
  // 反而摧毀關係圖存在的意義。同名不同人是罕見例外（如李佳芬同時是謝龍介之妻與
  // 韓國瑜之妻），必須由人查證後在 curated 資料上手寫 counterpartDistinct 標記
  // 才能生效——身份判斷只能交給人，不能靠字串比對推論。
  // 外部人物 ↔ 維基條目／照片 對照（版控檔案）。entity 每次重匯都重建，照片與條目 URL
  // 只能在這裡套上；沒有對照的 entity 兩欄維持 null。
  const wikiIndex = indexEntitiesWiki(loadEntitiesWiki());
  const wikiUsed = new Set<string>();

  const entityCache = new Map<string, string>();
  async function ensureEntity(name: string, etype: string, desc: string, distinct?: string): Promise<string> {
    const cacheKey = entityWikiKey(name, distinct);
    if (entityCache.has(cacheKey)) return entityCache.get(cacheKey)!;
    const subtype = ENTITY_TYPES.has(etype) ? etype : 'other';
    const wiki = wikiIndex.get(cacheKey);
    if (wiki) wikiUsed.add(cacheKey);
    const { data, error } = await supabase.from('entities').insert({
      name, entity_type: subtype, description: desc,
      wikipedia_url: wiki?.wikipediaUrl ?? null,
      photo_url: wiki?.photo?.file ?? null,
    }).select('id').single();
    if (error) throw new Error(`entity insert failed (${name}): ${error.message}`);
    entityCache.set(cacheKey, data.id);
    return data.id;
  }

  let inserted = 0, skipped = 0;
  const skips: string[] = [];
  const officialFellThrough: string[] = [];
  for (const r of rows) {
    const subj = resolveSubject(r, roster, entityCache);
    if ('skip' in subj) { skipped++; skips.push(subj.skip); continue; }

    // 端點解析規則見 ./lib/relEndpoints.ts
    let toType: 'official' | 'entity', toId: string;
    const cp = resolveCounterpart(r, roster);
    if (cp.type === 'official') { toType = 'official'; toId = cp.id; }
    else {
      if (cp.fellThrough) officialFellThrough.push(`${r.counterpartName}（${r.subject} 的 ${r.relationType}）`);
      toType = 'entity';
      toId = await ensureEntity(r.counterpartName, r.counterpartEntityType ?? 'other', r.counterpartRole || r.note, r.counterpartDistinct);
    }

    // 方向：parent_child 為有向（from=父母）。其餘無向。
    let fromType = subj.type, fromId = subj.id;
    let directed = false;
    if (r.relationType === 'parent_child') {
      directed = true;
      const subjectIsParent = r.parentName && r.parentName === r.subject;
      if (!subjectIsParent) {
        // counterpart 是父母 → 反向（from=counterpart, to=subject）
        [fromType, fromId, toType, toId] = [toType, toId, subj.type, subj.id] as [typeof fromType, string, typeof toType, string];
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

  // 清除孤立 entity（未被任何現存關係引用者）—— 每次匯入都會新建 entity，需回收前次殘留。
  const referenced = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('relationships').select('from_type, from_id, to_type, to_id').range(from, from + 999);
    if (error) throw new Error(`relationships scan (orphan) failed: ${error.message}`);
    for (const r of (data ?? []) as { from_type: string; from_id: string; to_type: string; to_id: string }[]) {
      if (r.from_type === 'entity') referenced.add(r.from_id);
      if (r.to_type === 'entity') referenced.add(r.to_id);
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  const orphans: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('entities').select('id').range(from, from + 999);
    if (error) throw new Error(`entities scan failed: ${error.message}`);
    for (const e of (data ?? []) as { id: string }[]) if (!referenced.has(e.id)) orphans.push(e.id);
    if ((data?.length ?? 0) < 1000) break;
  }
  for (let i = 0; i < orphans.length; i += 100) {
    const { error } = await supabase.from('entities').delete().in('id', orphans.slice(i, i + 100));
    if (error) throw new Error(`orphan entity cleanup failed: ${error.message}`);
  }

  console.log(`匯入完成：${inserted} 筆關係、entity ${entityCache.size} 筆；清孤立 entity ${orphans.length} 筆；略過 ${skipped}`);

  // 對照表有、但本次匯入沒建出對應 entity：代表該人已從 curated 消失（或改走 official 路徑），
  // 對照表該清掉，否則照片檔會變孤兒。
  const wikiStale = [...wikiIndex.keys()].filter((k) => !wikiUsed.has(k));
  if (wikiStale.length) {
    console.log(`\nℹ️ entities-wiki.json 有、但本次未建出 entity（${wikiStale.length} 筆，請檢查是否該移除）：`);
    for (const k of wikiStale) console.log(`  - ${k}`);
  }
  if (skips.length) console.log('略過明細:\n  ' + skips.join('\n  '));

  // counterpartKind: 'official' 但名冊查不到 → 已退成 entity。多數是本站不收錄的中央層級
  // 人物，屬正常；但同一份清單也會在名冊日後新增同名者時改變行為（該筆會突然連到那位
  // 公職），所以每次匯入都印出來，讓這條路徑不再是隱形的。
  if (officialFellThrough.length) {
    const uniq = [...new Set(officialFellThrough)];
    console.log(`\nℹ️ counterpartKind 標為 official 但名冊無唯一匹配、已改建 entity（${uniq.length} 筆）：`);
    for (const s of uniq) console.log(`  - ${s}`);
  }

  // 覆核警示：entity 姓名若能在 officials 唯一匹配，很可能是「同一人被記成兩筆」
  // （本站已發生過的真實問題；當時的重複源頭已在 relationships-curated.json 修正，
  // 不再需要事後合併腳本）。本函式與下方「覆核警示（二）」是現行的偵測機制，
  // 每次匯入都會印出來供人工核對，絕不自動合併/升級為 official——姓名單獨判定正是
  // 「常見名寧缺勿錯」原則要防止的錯誤，合併與否須由人查證職務描述後手動處理。
  //
  // 已由人查證為「同名不同人」者（curated 該列帶 counterpartDistinct）不再列入：這份警示
  // 唯一能做的動作是合併，對已判定為不同人的案例只會是永久的假警報，反而誘導出錯誤的動作。
  // 例如張美慧——spec §3.2 已裁定企業高管與花蓮縣議員是不同人，不該每次匯入都再問一次。
  const { data: allEntities, error: entScanErr } = await supabase.from('entities').select('id, name, description');
  if (entScanErr) throw new Error(`entities scan (覆核警示) failed: ${entScanErr.message}`);
  // 比對 name＋description（description 即匯入時寫入的 counterpartRole||note），
  // 只豁免人工實際標記過的那一筆，同姓名的其他 entity 仍會照常被檢出。
  const confirmedDistinct = new Set(
    rows.filter((r) => r.counterpartDistinct).map((r) => `${r.counterpartName}::${r.counterpartRole || r.note}`),
  );
  const allSuspects = ((allEntities ?? []) as { id: string; name: string; description: string | null }[])
    .map((e) => ({ ...e, matchOfficialId: officialId(e.name) }))
    .filter((e) => e.matchOfficialId);
  const suspects = allSuspects.filter((e) => !confirmedDistinct.has(`${e.name}::${e.description ?? ''}`));
  const confirmedCount = allSuspects.length - suspects.length;
  if (suspects.length) {
    console.log(`\n⚠️ 待人工覆核（${suspects.length} 筆）：以下 entity 姓名可在 officials 唯一匹配，疑為同一人重複記錄，未自動處理：`);
    for (const s of suspects) console.log(`  - ${s.name}（entity ${s.id} ↔ official ${s.matchOfficialId}）：${s.description ?? '（無描述）'}`);
  } else {
    console.log('\n覆核：沒有 entity 姓名可唯一匹配 officials，未發現疑似重複記錄。');
  }
  if (confirmedCount) console.log(`  （另有 ${confirmedCount} 筆姓名可匹配、但已由人工以 counterpartDistinct 確認為不同人，不再列出）`);

  // 覆核警示（二）：安全網。同一姓名在 curated 中出現多種不同 counterpartRole
  // 描述，卻沒有 counterpartDistinct 標記——目前仍會依姓名合併為同一筆 entity。
  // 絕大多數是純措辭差異（如「前行政院長」vs「前行政院院長」），但也可能是
  // 尚未被發現的同名不同人（未來新增的真實案例會出現在這份清單，而不是被
  // 靜默合併）。列出來供人工檢查，多數項目屬措辭差異、無需動作。
  const roleVariants = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.counterpartDistinct) continue; // 已由人工標記為不同人，不算未解決
    const asOfficial = r.counterpartKind === 'official' ? officialId(r.counterpartName) : null;
    if (asOfficial) continue; // 走 official 路徑，不會建立 entity，無合併疑慮
    const role = r.counterpartRole || r.note;
    (roleVariants.get(r.counterpartName) ?? roleVariants.set(r.counterpartName, new Set()).get(r.counterpartName)!).add(role);
  }
  const variantNames = [...roleVariants.entries()].filter(([, roles]) => roles.size > 1);
  if (variantNames.length) {
    console.log(`\n⚠️ 待人工檢查（${variantNames.length} 筆，多數為措辭差異）：以下姓名在 curated 中有多種 counterpartRole 描述、但未標記 counterpartDistinct，目前仍依姓名合併為同一筆 entity。若其中有同名不同人，須在該筆加上 counterpartDistinct：`);
    for (const [name, roles] of variantNames) console.log(`  - ${name}：${[...roles].join(' / ')}`);
  } else {
    console.log('\n覆核：沒有姓名帶有多種未標記的 counterpartRole 描述。');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
