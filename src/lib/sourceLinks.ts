import type { Source } from './types';

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

/** Preserve distinct original links, including articles with the same label. */
export function sourceLinks(sources: Source[]) {
  const isWiki = (url: string) => /wikipedia\.org/.test(url || '');
  const seen = new Set<string>();
  return [...sources]
    .sort((a, b) => Number(isWiki(a.url)) - Number(isWiki(b.url)))
    .filter(source => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    })
    .map(source => ({
      url: source.url,
      label: source.title && source.title !== '報導/原始出處' ? source.title : hostname(source.url),
    }));
}
