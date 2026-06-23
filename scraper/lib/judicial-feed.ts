// 司法院「裁判書開放資料」API feed — the LEGAL, no-CAPTCHA path to judgments.
//
// Unlike the search site (CAPTCHA-gated, unreachable from sandboxes), the open-data API is
// a daily CHANGE FEED: JList returns the jids that changed on the day 7 days ago; JDoc
// returns one judgment's full text. There is NO name search — so to find our officials we
// must fetch each changed judgment and match names in its text. The API only serves
// 00:00–06:00 Taipei. Auth needs JUDICIAL_API_USER / JUDICIAL_API_PASSWORD.
//
// LEGAL SENSITIVITY: judgments are ALWAYS review-only. This feed produces CANDIDATES with
// an identity-confidence score; a human confirms before anything is published. The noise
// gate here is strict — a target only matches when their exact name appears among the
// judgment's 被告/上訴人/聲請人 (not as a judge, lawyer, or passing mention).
import type { CandidateJudgment, Target } from './types';
import { parseJudgment } from '../adapters/judgments';
import { scoreMatch } from '../match/score';

const BASE = 'https://data.judicial.gov.tw/jdg/api';
const UA = 'legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)';

async function postJson(path: string, body: unknown, retries = 4): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    try {
      const res = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': UA },
        body: JSON.stringify(body),
        // 司法院 API connectivity from cloud runners is flaky; allow a generous window.
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Returns a token, or throws with the API's message (e.g. "目前非本 API 服務時間。").
// The Auth response returns the token as `Token` (capitalised); request params are lowercase.
export async function authJudicial(user: string, password: string): Promise<string> {
  const j = await postJson('Auth', { user, password });
  const token = j?.Token ?? j?.token;
  if (token) return token as string;
  throw new Error(j?.error ? String(j.error) : 'auth failed: no token returned');
}

// JList returns the change list (one or more days). Flatten to a unique jid array.
// Tolerates the documented shapes: [{DATE,LIST:[...]}] or {LIST:[...]} or a bare array.
export function flattenJList(j: any): string[] {
  const days: any[] = Array.isArray(j) ? j : Array.isArray(j?.LIST) ? [{ LIST: j.LIST }] : Array.isArray(j?.DATA) ? j.DATA : [];
  const ids: string[] = [];
  for (const d of days) {
    if (typeof d === 'string') { if (d.trim()) ids.push(d.trim()); continue; }
    // Real JList shape uses lowercase `list` (per day); tolerate the uppercase variants too.
    const list = Array.isArray(d?.list) ? d.list : Array.isArray(d?.LIST) ? d.LIST : Array.isArray(d) ? d : [];
    for (const id of list) if (typeof id === 'string' && id.trim()) ids.push(id.trim());
  }
  return [...new Set(ids)];
}

export async function fetchJList(token: string): Promise<string[]> {
  return flattenJList(await postJson('JList', { token }));
}

export interface JDoc {
  jid: string; year: string; jcase: string; no: string; date: string; title: string; text: string;
}

// Returns the parsed JDoc, or null if the API says the judgment was removed / not public.
export async function fetchJDoc(token: string, jid: string): Promise<JDoc | null> {
  const j = await postJson('JDoc', { token, j: jid });
  if (!j || j.error) return null;
  // JDoc fields are uppercase per spec; tolerate lowercase defensively.
  return {
    jid: j.JID ?? j.jid ?? jid,
    year: j.JYEAR ?? j.jyear ?? '',
    jcase: j.JCASE ?? j.jcase ?? '',
    no: j.JNO ?? j.jno ?? '',
    date: j.JDATE ?? j.jdate ?? '',
    title: j.JTITLE ?? j.jtitle ?? '',
    text: j.JFULLX?.JFULLCONTENT ?? j.jfullx?.jfullcontent ?? j.JFULLCONTENT ?? '',
  };
}

// 20130517 → 2013-05-17
function fmtDate(d: string): string {
  const m = String(d ?? '').match(/^(\d{4})(\d{2})(\d{2})$/u);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

// Best-effort citable public URL for the judgment (the search site's detail page by jid).
export function judgmentUrl(jid: string): string {
  return `https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=${encodeURIComponent(jid)}`;
}

// Build a CandidateJudgment from a JDoc: reuse parseJudgment on the full text (court /
// 被告 / 主文 / 確定 extraction), then override with the reliable structured JDoc fields.
export function judgmentFromJDoc(doc: JDoc, retrievedAt: string): CandidateJudgment {
  const url = judgmentUrl(doc.jid);
  const base = parseJudgment(doc.text, url, retrievedAt);
  const caseNumber = doc.year && doc.jcase && doc.no
    ? `${doc.year}年度${doc.jcase}字第${doc.no}號`
    : base.caseNumber;
  return {
    ...base,
    caseReason: doc.title || base.caseReason,
    caseNumber,
    judgmentDate: fmtDate(doc.date) || base.judgmentDate,
    source: { ...base.source, title: caseNumber || base.source.title },
  };
}

// Open-data full text renders party labels with padding ("被　　告") and wraps names across
// lines, so collapse whitespace first, then treat a fixed window after each defendant-type
// label as the "defendant zone". A target matches only when their name falls in such a zone
// (i.e. they are a 被告/上訴人/…, not a judge, lawyer, or passing mention).
const DEFENDANT_LABEL = /(被告|被上訴人|上訴人|聲請人|抗告人|自訴人|再審原告)/gu;
// A defendant block ends at the next role/section label, so the zone stops there (a fixed
// window would bleed into 選任辯護人 / 主文 and falsely match a lawyer).
const ZONE_END = /(選任辯護人|辯護人|代理人|複代理人|公訴人|參與人|主文|事實|理由|犯罪事實|上列|右列)/u;
export function defendantZones(text: string): string[] {
  const compact = text.replace(/\s+/gu, '');
  const zones: string[] = [];
  for (const m of compact.matchAll(DEFENDANT_LABEL)) {
    let zone = compact.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 60);
    const end = zone.search(ZONE_END);
    if (end >= 0) zone = zone.slice(0, end);
    zones.push(zone);
  }
  return zones;
}

// Match a judgment against the roster. Gate: the target's name must fall in a defendant zone;
// then score for confidence. Returns matches above the threshold (still review-only).
export function matchJudgment(
  j: CandidateJudgment,
  text: string,
  targets: Target[],
  // The defendant-zone gate is already strict, and a defendant name-exact match scores 0.4
  // (keywords rarely appear verbatim in a judgment). Accept 0.4 — every match is review-only
  // and a human confirms identity, so we surface same-name defendants rather than drop them.
  minConfidence = 0.4,
): Array<{ target: Target; judgment: CandidateJudgment }> {
  const zones = defendantZones(text);
  const out: Array<{ target: Target; judgment: CandidateJudgment }> = [];
  for (const t of targets) {
    if (!zones.some((z) => z.includes(t.name))) continue;
    const match = scoreMatch({ candidateName: t.name, text }, { name: t.name, keywords: t.keywords, aliases: t.aliases });
    if (match.confidence >= minConfidence) {
      out.push({ target: t, judgment: { ...j, defendantNames: [t.name], match } });
    }
  }
  return out;
}
