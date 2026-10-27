import { describe, expect, it } from 'vitest';
import { sourceLinks } from '../src/lib/sourceLinks';
import type { Source } from '../src/lib/types';

const source = (url: string, title = '報導/原始出處'): Source => ({ id: url, url, title, type: 'news', retrievedAt: '2026-10-27' });

describe('來源連結依網址去重', () => {
  it('同媒體不同文章不因顯示名稱相同而消失', () => {
    expect(sourceLinks([source('https://example.com/a'), source('https://example.com/b')])).toEqual([
      { url: 'https://example.com/a', label: 'example.com' },
      { url: 'https://example.com/b', label: 'example.com' },
    ]);
  });
  it('同網址只保留第一次的標題，官方同名不同資料集均保留', () => {
    expect(sourceLinks([source('https://a', '立法院開放資料'), source('https://a', '另名'), source('https://b', '立法院開放資料')])).toHaveLength(2);
    expect(sourceLinks([source('https://a', '原名'), source('https://a', '另名')])[0].label).toBe('原名');
  });
  it('原始出處排在維基前，輸入順序不被改寫', () => {
    const sources = [source('https://zh.wikipedia.org/wiki/A', '維基百科'), source('https://a'), source('https://b')];
    expect(sourceLinks(sources).map(s => s.url)).toEqual(['https://a', 'https://b', sources[0].url]);
    expect(sources[0].title).toBe('維基百科');
    expect(sourceLinks([])).toEqual([]);
  });
});
