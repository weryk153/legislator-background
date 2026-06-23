// County-by-county judgment discovery via LawPlayer's anonymous KYC API.
// LawPlayer indexes by 當事人(litigant), not full-text mention — so it returns cases where the
// councilor's NAME is actually a party, cutting the same-name full-text noise that broke the
// official site (李文傑 = 2909). Each case carries the official judgment _id, so we can build the
// 司法院 URL and verify the verdict there. Same-name people still share a name → we tag each case
// by whether the court region matches the councilor's county (disambiguation signal), and the
// verdict + identity are CONFIRMED on the official judgment before anything is recorded.
//
// Usage: COUNTY=嘉義市 npx tsx scraper/lawplayer-sweep.ts
// Output: prints, per councilor, their 刑事 cases where they are a 被告, region-match first.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const API = 'https://api.lawplayer.com/api/v1/kyc/judgment/name/search';
// county core stem used to match court names (嘉義市/嘉義縣 → 嘉義; 臺中市 → 臺中/台中)
const stem = (county: string) => county.replace(/[縣市]$/, '').replace(/^台/, '臺');

async function query(name: string) {
  const body = {
    params: { identityName: name, query: name, dateRange: { startDate: '20000101', endDate: '20260623' },
      judgmentType: ['刑事'], identity: ['litigants'], reasonType: [], courtRegion: [], dateSortType: 'date' },
    pagination: { page: 1, pageSize: 50 },
  };
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: {
        'content-type': 'application/json', accept: 'application/json',
        origin: 'https://lawplayer.com', referer: 'https://lawplayer.com/', 'user-agent': 'Mozilla/5.0',
      }, body: JSON.stringify(body) });
      if (!r.ok) { await sleep(1500); continue; }
      return await r.json();
    } catch { await sleep(1500); }
  }
  return null;
}

async function main() {
  const county = process.env.COUNTY;
  if (!county) { console.error('set COUNTY'); process.exit(1); }
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from('officials').select('id, name, district')
    .eq('office_type', 'councilor').like('district', county + '%').order('name');
  const list = (data as { id: string; name: string; district: string }[]);
  const st = stem(county);
  console.log(`=== ${county}：${list.length} 位議員，LawPlayer 刑事-被告掃描 ===`);
  for (const o of list) {
    const cleanName = o.name.replace(/顏色不分藍綠支持性專區顏色/, ''); // strip campaign-slogan glitch
    const res = await query(cleanName);
    await sleep(700);
    if (!res) { console.log(`${cleanName}: [API失敗]`); continue; }
    const cases = (res.data || []).filter((c: any) =>
      c.judgmentType === '刑事' && (c.litigants || []).some((l: any) => l.name === cleanName && l.side === 'defendant'));
    if (!cases.length) { console.log(`${cleanName}: 乾淨 (刑事被告 0；總${res.pagination?.totalCount ?? 0})`); continue; }
    // region match: court name contains county stem (high-confidence same person)
    const tag = (court: string) => court.includes(st) || (st && court.includes('高等法院') && court.includes(st)) ? '★同區' : '?他區';
    const lines = cases.map((c: any) => {
      const oid = (c._id || '').split('_')[0];
      return `    ${tag(c.court)} ${c.court} ${c.yearAndCaseNo} 〔${c.reason}〕 ${c.dateString} id=${oid}`;
    });
    console.log(`${cleanName}: ⚠ ${cases.length} 刑事被告案`);
    lines.forEach((l: string) => console.log(l));
  }
  console.log('=== done ===');
}
main().catch((e) => { console.error(e); process.exit(1); });
