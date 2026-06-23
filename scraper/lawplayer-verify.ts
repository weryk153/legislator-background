// Discover + auto-verify councilor judgments via LawPlayer's anonymous KYC API (sandbox-reachable).
// Pipeline per councilor: name search (litigant, criminal) -> for each ★same-region defendant case,
// fetch detail (full 判決 text) -> (a) confirm identity by looking for "<county>議員 <name>" in the
// text, (b) parse that defendant's disposition from the 主文. Output structured candidates so a human
// records only identity-confirmed convictions, citing the official 司法院 judgment.
// Rate-limited + low concurrency to stay a polite consumer of a third-party API on public data.
// Usage: COUNTY=嘉義市 npx tsx scraper/lawplayer-verify.ts   (prints JSON lines)
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SEARCH = 'https://api.lawplayer.com/api/v1/kyc/judgment/name/search';
const DETAIL = 'https://api.lawplayer.com/api/v1/kyc/judgment/';
const H = { 'content-type': 'application/json', accept: 'application/json', origin: 'https://lawplayer.com', referer: 'https://lawplayer.com/', 'user-agent': 'Mozilla/5.0' };
const stem = (county: string) => county.replace(/[縣市]$/, '').replace(/^台/, '臺');
// OFFICE-related reasons: judgments name the public office, so identity is confirmable from the text
// (and these are the highest public-interest category). Only these get a full-text detail fetch.
const OFFICE = /貪污|圖利|賄|助理費|詐取財物|選舉罷免法|背信|偽造文書|政治獻金|妨害投票|公務員登載不實|利益衝突|瀆職/;
// OTHER notable crimes: role-silent (identity not confirmable from text) → flag only, no detail fetch
// (avoids wasteful bulk fetches for same-name repeat offenders; these need news/manual cross-check).
const OTHER = /毒品|槍砲|傷害|公共危險|詐欺|妨害性|強制性交|恐嚇|殺人|竊盜|妨害自由|賭博|侵占|洗錢|組織犯罪/;

async function post(url: string, body: any) {
  for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) }); if (r.ok) return await r.json(); } catch {} await sleep(1500); } return null;
}
async function get(url: string) {
  for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { headers: H }); if (r.ok) return await r.json(); } catch {} await sleep(1500); } return null;
}

function dispositionOf(content: string, name: string): string {
  const flat = content.replace(/\s+/g, '');
  const mi = flat.indexOf('主文');
  const region = mi >= 0 ? flat.slice(mi, mi + 8000) : flat.slice(0, 8000);
  // find the name in 主文 and the disposition phrase that follows
  const rx = new RegExp(name + '[^。，]{0,6}(無罪|不受理|免訴|免刑|犯[^。]{0,40}?(處有期徒刑[\\u4e00-\\u9fff\\d]+[年月又]+[\\u4e00-\\u9fff\\d]*|拘役[\\u4e00-\\u9fff\\d]+|科罰金[^。]{0,12})[^。]{0,30}|處有期徒刑[\\u4e00-\\u9fff\\d]+[年月][^。]{0,40}|緩刑[\\u4e00-\\u9fff\\d]+年)');
  const m = region.match(rx);
  return m ? m[0].slice(0, 90) : '(主文未明確對應，需人工讀)';
}

async function main() {
  const county = process.env.COUNTY!;
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from('officials').select('name, district').eq('office_type', 'councilor').like('district', county + '%').order('name');
  const list = (data as { name: string; district: string }[]);
  const st = stem(county);
  for (const o of list) {
    const name = o.name.replace(/顏色不分藍綠支持性專區顏色/, '');
    const res = await post(SEARCH, { params: { identityName: name, query: name, dateRange: { startDate: '20000101', endDate: '20260623' }, judgmentType: ['刑事'], identity: ['litigants'], reasonType: [], courtRegion: [], dateSortType: 'date' }, pagination: { page: 1, pageSize: 50 } });
    await sleep(800);
    if (!res) { console.log(JSON.stringify({ name, status: 'api_fail' })); continue; }
    const cases = (res.data || []).filter((c: any) => c.judgmentType === '刑事' && (c.litigants || []).some((l: any) => l.name === name && l.side === 'defendant'));
    // only fetch detail for same-region + serious cases (limit load + maximise identity-confirmable signal)
    const sameRegion = cases.filter((c: any) => (c.court || '').includes(st));
    const officeCases = sameRegion.filter((c: any) => OFFICE.test(c.reason || ''));
    const otherCases = sameRegion.filter((c: any) => !OFFICE.test(c.reason || '') && OTHER.test(c.reason || ''));
    if (!cases.length) { console.log(JSON.stringify({ name, status: 'clean' })); continue; }
    // flag same-region role-silent crimes WITHOUT detail-fetch (identity not auto-confirmable; needs news/manual)
    for (const c of otherCases) console.log(JSON.stringify({ name, status: 'OTHER_FLAG', reason: c.reason, court: c.court, caseNo: c.yearAndCaseNo, date: c.dateString, id: (c._id || '').split('_')[0] }));
    if (!officeCases.length) { if (!otherCases.length) console.log(JSON.stringify({ name, status: 'cases_other_region_only', total: cases.length })); continue; }
    for (const c of officeCases) {
      const oid = (c._id || '').split('_')[0];
      const detail = await get(DETAIL + encodeURIComponent(c._id));
      await sleep(800);
      const content: string = detail?.content || '';
      const idMatch = new RegExp('(' + st + '[縣市]議員|議員)[^，。]{0,6}' + name + '|' + name + '[^，。]{0,12}(' + st + '[縣市])?議員').test(content);
      console.log(JSON.stringify({ name, status: 'CHECK', reason: c.reason, court: c.court, caseNo: c.yearAndCaseNo, date: c.dateString, id: oid,
        identityConfirmed: idMatch, ruling: detail?.lp_rulingOutcome, sentMonths: detail?.lp_sentenceMonths,
        disposition: content ? dispositionOf(content, name) : '(無全文)' }));
    }
  }
  console.log(JSON.stringify({ done: county }));
}
main().catch((e) => { console.error(e); process.exit(1); });
