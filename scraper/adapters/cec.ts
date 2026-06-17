// 中選會（中央選舉委員會）選舉資料庫 — candidate 學經歷 (election history) adapter.
//
// Source confirmed live (Task 10, Step 1, REAL data) by driving the db.cec.gov.tw
// Vue/Nuxt app and capturing its XHR:
//   https://db.cec.gov.tw/query/api/v1/elections/candidates/query?cand_name=<name>&page=1&limit_val=<n>
//   e.g. .../query?cand_name=吳思瑤&page=1&limit_val=8
//
// db.cec.gov.tw is the official 中選會 選舉資料庫 (its footer links the same data to
// 政府資料開放平臺 dataset 13119, provider 中選會). The site is a SPA whose results
// pages load static JSON under /static/elections/data/... and whose candidate search
// hits the /query/api/v1 JSON API above. The official CEC open data + this DB expose
// candidate education only as a *level* (cand_edu: 碩士/大學/...) — they do NOT publish
// free-text 學歷/經歷 prose. The richest per-candidate "學經歷" CEC actually provides is
// the candidate-query response: one row per election the person contested, with the
// election (theme_name), vote date, recommending party, district, and 當選 flag. That
// is an authoritative, dated record of elected-office career history, so we map each
// row to a CandidateCareer. source.type is 'gov' (underlying data is official 中選會
// election data). Response shape:
//   { total_pages, cand_data_list: [ {
//       theme_id, type_id, subject_id, legislator_type_id, data_level,
//       theme_name,        // e.g. "第11屆立法委員選舉 - 區域"
//       vote_date,         // "2024-01-13"
//       cand_id, cand_name, cand_sex, cand_birthyear,
//       party_name,        // "民主進步黨"
//       is_victor,         // "*" = 當選, " " = 未當選
//       is_current,
//       area_data: { current_area: { area_name, ... }, file_location: {...} }
//   } ] }
import { parse } from 'node-html-parser';
import { fetchPolite } from '../lib/fetchPolite';
import type { AdapterResult, CandidateCareer, EvidenceSource, SourceAdapter, Target } from '../lib/types';

const trim = (v: unknown): string => (v == null ? '' : String(v).trim());

// Map a CEC theme_name to the office/body it represents (the "organization").
// theme_name looks like "第11屆立法委員選舉 - 區域" or "103年直轄市市議員選舉 - 區域".
function organizationFor(themeName: string): string {
  const head = themeName.split(/\s*-\s*/)[0] ?? themeName; // drop the "- 區域/不分區政黨" suffix
  return head.replace(/選舉\s*$/u, '').trim() || head.trim();
}

/**
 * Parse a 中選會 candidate-query response into CandidateCareer rows.
 *
 * `input` is normally the JSON text of the /query/api/v1 response. As a defensive
 * fallback (the legacy db.cec.gov.tw surfaces are HTML) we also accept an HTML string
 * containing an embedded JSON payload and recover the candidate list from it.
 */
export function parseCec(input: string, sourceUrl: string, retrievedAt: string, birthYear?: string): CandidateCareer[] {
  const json = parseInput(input);
  const list: any[] = Array.isArray(json?.cand_data_list)
    ? json.cand_data_list
    : Array.isArray(json?.dataList)
      ? json.dataList
      : Array.isArray(json)
        ? json
        : [];

  const source: EvidenceSource = { url: sourceUrl, title: '中選會候選人資料', type: 'gov', retrievedAt };
  const careers: CandidateCareer[] = [];

  for (const row of list) {
    if (!row) continue;
    // Same Chinese name collides across the island; when the target's birth year is
    // known (councilors carry it from the 中選會 roster), keep only matching rows so a
    // different same-named candidate's elections aren't mis-attributed.
    if (birthYear && trim(row.cand_birthyear) !== birthYear) continue;
    const themeName = trim(row.theme_name);
    const organization = organizationFor(themeName);
    if (!organization) continue;

    const won = trim(row.is_victor) === '*';
    const party = trim(row.party_name);
    const district = trim(row?.area_data?.current_area?.area_name);
    const titleParts = [party, won ? '當選' : '參選'].filter(Boolean);
    const title = titleParts.join(' ') || (won ? '當選' : '參選');

    careers.push({
      title,
      organization: district ? `${organization}（${district}）` : organization,
      startDate: trim(row.vote_date),
      endDate: null,
      source,
    });
  }

  return careers.filter((c) => c.organization.length > 0);
}

function parseInput(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    // Not bare JSON — try to recover an embedded JSON payload from an HTML page.
    const root = parse(input);
    for (const tag of ['#__NUXT_DATA__', 'script[type="application/json"]', '#__NEXT_DATA__']) {
      const el = root.querySelector(tag);
      const text = el?.text?.trim();
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          /* keep looking */
        }
      }
    }
    return {};
  }
}

export const cecAdapter: SourceAdapter = {
  name: 'cec',
  async fetchFor(target: Target): Promise<AdapterResult> {
    try {
      const url = `https://db.cec.gov.tw/query/api/v1/elections/candidates/query?${new URLSearchParams({
        cand_name: target.name,
        page: '1',
        limit_val: '20',
      }).toString()}`;
      const res = await fetchPolite(url);
      const text = await res.text();
      const careers = parseCec(text, url, new Date().toISOString().slice(0, 10), target.birthYear);
      return { source: 'cec', ok: true, careers };
    } catch (err) {
      return { source: 'cec', ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
