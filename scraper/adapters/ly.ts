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

export const lyAdapter: SourceAdapter = {
  name: 'ly',
  async fetchFor(target: Target): Promise<AdapterResult> {
    try {
      const url = `https://ly.govapi.tw/v2/legislators?${new URLSearchParams({
        屆: '11',
        委員姓名: target.name,
      }).toString()}`;
      const res = await fetchPolite(url);
      const json = await res.json();
      const careers = parseLy(json, url, new Date().toISOString().slice(0, 10));
      return { source: 'ly', ok: true, careers };
    } catch (err) {
      return { source: 'ly', ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
