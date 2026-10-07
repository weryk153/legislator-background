import { describe, it, expect } from 'vitest';
import { extractHeadings } from '../scraper/lib/seoHeadings';

describe('extractHeadings', () => {
  it('抽出 title 與所有 h1 的純文字，去標籤、解實體、壓空白', () => {
    const html = `<html><head><title>周倪安｜政治人物背景</title></head><body>
      <h1 class="sr-only">周倪安</h1>
      <h1 data-x="1"><span class="a">2026</span>
        <span>九合一&amp;選舉</span></h1></body></html>`;
    expect(extractHeadings(html)).toEqual({ title: '周倪安｜政治人物背景', h1: ['周倪安', '2026 九合一&選舉'] });
  });
  it('沒有 h1 時回空陣列', () => {
    expect(extractHeadings('<title>x</title><p>y</p>')).toEqual({ title: 'x', h1: [] });
  });
});
