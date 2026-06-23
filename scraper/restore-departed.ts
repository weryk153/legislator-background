// One-off: restore the 13 mid-term-departed councilors that were deleted, re-inserting them
// with their full data (from the pre-deletion snapshot) and marking them is_incumbent=false +
// a departed_reason — per the "term snapshot, mark 已解職 rather than delete" decision.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';
import type { Official } from '../src/lib/types';

loadEnv();

const REASONS: Record<string, string> = {
  林茂明: '因賄選經判刑定讞，依法解職',
  蕭慧敏: '因賄選經判刑定讞（二審撤銷緩刑），依法解職',
  鄭昱芸: '因詐領助理費經判刑定讞，依法解職',
  王景山: '因違反廢棄物清理法經判刑1年10月定讞，依法解職',
  郭再添: '因非法經營匯兌經判刑4年定讞，依法解職',
  黃碧妹: '因詐領議會出席費經判刑定讞、褫奪公權，依法解職',
  歐中慨: '因詐領助理費認罪定讞，依法解職',
  陳德木: '當選無效之訴判決確定，依法解職',
  施嘉華: '當選無效之訴判決確定，依法解職',
  潘連周: '因涉賄選，當選無效判決確定，依法解職',
  楊育菡: '因妨害投票，當選無效判決確定，依法解職',
  王啟敏: '任內病逝（2024年9月27日）',
  李茂豐: '任內病逝（2024年10月4日）',
};

async function insertSource(sb: any, s: any): Promise<string | null> {
  if (!s) return null;
  const { data, error } = await sb.from('sources')
    .insert({ url: s.url, type: s.type, title: s.title, retrieved_at: s.retrievedAt }).select('id').single();
  if (error) throw new Error('source: ' + error.message);
  return data.id;
}

async function main() {
  const url = process.env.PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key);
  const all = JSON.parse(readFileSync('/tmp/pre_delete_officials.json', 'utf8')) as Official[];

  for (const name of Object.keys(REASONS)) {
    const o = all.find((x) => x.name === name && x.officeType === 'councilor');
    if (!o) { console.warn('not found in snapshot:', name); continue; }
    // skip if already present (idempotent)
    const { data: exist } = await sb.from('officials').select('id').eq('id', o.id).maybeSingle();
    if (exist) { console.log('already present:', name); continue; }

    const { error: oErr } = await sb.from('officials').insert({
      id: o.id, slug: o.slug, name: o.name, party: o.party, office_type: o.officeType,
      district: o.district, term: o.term, photo_url: o.photoUrl, bio: o.bio,
      is_incumbent: false, departed_reason: REASONS[name],
    });
    if (oErr) throw new Error(`official ${name}: ${oErr.message}`);

    for (const c of o.careers) {
      const sid = await insertSource(sb, c.source);
      await sb.from('careers').insert({ official_id: o.id, title: c.title, organization: c.organization, start_date: c.startDate, end_date: c.endDate, source_id: sid });
    }
    for (const a of o.assets) {
      const sid = await insertSource(sb, a.source);
      const { data: decl } = await sb.from('asset_declarations').insert({ official_id: o.id, year: a.year, total_amount: null, source_id: sid }).select('id').single();
      for (const it of a.items) await sb.from('asset_items').insert({ declaration_id: decl!.id, category: it.category, amount: it.amount, label: it.label ?? null });
    }
    for (const j of o.judgments) {
      const sid = await insertSource(sb, j.source);
      await sb.from('judgments').insert({ official_id: o.id, case_reason: j.caseReason, court: j.court, case_number: j.caseNumber, outcome: j.outcome, is_final: j.isFinal, judgment_date: j.judgmentDate, judgment_url: j.judgmentUrl, source_id: sid });
    }
    for (const c of o.controversies) {
      const { data: row } = await sb.from('controversies').insert({ official_id: o.id, title: c.title, summary: c.summary, status: c.status, event_date: c.eventDate, report_date: c.reportDate }).select('id').single();
      for (const s of c.sources) { const sid = await insertSource(sb, s); await sb.from('controversy_sources').insert({ controversy_id: row!.id, source_id: sid }); }
    }
    console.log('restored:', name, '|', REASONS[name]);
  }
  console.log('done.');
}
main().catch((e) => { console.error(e); process.exit(1); });
