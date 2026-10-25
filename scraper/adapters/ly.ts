// 立法院開放資料 — legislator profile / committee / 經歷 (career history).
//
// Endpoint confirmed in Task 9, Step 1 (REAL data):
//   https://ly.govapi.tw/v2/legislators?屆=<term>&委員姓名=<name>
//   e.g. https://ly.govapi.tw/v2/legislators?屆=11&委員姓名=王世堅
//
// ly.govapi.tw is the g0v / 公民科技 community JSON mirror of the 立法院 open-data
// portal (data.ly.gov.tw). The official portal at data.ly.gov.tw exposes the same
// datasets but requires interactive dataset selection and serves HTML for guessed
// REST/OData paths, so the JSON mirror is what we fetch. Response shape:
//   { legislators: [ {
//       屆, 委員姓名, 黨籍, 選區名稱, 到職日,
//       委員會: ["第11屆第1會期：財政委員會", ...],   // committee assignments
//       經歷:   ["第6屆立法委員", "第8屆台北市議員", ...], // prior career rows
//       學歷:   ["文化大學應用化學研究所碩士", ...],      // education
//       是否離職, 離職日期, ...
//   } ] }
import { fetchPolite } from '../lib/fetchPolite';
import { get } from 'node:https';
import { constants } from 'node:crypto';
import type { AdapterResult, CandidateCareer, EvidenceSource, SourceAdapter, Target } from '../lib/types';

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v == null || v === '') return [];
  return [String(v).trim()].filter(Boolean);
}

export function parseLy(json: any, sourceUrl: string, retrievedAt: string): CandidateCareer[] {
  // Tolerate both the live envelope and a bare legislators array / single object.
  const legislators: any[] = json?.legislators
    ?? json?.jsonList
    ?? json?.dataList
    ?? (Array.isArray(json) ? json : json ? [json] : []);

  const source: EvidenceSource = { url: sourceUrl, title: '立法院開放資料', type: 'gov', retrievedAt };
  const careers: CandidateCareer[] = [];

  for (const leg of legislators) {
    if (!leg) continue;
    const term = leg.屆 != null ? String(leg.屆) : '';
    const startedAt = String(leg.到職日 ?? '').trim();
    const leftAt = String(leg.離職日期 ?? '').trim() || null;

    // Current office: serving legislator for this term.
    if (leg.委員姓名) {
      careers.push({
        title: '立法委員',
        organization: term ? `立法院（第${term}屆）` : '立法院',
        startDate: startedAt,
        endDate: leftAt,
        source,
      });
    }

    // Committee assignments — each "第11屆第N會期：XX委員會" becomes a row.
    for (const c of arr(leg.委員會)) {
      const [period, committee] = c.includes('：') ? c.split('：') : ['', c];
      careers.push({
        title: '委員',
        organization: committee || c,
        startDate: period || (term ? `第${term}屆` : ''),
        endDate: null,
        source,
      });
    }

    // Prior career rows (經歷) — free-text strings, no reliable dates.
    for (const e of arr(leg.經歷)) {
      careers.push({ title: e, organization: e, startDate: '', endDate: null, source });
    }
  }

  return careers.filter((c) => c.organization.length > 0);
}

// The community mirror now rate-limits anonymous bulk requests. The official
// dataset documents this whole-term JSON endpoint; fetch it once per process.
const OFFICIAL_URL = 'https://data.ly.gov.tw/odw/ID16Action.action?term=11&fileType=json';
let officialRows: Promise<any[]> | undefined;
async function loadOfficialRows(): Promise<any[]> {
  officialRows ??= (async () => {
    let json: any;
    try {
      const res = await fetchPolite(OFFICIAL_URL, { retries: 0 });
      json = await res.json();
    } catch (error: any) {
      if (error?.cause?.code !== 'ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED') throw error;
      // This public government endpoint lacks RFC 5746 support. Scope compatibility
      // to this fixed URL; certificate/hostname verification stays enabled. Never
      // change global TLS settings or use this transport for credentials.
      json = await new Promise((resolve, reject) => {
        const req = get(OFFICIAL_URL, { secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT, signal: AbortSignal.timeout(30000) }, res => {
          if (res.statusCode !== 200) { res.resume(); reject(new Error(`LY official dataset HTTP ${res.statusCode}`)); return; }
          let body = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            body += chunk;
            if (body.length > 10_000_000) req.destroy(new Error('LY response too large'));
          });
          res.on('error', reject);
          res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('LY official dataset: invalid JSON')); } });
        });
        req.on('error', reject);
      });
    }
    if (!Array.isArray(json?.dataList) || !json.dataList.length) throw new Error('LY official dataset: unexpected/empty response');
    return json.dataList;
  })();
  try { return await officialRows; }
  catch (error) { officialRows = undefined; throw error; }
}

export function parseOfficialLy(rows: any[], name: string, retrievedAt: string): CandidateCareer[] {
  const split = (s: unknown) => String(s ?? '').split(/[;；]/u).map(s => s.trim()).filter(Boolean);
  const date = (s: unknown) => String(s ?? '').trim().replaceAll('/', '-');
  const people = rows.filter(r => r.name === name && String(r.term) === '11').map(r => ({
    屆: r.term, 委員姓名: r.name, 到職日: date(r.onboardDate), 離職日期: date(r.leaveDate),
    委員會: split(r.committee), 經歷: split(r.experience),
  }));
  return parseLy({ legislators: people }, OFFICIAL_URL, retrievedAt);
}

export const lyAdapter: SourceAdapter = {
  name: 'ly',
  async fetchFor(target: Target): Promise<AdapterResult> {
    try {
      const careers = parseOfficialLy(await loadOfficialRows(), target.name, new Date().toISOString().slice(0, 10));
      return { source: 'ly', ok: true, careers };
    } catch (err) {
      return { source: 'ly', ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
