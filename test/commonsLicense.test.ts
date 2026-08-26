import { describe, it, expect } from 'vitest';
import { pickLicense, stripHtml } from '../scraper/lib/commonsLicense';

describe('stripHtml', () => {
  it('去標籤、合併空白', () => {
    expect(stripHtml('<a href="//commons.wikimedia.org/wiki/User:Foo">Foo</a>  Bar')).toBe('Foo Bar');
  });
  it('解 HTML 實體', () => {
    expect(stripHtml('A &amp; B &quot;C&quot;')).toBe('A & B "C"');
  });
  it('去零寬字元（維基模板常在機關名前留下 U+200B）', () => {
    expect(stripHtml('\u200B苗栗縣政府行政處新聞科')).toBe('苗栗縣政府行政處新聞科');
  });
  it('先解 HTML 實體再去標籤：雙重轉譯的標籤不會以純文字留下', () => {
    expect(stripHtml('&amp;lt;b&amp;gt;A&amp;lt;/b&amp;gt;')).toBe('A');
  });
});

describe('pickLicense', () => {
  it('CC BY-SA → ok，作者去 HTML', () => {
    const v = pickLicense({ LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">王小明</a>' } });
    expect(v).toEqual({ ok: true, license: 'CC BY-SA 4.0', author: '王小明' });
  });
  it('Public domain / CC0 → ok', () => {
    expect(pickLicense({ LicenseShortName: { value: 'Public domain' }, Artist: { value: 'A' } })).toMatchObject({ ok: true });
    expect(pickLicense({ LicenseShortName: { value: 'CC0' }, Artist: { value: 'A' } })).toMatchObject({ ok: true });
  });
  it('無 Artist 時退回 Credit，再退回「不詳」', () => {
    expect(pickLicense({ LicenseShortName: { value: 'CC BY 4.0' }, Credit: { value: '總統府' } })).toMatchObject({ author: '總統府' });
    expect(pickLicense({ LicenseShortName: { value: 'CC BY 4.0' } })).toMatchObject({ author: '不詳' });
  });
  it('Attribution（台灣政府資料開放授權的官方肖像）→ ok', () => {
    expect(pickLicense({ LicenseShortName: { value: 'Attribution' }, Artist: { value: '外交部' } })).toEqual({ ok: true, license: 'Attribution', author: '外交部' });
  });
  it('fair use / 無授權資訊 → 不收', () => {
    expect(pickLicense({ LicenseShortName: { value: 'Fair use' } })).toEqual({ ok: false, reason: '授權不符：Fair use' });
    expect(pickLicense({})).toEqual({ ok: false, reason: '無授權資訊' });
    expect(pickLicense(undefined)).toEqual({ ok: false, reason: '無授權資訊' });
  });
  it('Attribution 3.0 / Attribution-ShareAlike → ok（曾被舊 Attribution$ 錨點誤拒）', () => {
    expect(pickLicense({ LicenseShortName: { value: 'Attribution 3.0' }, Artist: { value: 'A' } })).toMatchObject({ ok: true });
    expect(pickLicense({ LicenseShortName: { value: 'Attribution-ShareAlike' }, Artist: { value: 'A' } })).toMatchObject({ ok: true });
  });
  it('NC／ND 變體一律不收（非自由授權，本站會縮圖並公開發布）', () => {
    expect(pickLicense({ LicenseShortName: { value: 'CC BY-NC-ND 4.0' } })).toEqual({ ok: false, reason: '授權不符：CC BY-NC-ND 4.0' });
    expect(pickLicense({ LicenseShortName: { value: 'CC BY-NC-SA 3.0' } })).toEqual({ ok: false, reason: '授權不符：CC BY-NC-SA 3.0' });
    expect(pickLicense({ LicenseShortName: { value: 'CC BY-ND 2.0' } })).toEqual({ ok: false, reason: '授權不符：CC BY-ND 2.0' });
  });
  it('格式不符的授權字串 → 不收', () => {
    expect(pickLicense({ LicenseShortName: { value: 'PDQ nonsense' } })).toEqual({ ok: false, reason: '授權不符：PDQ nonsense' });
  });
});
