// Enrich 縣市議員 career history from Wikipedia infobox office/order fields.
// Councilors only have CEC election records (no professional career history). Most local
// councilors have no Wikipedia page, but prominent ones (議長, former 立委/鎮長, etc.) do.
// SAFEGUARD against same-name false positives: only use a wiki page that (a) has an
// officeholder/politician infobox AND (b) mentions the councilor's own 縣市 + 議員/議會.
// We ADD only the NON-council roles (立委/鎮長/里長/professional…) on top of the existing
// election records — no deletion, no duplication of the council seat already recorded.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cleanOffice(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
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
    if (!title || title.length < 2 || title.length > 40 || seen.has(title)) continue;
    // Reject malformed captures (stray infobox metadata, date-only fragments, no CJK role word).
    if (/[=|｜]|term_|start|end/i.test(title) || /^\d{4}年/.test(title) || !/[一-鿿]/.test(title)) continue;
    seen.add(title);
    const endRaw = ends.get(k) ?? '';
    const end = /現任|至今|incumbent/.test(endRaw) || !endRaw.trim() ? null : yearOf(endRaw) || null;
    out.push({ title, start: yearOf(starts.get(k) ?? ''), end });
  }
  return out;
}

async function fetchWiki(page: string): Promise<string | null> {
  for (let a = 0; a < 3; a++) {
    try {
      await sleep(a ? 2500 : 0);
      const r = await fetch('https://zh.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&redirects=1&page=' + encodeURIComponent(page), { headers: { 'user-agent': UA } });
      const t = await r.text(); if (t[0] !== '{') continue;
      return JSON.parse(t)?.parse?.wikitext?.['*'] ?? null;
    } catch { /* retry */ }
  }
  return null;
}

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const { data } = await sb.from('officials').select('id, name, district').eq('office_type', 'councilor').order('name');
  let list = (data as { id: string; name: string; district: string }[]);
  if (only) list = list.filter((o) => only.includes(o.name));
  if (process.env.LIMIT) list = list.slice(0, Number(process.env.LIMIT));

  let enriched = 0, added = 0, skippedSafeguard = 0, noWiki = 0;
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const off = list[idx++];
      const county = (off.district.match(/^(.+?[縣市])/) || [])[1] || '';
      const wt = await fetchWiki(off.name);
      if (!wt) { noWiki++; continue; }
      if (/\{\{disambig|消歧義|可以指|可能指/i.test(wt)) { noWiki++; continue; }
      // SAFEGUARD: must be a politician infobox AND confirm this person is that 縣市's 議員
      const isPol = /Infobox[ _]officeholder|政治人物/i.test(wt);
      const confirmsSeat = county && wt.includes(county) && /議員|議會/.test(wt);
      if (!isPol || !confirmsSeat) { skippedSafeguard++; continue; }
      const careers = parseCareers(wt);
      // keep only NON-council professional/other-office roles (council seat is already in election records)
      const extra = careers.filter((c) => !/議員|議會/.test(c.title));
      if (process.env.DRY_RUN) {
        console.log(`${off.name}(${county}): pol=${isPol} seat=${!!confirmsSeat} | extra:`, extra.map((e) => `${e.start}-${e.end ?? '今'} ${e.title}`).join(' / ') || '(無)');
        continue;
      }
      if (!extra.length) continue;
      // dedup vs existing career titles
      const { data: existing } = await sb.from('careers').select('title').eq('official_id', off.id);
      const have = new Set((existing as { title: string }[]).map((e) => e.title));
      const fresh = extra.filter((e) => !have.has(e.title));
      if (!fresh.length) continue;
      const url = 'https://zh.wikipedia.org/wiki/' + encodeURIComponent(off.name);
      const { data: src } = await sb.from('sources').insert({ url, type: 'wiki', title: '維基百科', retrieved_at: '2026-06-23' }).select('id').single();
      for (const c of fresh) await sb.from('careers').insert({ official_id: off.id, title: c.title, organization: '', start_date: c.start || null, end_date: c.end, source_id: src!.id });
      enriched++; added += fresh.length;
      if (enriched % 10 === 0) console.log(`  …enriched ${enriched} (${added} careers)`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`DONE: enriched ${enriched} councilors (+${added} careers); no-wiki/disambig ${noWiki}; safeguard-skip ${skippedSafeguard}; total ${list.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
