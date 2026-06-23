// Enrich 縣市首長 career history from Wikipedia infobox office/term fields.
// CEC only provides election records (當選/參選), not professional career history, and there is
// no official career-history source for mayors/magistrates (unlike legislators' 立法院 API). The
// richest reliable source for their offices held (署長/校長/副市長/市長…) is the Wikipedia
// {{Infobox officeholder}} office/term fields. Source is labelled type='wiki' for transparency.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cleanOffice(s: string): string {
  return s
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '')
    .replace(/\[\[(?:File|檔案|Image):[^\]]*\]\]/gi, '')
    .replace(/<sup>[\s\S]*?<\/sup>/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/第[一二三四五六七八九十百零\d－\-~～、,，至]+(任|屆)/g, '')
    .replace(/<br\s*\/?>/g, ' ').replace(/'''?/g, '')
    .replace(/（[^）]*）|\([^)]*\)/g, '')
    .replace(/\s+/g, ' ').trim();
}
const yearOf = (s: string): string => { const m = String(s).match(/(\d{4})/); return m ? m[1] : ''; };

function parseCareers(wt: string): Array<{ title: string; start: string; end: string | null }> {
  const offices = new Map<string, string>();
  const starts = new Map<string, string>();
  const ends = new Map<string, string>();
  for (const m of wt.matchAll(/\|\s*(?:office|order)(\d*)\s*=\s*([^\n]+)/g)) if (!offices.has(m[1])) offices.set(m[1], m[2]);
  for (const m of wt.matchAll(/\|\s*term_start(\d*)\s*=\s*([^\n]+)/g)) starts.set(m[1], m[2]);
  for (const m of wt.matchAll(/\|\s*term_end(\d*)\s*=\s*([^\n]+)/g)) ends.set(m[1], m[2]);
  const out: Array<{ title: string; start: string; end: string | null }> = [];
  const seen = new Set<string>();
  for (const [k, raw] of offices) {
    const title = cleanOffice(raw);
    if (!title || title.length < 2 || title.length > 40) continue;
    if (seen.has(title)) continue; seen.add(title);
    const start = yearOf(starts.get(k) ?? '');
    const endRaw = ends.get(k) ?? '';
    const end = /現任|至今|incumbent/.test(endRaw) || !endRaw.trim() ? null : yearOf(endRaw) || null;
    out.push({ title, start, end });
  }
  return out;
}

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const { data } = await sb.from('officials').select('id, name').eq('office_type', 'mayor_magistrate').order('name');
  let list = (data as { id: string; name: string }[]);
  if (only) list = list.filter((o) => only.includes(o.name));
  // Disambiguation pages: map name → the specific officeholder sub-page.
  const PAGE: Record<string, string> = { 許淑華: '許淑華 (1975年)', 王忠銘: '王忠銘 (中華民國)' };
  for (const off of list) {
    const page = PAGE[off.name] ?? off.name;
    let wt: string | null = null;
    for (let a = 0; a < 3 && !wt; a++) {
      try {
        await sleep(a ? 2500 : 0);
        const r = await fetch('https://zh.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&redirects=1&page=' + encodeURIComponent(page), { headers: { 'user-agent': UA } });
        const t = await r.text(); if (t[0] !== '{') continue;
        wt = JSON.parse(t)?.parse?.wikitext?.['*'];
      } catch { /* retry */ }
    }
    if (!wt) { console.log('✗', off.name, 'wiki missing'); continue; }
    const careers = parseCareers(wt);
    if (process.env.DRY_RUN) { console.log(`\n${off.name} (${careers.length}):`); careers.forEach((c) => console.log(`  ${c.start}–${c.end ?? '現任'}  ${c.title}`)); continue; }
    if (!careers.length) { console.log('—', off.name, 'no careers parsed'); continue; }
    const url = 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(page);
    const { data: src } = await sb.from('sources').insert({ url, type: 'wiki', title: '維基百科', retrieved_at: '2026-06-23' }).select('id').single();
    await sb.from('careers').delete().eq('official_id', off.id);
    for (const c of careers) await sb.from('careers').insert({ official_id: off.id, title: c.title, organization: '', start_date: c.start || null, end_date: c.end, source_id: src!.id });
    console.log('✓', off.name, '→', careers.length, 'careers');
    await sleep(1000);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
