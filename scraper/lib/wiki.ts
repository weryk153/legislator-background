import type { CandidateControversy, EvidenceSource, SourceType } from './types';

const SECTION_RE = /爭議|爭論|事件|風波|訴訟|醜聞|弊|案$|案件/;

export interface WikiSection { index: string; line: string; }

export function pickControversySections(sections: WikiSection[]): WikiSection[] {
  return (sections ?? []).filter((s) => s.line && SECTION_RE.test(s.line));
}

export function wikitextToSummary(wikitext: string, max = 300): string {
  let t = wikitext ?? '';
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  t = t.replace(/<ref[^>]*\/>/g, '');
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
