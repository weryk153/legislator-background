import { describe, expect, it } from 'vitest';
import { readFinderLocation, finderLocationHref } from '../src/lib/electionFinderLocation';
import { profileReturn } from '../src/lib/profileReturn';

const origin = 'https://example.test';
const county = '63-000-00-000-0000';
const blank = { county: '', office: '', districtKey: '', query: '', limit: 24 };

describe('候選人查詢網址', () => {
  it('重新開啟網址可還原縣市、職務、選區、姓名與已展開數量', () => {
    const state = { county, office: 'council', districtKey: JSON.stringify([county, 'council', '第1選舉區']), query: '陳', limit: 76 };
    const href = finderLocationHref(new URL('/elections/?source=share#finder-title', origin), state);
    const url = new URL(href, origin);
    expect(readFinderLocation(url)).toEqual(state);
    expect(url.searchParams.get('county')).toBe('taipei');
    expect(url.searchParams.get('source')).toBe('share');
    expect(url.hash).toBe('#finder-title');
  });
  it('重設只清除查詢條件，不移除頁內錨點及其他參數', () => {
    const url = new URL('/elections/?county=taipei&office=chief&district=old&q=陳&shown=48&source=share#election-map', origin);
    expect(finderLocationHref(url, blank)).toBe('/elections/?source=share#election-map');
  });
  it('忽略無效縣市、職務、選區與超大展開數', () => {
    expect(readFinderLocation(new URL('/elections/?county=unknown&office=mayor&district=bad&shown=999999999', origin))).toEqual(blank);
  });
  it('跨縣市或不符合職務的選區不套用', () => {
    for (const key of [JSON.stringify(['other', 'chief', '首長']), JSON.stringify([county, 'council', '第1選舉區'])]) {
      const url = new URL('/elections/?county=taipei&office=chief', origin);
      url.searchParams.set('district', key);
      expect(readFinderLocation(url).districtKey).toBe('');
    }
  });
});

describe('個人頁返回路徑', () => {
  it('回到原候選人篩選與查詢區塊', () => {
    expect(profileReturn(`${origin}/elections/?county=taipei&q=沈`, origin)).toEqual({
      href: '/elections/?county=taipei&q=%E6%B2%88#finder-title', label: '← 返回候選人清單',
    });
  });
  it('保留縣市、獻金及關係查詢的原入口', () => {
    expect(profileReturn(`${origin}/elections/2026/taipei/`, origin)?.label).toBe('← 返回縣市名單');
    expect(profileReturn(`${origin}/donors/`, origin)?.label).toBe('← 返回政治獻金查詢');
    expect(profileReturn(`${origin}/graph/connect/?from=a&to=b`, origin)?.href).toBe('/graph/connect/?from=a&to=b');
  });
  it('沒有來源、站外來源或另一個人頁時使用頁面預設入口', () => {
    for (const referrer of ['', 'invalid', 'https://other.test/elections/', `${origin}/officials/someone/`]) {
      expect(profileReturn(referrer, origin)).toBeNull();
    }
  });
});
