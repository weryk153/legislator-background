import { fetchPolite } from './fetchPolite';
import type { AdapterResult, CandidateControversy, EvidenceSource, SourceAdapter, SourceType, Target } from './types';

const SECTION_RE = /爭議|爭論|風波|訴訟|醜聞|弊案|貪|詐|案件|遭控|爭端/;

export interface WikiSection { index: string; line: string; }

export function pickControversySections(sections: WikiSection[]): WikiSection[] {
  return (sections ?? []).filter((s) => s.line && SECTION_RE.test(s.line));
}

export function wikitextToSummary(wikitext: string, max = 300): string {
  let t = wikitext ?? '';
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  t = t.replace(/<ref[^>]*\/>/g, '');
  // MediaWiki language-conversion markup: -{准}-, -{zh-tw:臺;zh-cn:台}-, -{R|foo}-
  t = t.replace(/-\{([^{}]*)\}-/g, (_m, body) => {
    const tw = body.match(/zh(?:-(?:tw|hant|hk|mo))?\s*:\s*([^;]*)/);
    if (tw) return tw[1].trim();
    return body.replace(/^[A-Za-z-]+\|/, '').trim(); // drop a leading flag like "R|"
  });
  // Collapse nested templates from the inside out until none remain.
  let prev: string;
  do {
    prev = t;
    t = t.replace(/\{\{[^{}]*\}\}/g, '');
  } while (t !== prev);
  // Drop File/Image/Category links (and their captions) before piped-link unwrap.
  t = t.replace(/\[\[(?:File|Image|檔案|文件|分类|分類|Category):[^\]]*\]\]/gi, '');
  // Unwrap piped/plain wiki links, repeatedly to handle nesting.
  do {
    prev = t;
    t = t.replace(/\[\[(?:[^|\]]*\|)?([^\[\]]+)\]\]/g, '$1');
  } while (t !== prev);
  t = t.replace(/'''?/g, '');
  t = t.replace(/^[=*#:;]+/gm, '');
  t = t.replace(/[=]+\s*$/gm, '');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).trim() + '…' : t;
}

function sourceTypeFor(url: string): SourceType {
  if (/judicial\.gov\.tw/.test(url)) return 'court';
  if (/\.gov\.tw/.test(url)) return 'gov';
  if (/tfc-taiwan|factcheck/.test(url)) return 'factcheck';
  return 'news';
}

export function extractRefUrls(wikitext: string): string[] {
  const urls = new Set<string>();
  const re = /https?:\/\/[^\s\]|}<]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext ?? '')) !== null) {
    if (!/wikipedia\.org|wikimedia\.org/.test(m[0])) urls.add(m[0].replace(/[.,)]+$/, ''));
  }
  return [...urls];
}

export function isLikelyPerson(lead: string, keywords: string[]): boolean {
  const text = lead ?? '';
  return keywords.some((k) => k && text.includes(k));
}

export function buildSources(pageUrl: string, refUrls: string[], retrievedAt: string): EvidenceSource[] {
  const wiki: EvidenceSource = { url: pageUrl, title: '維基百科', type: 'news', retrievedAt };
  const refs: EvidenceSource[] = refUrls.map((u) => ({ url: u, title: '報導/原始出處', type: sourceTypeFor(u), retrievedAt }));
  return [wiki, ...refs];
}

const API = 'https://zh.wikipedia.org/w/api.php';
const pageUrl = (name: string) => `https://zh.wikipedia.org/wiki/${encodeURIComponent(name)}`;

async function apiJson(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ ...params, format: 'json' }).toString();
  const res = await fetchPolite(`${API}?${qs}`);
  return res.json();
}

export async function fetchWikiControversies(target: Target): Promise<CandidateControversy[]> {
  const retrievedAt = new Date().toISOString().slice(0, 10);
  const secResp = await apiJson({ action: 'parse', page: target.name, prop: 'sections' });
  if (secResp.error) return []; // no such article
  const sections: WikiSection[] = secResp.parse?.sections ?? [];

  const leadResp = await apiJson({ action: 'parse', page: target.name, prop: 'wikitext', section: '0' });
  const lead = leadResp.parse?.wikitext?.['*'] ?? '';
  const keywords = [target.party, target.district, '立法委員', '議員', '市長', '縣長'].filter(Boolean);
  if (!isLikelyPerson(lead, keywords)) return [];

  const picked = pickControversySections(sections);
  const out: CandidateControversy[] = [];
  for (const s of picked) {
    const r = await apiJson({ action: 'parse', page: target.name, prop: 'wikitext', section: s.index });
    const wt = r.parse?.wikitext?.['*'] ?? '';
    const summary = wikitextToSummary(wt, 300);
    if (!summary) continue;
    out.push({
      title: s.line,
      summary,
      status: 'other',
      eventDate: '',
      reportDate: '',
      sources: buildSources(pageUrl(target.name), extractRefUrls(wt), retrievedAt),
    });
  }
  return out;
}

export const wikiAdapter: SourceAdapter = {
  name: 'wiki',
  async fetchFor(target: Target): Promise<AdapterResult> {
    try {
      const controversies = await fetchWikiControversies(target);
      return { source: 'wiki', ok: true, controversies };
    } catch (err) {
      return { source: 'wiki', ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
