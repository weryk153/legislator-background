import { describe, expect, it } from 'vitest';
import { loadDistrictPages, candidateDistrictPaths } from '../src/lib/districtPageData';
import { districtPagePath, districtAreaSummary, districtPageDescription } from '../src/lib/districtPage';
import { profileReturn } from '../src/lib/profileReturn';

describe('議員選區頁', () => {
  const pages = loadDistrictPages();
  it('每個名冊選區都有唯一穩定網址，候選人不漏列或跨區', () => {
    expect(pages).toHaveLength(221);
    expect(new Set(pages.map(p => p.path)).size).toBe(pages.length);
    expect(pages.reduce((n, p) => n + p.district.candidates.length, 0)).toBe(1493);
    for (const p of pages) {
      for (const candidate of p.district.candidates) {
        if (candidate.slug) expect(candidateDistrictPaths().get(candidate.slug)).toBe(p.path);
      }
    }
  });
  it('只有附 2026 公告的範圍才稱為公告範圍', () => {
    for (const p of pages) {
      const text = districtAreaSummary(p.area);
      if (text.startsWith('公告範圍')) {
        expect(p.area.source?.pdfUrl).toMatch(/^https:/);
        expect(p.area.scope).toBeTruthy();
      } else if (p.area.towns.length) {
        expect(text).toContain('2022 對照');
        expect(districtPageDescription(p.county.name, p.district, p.area)).not.toContain('公告範圍');
      }
    }
  });
  it('原住民選區保留正式名稱與編號，不沿用區域鄉鎮對照', () => {
    const indigenous = pages.filter(p => /Indigenous/.test(p.district.type));
    expect(indigenous.length).toBeGreaterThan(0);
    for (const p of indigenous) {
      expect(p.area.towns).toEqual([]);
      expect(p.district.label).toContain('原住民');
      expect(p.path).toContain(`/district-${p.district.no}/`);
    }
  });
  it('拒絕非法編號及可逃離路徑的縣市 key', () => {
    for (const no of [0, -1, 1.1, NaN]) expect(() => districtPagePath('taipei', no)).toThrow();
    expect(() => districtPagePath('../', 1)).toThrow();
  });
  it('從人物頁返回原選區，不退回全國名單', () => {
    expect(profileReturn('https://example.test/elections/2026/taipei/district-6/', 'https://example.test')).toEqual({
      href: '/elections/2026/taipei/district-6/', label: '← 返回選區名單',
    });
  });
});
