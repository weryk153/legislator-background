import { describe, it, expect } from 'vitest';
import { validateControversy, sourceTypeOf, dedupeKey } from '../lib/controversy-record-lib';

const base = {
  slug: 'mayor-taipei', title: '某爭議', summary: '中性摘要。', status: 'investigating', event_date: '2025-07-07',
  sources: [{ url: 'https://www.cna.com.tw/news/a.aspx', title: '中央社報導' }], approved_by: '使用者 2026-10-05 審核頁核准',
};

describe('validateControversy', () => {
  it('完整欄位通過', () => expect(validateControversy(base)).toEqual({ ok: true }));
  it('status 不在列舉內不通過', () => {
    expect(validateControversy({ ...base, status: 'guilty' }).ok).toBe(false);
  });
  it('沒有來源不通過', () => expect(validateControversy({ ...base, sources: [] }).ok).toBe(false));
  it('只有維基百科來源不通過', () => {
    const r = validateControversy({ ...base, sources: [{ url: 'https://zh.wikipedia.org/wiki/X', title: '維基' }] });
    expect(r.ok).toBe(false);
  });
  it('event_date 接受年或年月', () => {
    expect(validateControversy({ ...base, event_date: '2019' }).ok).toBe(true);
    expect(validateControversy({ ...base, event_date: '2019-03' }).ok).toBe(true);
    expect(validateControversy({ ...base, event_date: '2019/03/01' }).ok).toBe(false);
  });
  it('沒有核准紀錄不通過', () => expect(validateControversy({ ...base, approved_by: '' }).ok).toBe(false));
});

describe('sourceTypeOf', () => {
  it('判決書', () => expect(sourceTypeOf('https://judgment.judicial.gov.tw/FJUD/data.aspx?id=1')).toBe('court'));
  it('事實查核', () => expect(sourceTypeOf('https://tfc-taiwan.org.tw/articles/1')).toBe('factcheck'));
  it('政府網站', () => expect(sourceTypeOf('https://www.cy.gov.tw/News_Content.aspx')).toBe('gov'));
  it('其餘為新聞', () => expect(sourceTypeOf('https://news.pts.org.tw/article/1')).toBe('news'));
});

describe('dedupeKey', () => {
  it('空白與台／臺差異視為同一筆', () => expect(dedupeKey('o', '台北 案')).toBe(dedupeKey('o', '臺北案')));
});
