import { describe, expect, it } from 'vitest';
import { pageShareUrl } from '../src/lib/share';
import { marginSharePath, readMarginLocation } from '../src/lib/electionMargin';
import { loadMarginData } from '../src/lib/electionMarginData';
import { loadShareCards, personCardId, shareCardPath } from '../src/lib/shareCardData';
import { shareCardSvg, wrapCardText } from '../src/lib/renderShareCard';
import { portraitCardSvg } from '../src/lib/renderPortraitCard';

describe('分享網址', () => {
  it('保留候選人篩選、丟掉追蹤參數，分享正式網域', () => {
    expect(pageShareUrl('https://example.test/elections/', 'http://localhost:4321/elections/?county=taipei&office=council&q=陳&utm_source=test#finder-title'))
      .toBe('https://example.test/elections/?county=taipei&office=council&q=%E9%99%B3#finder-title');
  });
  it('不把其他頁面狀態或未知參數混進固定頁面', () => {
    expect(pageShareUrl('https://example.test/officials/a/', 'https://example.test/officials/a/?token=secret#education'))
      .toBe('https://example.test/officials/a/');
    expect(pageShareUrl('https://example.test/elections/', 'https://example.test/?county=taipei'))
      .toBe('https://example.test/elections/');
  });
  it('縣市頁頂部分享保留卡片人選與查詢，縣市沿用頁面並丟棄追蹤參數', () => {
    const canonical = 'https://example.test/elections/2026/new-taipei/';
    const shared = pageShareUrl(canonical, 'http://localhost:4324/elections/2026/new-taipei/?county=taipei&left=a&right=b&q=教育&utm_source=x');
    expect(shared).toBe(`${canonical}?county=new-taipei&left=a&right=b&q=%E6%95%99%E8%82%B2#policy-comparison`);
    expect(pageShareUrl(canonical, 'http://localhost:4324/elections/2026/new-taipei/?left=a')).toBe(`${canonical}?county=new-taipei&left=a#chief-title`);
    expect(pageShareUrl(canonical, 'http://localhost:4324/elections/2026/new-taipei/')).toBe(canonical);
  });
  it('每個有效鄉鎮票差分享連結都能還原，無效鄉鎮不冒充縣市結果', () => {
    const data = loadMarginData();
    for (const county of data.counties) {
      for (const town of ['', ...county.towns.map(t => t.code)]) {
        const url = new URL(marginSharePath(county.code, town), 'https://example.test');
        expect(readMarginLocation(url, data)).toEqual({ county: county.code, town });
      }
      expect(readMarginLocation(new URL(marginSharePath(county.code, 'unknown'), 'https://example.test'), data)).toBeNull();
    }
  });
});

describe('分享圖卡資料', () => {
  it('直式卡保留財產年份、筆數單位與獻金選舉，不把申報摘錄當總資產', async () => {
    const person = [...(await loadShareCards()).values()].find(c => c.heading === '簡舒培')!;
    expect(person.assets?.year).toBe(2026);
    expect(person.assets?.values).toContainEqual({ label: '土地（筆）', value: '9' });
    expect(person.assets?.values).toContainEqual({ label: '存款（元）', value: '1,213,767' });
    expect(person.donations).toMatchObject({ election: '111年臺北市議員選舉', report: '首次申報', income: 9699459, expense: 7430333 });
    const svg = portraitCardSvg(person);
    expect(svg).toContain('2022年臺北市議員選舉');
    expect(svg).toContain('非總資產');
    expect(svg).not.toContain('查資料，再做選擇');
    expect(svg).not.toContain('公開資料・逐筆附出處');
    expect(svg).not.toContain('個當選年份');
  });
  it('未收錄申報資料不畫零元，較少資料的圖卡縮短且不補標語', () => {
    const svg = portraitCardSvg({
      id: 'sparse', kind: 'person', heading: '測試', subtitle: '人物資料', detail: '',
      date: '2026-10-20', note: '', url: 'https://example.test/person/',
      education: [{ text: '某校肄業', source: '公報', year: 2022 }],
    });
    expect(svg).toContain('某校肄業');
    expect(svg).not.toContain('財產申報');
    expect(svg).not.toContain('收入總額');
    expect(Number(svg.match(/height="(\d+)"/)?.[1])).toBeLessThan(1080);
  });
  it('全部人物與選區都有圖卡，不含同名碰撞或部署日期冒充資料日期', async () => {
    const cards = await loadShareCards();
    expect([...cards.values()].filter(c => c.kind === 'person')).toHaveLength(1894);
    expect([...cards.values()].filter(c => c.kind === 'district')).toHaveLength(221);
    expect(cards.size).toBe(2115);
    for (const card of cards.values()) {
      expect(card.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(shareCardPath(card.id)).toMatch(/^\/og\/cards\/[\da-z-]+\.png$/);
      expect(shareCardSvg(card)).toContain('width="1200" height="630"');
    }
    expect(personCardId('same-name-district-1')).not.toBe(personCardId('same-name-district-2'));
  });
  it('長姓名折行後完整保留，原住民拼音及 XML 特殊符號安全呈現', () => {
    const heading = '黃宏成台灣阿成世界偉人財神總統';
    expect(wrapCardText(heading, 12).join('')).toBe(heading);
    const svg = shareCardSvg({ id: 'x', kind: 'person', heading: 'A&B <Test>', subtitle: 'Kolas Yotaka 谷辣斯・尤達卡', detail: '', note: '', date: '2026-10-16' });
    expect(svg).toContain('A&amp;B &lt;Test&gt;');
    expect(svg).not.toContain('<Test>');
  });
  it('人物摘要保留學歷來源與年份，連任紀錄不排擠其他經歷', async () => {
    const cards = [...(await loadShareCards()).values()];
    const person = cards.find(c => c.heading === '簡舒培')!;
    expect(person.education?.[0]).toMatchObject({ text: '台灣大學政治研究所碩士' });
    expect(person.education?.[0].source).toBeTruthy();
    expect(person.careers?.[0].text).toContain('2022 年當選');
    expect(person.careers?.[1].text).toContain('女性權益促進會秘書長');
    expect(new URL(person.url!).pathname).toContain('/officials/');
    const historical = cards.find(c => c.education?.some(e => e.year === 2022))!;
    expect(shareCardSvg(historical)).toContain('2022 年資料');
  });
  it('學歷過長時不截斷資格限定語，也不把未收錄寫成沒有學歷', () => {
    const svg = shareCardSvg({
      id: 'long-education', kind: 'person', heading: '測試', subtitle: '人物資料',
      detail: '', date: '2026-10-20', note: '已非現任', url: 'https://example.test/person/',
      education: [{ text: `${'學校及科系'.repeat(30)}肄業`, source: '歷年公報', year: 2022 }],
      careers: [],
    });
    expect(svg).toContain('記載較長，請掃碼查看完整內容');
    expect(svg).toContain('本站尚未收錄可核對資料');
    expect(svg).toContain('已非現任；');
    expect(svg).not.toContain('沒有學歷');
  });
});
