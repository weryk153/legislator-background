import { describe, it, expect } from 'vitest';
import { matchManifest, type OfficialLite, type ManifestEntry } from '../lib/photos';

const off = (id: string, name: string, district: string, slug?: string): OfficialLite => ({
  id, slug: slug ?? `c-${name}`, name, district,
});

describe('matchManifest', () => {
  it('exact name match (single candidate, no district needed)', () => {
    const officials = [off('1', '王小明', '臺北市第3選舉區')];
    const manifest: ManifestEntry[] = [{ name: '王小明', img_url: 'http://x/a.jpg' }];
    const r = matchManifest(officials, manifest, '臺北市');
    expect(r.matched).toEqual([{ officialId: '1', slug: 'c-王小明', imgUrl: 'http://x/a.jpg' }]);
    expect(r.skipped).toEqual([]);
  });

  it('matches through normalizeNameChars variant characters (台 vs 臺)', () => {
    const officials = [off('1', '陳臺生', '臺中市第1選舉區')];
    const manifest: ManifestEntry[] = [{ name: '陳台生', img_url: 'http://x/b.jpg' }];
    const r = matchManifest(officials, manifest, '臺中市');
    expect(r.matched).toEqual([{ officialId: '1', slug: 'c-陳臺生', imgUrl: 'http://x/b.jpg' }]);
  });

  it('same-name multiple officials, manifest entry has no district → skip (寧缺勿錯)', () => {
    const officials = [
      off('1', '林小華', '新北市第1選舉區'),
      off('2', '林小華', '新北市第7選舉區'),
    ];
    const manifest: ManifestEntry[] = [{ name: '林小華', img_url: 'http://x/c.jpg' }];
    const r = matchManifest(officials, manifest, '新北市');
    expect(r.matched).toEqual([]);
    expect(r.skipped).toEqual([{ name: '林小華', reason: '同名多人且 manifest 無選區可消歧' }]);
  });

  it('same-name multiple officials, resolved by matching district (leading-zero tolerant)', () => {
    const officials = [
      off('1', '林小華', '新北市第1選舉區'),
      off('2', '林小華', '新北市第7選舉區'),
    ];
    const manifest: ManifestEntry[] = [{ name: '林小華', district: '第07選區', img_url: 'http://x/d.jpg' }];
    const r = matchManifest(officials, manifest, '新北市');
    expect(r.matched).toEqual([{ officialId: '2', slug: 'c-林小華', imgUrl: 'http://x/d.jpg' }]);
    expect(r.skipped).toEqual([]);
  });

  it('same-name multiple officials, manifest district matches more than one (or none) → skip', () => {
    const officials = [
      off('1', '林小華', '新北市第1選舉區'),
      off('2', '林小華', '新北市第7選舉區'),
    ];
    const manifest: ManifestEntry[] = [{ name: '林小華', district: '第9選區', img_url: 'http://x/e.jpg' }];
    const r = matchManifest(officials, manifest, '新北市');
    expect(r.matched).toEqual([]);
    expect(r.skipped).toEqual([{ name: '林小華', reason: '同名多人，選區無法消歧為恰一人' }]);
  });

  it('never cross-county matches — officials outside county are excluded from candidate pool', () => {
    const officials = [
      off('1', '王小明', '臺北市第3選舉區'),
      off('2', '王小明', '新北市第3選舉區'),
    ];
    const manifest: ManifestEntry[] = [{ name: '王小明', img_url: 'http://x/f.jpg' }];
    const r = matchManifest(officials, manifest, '臺北市');
    expect(r.matched).toEqual([{ officialId: '1', slug: 'c-王小明', imgUrl: 'http://x/f.jpg' }]);
    expect(r.skipped).toEqual([]);
  });

  it('manifest entry with no matching official → skipped with reason 查無現任', () => {
    const officials = [off('1', '王小明', '臺北市第3選舉區')];
    const manifest: ManifestEntry[] = [{ name: '不存在的人', img_url: 'http://x/g.jpg' }];
    const r = matchManifest(officials, manifest, '臺北市');
    expect(r.matched).toEqual([]);
    expect(r.skipped).toEqual([{ name: '不存在的人', reason: '查無現任' }]);
  });

  it('officials with no manifest entry are simply absent from both lists (not an error)', () => {
    const officials = [off('1', '王小明', '臺北市第3選舉區'), off('2', '未上榜', '臺北市第5選舉區')];
    const manifest: ManifestEntry[] = [{ name: '王小明', img_url: 'http://x/h.jpg' }];
    const r = matchManifest(officials, manifest, '臺北市');
    expect(r.matched).toEqual([{ officialId: '1', slug: 'c-王小明', imgUrl: 'http://x/h.jpg' }]);
    expect(r.skipped).toEqual([]);
  });
});
