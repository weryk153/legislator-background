import { describe, it, expect } from 'vitest';
import { matchManifest, type OfficialLite, type ManifestEntry } from '../lib/photos';

const off = (id: string, name: string, district: string, slug?: string, isIncumbent = true): OfficialLite => ({
  id, slug: slug ?? `c-${name}`, name, district, isIncumbent,
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

  describe('Chinese-prefix fallback (原民籍羅馬拼音尾綴)', () => {
    it('official name carries romanization suffix with no space (石慶龍Rungquan．Lhkatafatu), manifest plain', () => {
      const officials = [off('1', '石慶龍Rungquan．Lhkatafatu', '南投縣第06選舉區')];
      const manifest: ManifestEntry[] = [{ name: '石慶龍', district: '第六選區', img_url: 'http://x/i.jpg' }];
      const r = matchManifest(officials, manifest, '南投縣');
      expect(r.matched).toEqual([{ officialId: '1', slug: 'c-石慶龍Rungquan．Lhkatafatu', imgUrl: 'http://x/i.jpg' }]);
      expect(r.skipped).toEqual([]);
    });

    it('official name carries romanization suffix after a space (林秉君 kaying．kuying．kalang), manifest plain', () => {
      const officials = [off('1', '林秉君 kaying．kuying．kalang', '新竹縣第11選舉區')];
      const manifest: ManifestEntry[] = [{ name: '林秉君', district: '平地原住民', img_url: 'http://x/j.jpg' }];
      const r = matchManifest(officials, manifest, '新竹縣');
      expect(r.matched).toEqual([
        { officialId: '1', slug: 'c-林秉君 kaying．kuying．kalang', imgUrl: 'http://x/j.jpg' },
      ]);
      expect(r.skipped).toEqual([]);
    });

    it('official plain, manifest carries parenthesized romanization (林秉君(AliWalis))', () => {
      const officials = [off('1', '林秉君', '南投縣第08選舉區')];
      const manifest: ManifestEntry[] = [{ name: '林秉君(AliWalis)', img_url: 'http://x/k.jpg' }];
      const r = matchManifest(officials, manifest, '南投縣');
      expect(r.matched).toEqual([{ officialId: '1', slug: 'c-林秉君', imgUrl: 'http://x/k.jpg' }]);
      expect(r.skipped).toEqual([]);
    });

    it('both sides carry romanization suffix (孫湯玉惠 aly saku)', () => {
      const officials = [off('1', '孫湯玉惠 aly saku', '宜蘭縣第11選舉區')];
      const manifest: ManifestEntry[] = [{ name: '孫湯玉惠', district: '第11選區(山地原住民)', img_url: 'http://x/l.jpg' }];
      const r = matchManifest(officials, manifest, '宜蘭縣');
      expect(r.matched).toEqual([{ officialId: '1', slug: 'c-孫湯玉惠 aly saku', imgUrl: 'http://x/l.jpg' }]);
      expect(r.skipped).toEqual([]);
    });

    it('exact match still takes priority over prefix fallback when both would apply', () => {
      const officials = [off('1', '陳大文', '南投縣第01選舉區')];
      const manifest: ManifestEntry[] = [{ name: '陳大文', img_url: 'http://x/m.jpg' }];
      const r = matchManifest(officials, manifest, '南投縣');
      expect(r.matched).toEqual([{ officialId: '1', slug: 'c-陳大文', imgUrl: 'http://x/m.jpg' }]);
    });

    it('ambiguity guard: two officials share the same Chinese prefix in county → skip (寧缺勿錯)', () => {
      const officials = [
        off('1', '陳小美Away', '花蓮縣第05選舉區'),
        off('2', '陳小美Bway', '花蓮縣第06選舉區'),
      ];
      const manifest: ManifestEntry[] = [{ name: '陳小美', img_url: 'http://x/n.jpg' }];
      const r = matchManifest(officials, manifest, '花蓮縣');
      expect(r.matched).toEqual([]);
      expect(r.skipped).toEqual([{ name: '陳小美', reason: '查無現任' }]);
    });

    it('ambiguity guard: two manifest entries share the same Chinese prefix → skip both (寧缺勿錯)', () => {
      const officials = [off('1', '陳小美Away', '花蓮縣第05選舉區')];
      const manifest: ManifestEntry[] = [
        { name: '陳小美(甲)', img_url: 'http://x/o1.jpg' },
        { name: '陳小美(乙)', img_url: 'http://x/o2.jpg' },
      ];
      const r = matchManifest(officials, manifest, '花蓮縣');
      expect(r.matched).toEqual([]);
      expect(r.skipped).toEqual([
        { name: '陳小美(甲)', reason: '查無現任' },
        { name: '陳小美(乙)', reason: '查無現任' },
      ]);
    });

    it('prefix fallback never crosses county lines', () => {
      const officials = [off('1', '石慶龍Rungquan．Lhkatafatu', '雲林縣第01選舉區')];
      const manifest: ManifestEntry[] = [{ name: '石慶龍', img_url: 'http://x/p.jpg' }];
      const r = matchManifest(officials, manifest, '南投縣');
      expect(r.matched).toEqual([]);
      expect(r.skipped).toEqual([{ name: '石慶龍', reason: '查無現任' }]);
    });
  });

  describe('embedded honorifics (頭銜夾在姓名中間)', () => {
    it('strips mid-name 議長 (張議長峻 → 張峻)', () => {
      const officials = [off('1', '張峻', '花蓮縣第01選舉區')];
      const manifest: ManifestEntry[] = [{ name: '張議長峻', img_url: 'http://x/q.jpg' }];
      const r = matchManifest(officials, manifest, '花蓮縣');
      expect(r.matched).toEqual([{ officialId: '1', slug: 'c-張峻', imgUrl: 'http://x/q.jpg' }]);
      expect(r.skipped).toEqual([]);
    });

    it('strips mid-name 副議長 (徐副議長雪玉 → 徐雪玉)', () => {
      const officials = [off('1', '徐雪玉', '花蓮縣第02選舉區')];
      const manifest: ManifestEntry[] = [{ name: '徐副議長雪玉', img_url: 'http://x/r.jpg' }];
      const r = matchManifest(officials, manifest, '花蓮縣');
      expect(r.matched).toEqual([{ officialId: '1', slug: 'c-徐雪玉', imgUrl: 'http://x/r.jpg' }]);
      expect(r.skipped).toEqual([]);
    });

    it('strips mid-name 代理議長', () => {
      const officials = [off('1', '林三', '花蓮縣第03選舉區')];
      const manifest: ManifestEntry[] = [{ name: '林代理議長三', img_url: 'http://x/s.jpg' }];
      const r = matchManifest(officials, manifest, '花蓮縣');
      expect(r.matched).toEqual([{ officialId: '1', slug: 'c-林三', imgUrl: 'http://x/s.jpg' }]);
      expect(r.skipped).toEqual([]);
    });

    it('never mutates when the stripped variant does not match anyone (leaves original name in skip reason)', () => {
      const officials = [off('1', '王小明', '花蓮縣第01選舉區')];
      const manifest: ManifestEntry[] = [{ name: '張議長峻', img_url: 'http://x/t.jpg' }];
      const r = matchManifest(officials, manifest, '花蓮縣');
      expect(r.matched).toEqual([]);
      expect(r.skipped).toEqual([{ name: '張議長峻', reason: '查無現任' }]);
    });

    it('unaffected manifest names without embedded honorific tokens are untouched', () => {
      const officials = [off('1', '王小明', '花蓮縣第01選舉區')];
      const manifest: ManifestEntry[] = [{ name: '王小明', img_url: 'http://x/u.jpg' }];
      const r = matchManifest(officials, manifest, '花蓮縣');
      expect(r.matched).toEqual([{ officialId: '1', slug: 'c-王小明', imgUrl: 'http://x/u.jpg' }]);
    });
  });

  describe('status-suffix ignore list (轉任立委/解職/歿)', () => {
    it('(轉任立委) base name matches a non-incumbent official → skip 已解職/轉任', () => {
      const officials = [off('1', '李柏毅', '高雄市第05選舉區', undefined, false)];
      const manifest: ManifestEntry[] = [{ name: '李柏毅(轉任立委)', img_url: 'http://x/v.jpg' }];
      const r = matchManifest(officials, manifest, '高雄市');
      expect(r.matched).toEqual([]);
      expect(r.skipped).toEqual([{ name: '李柏毅(轉任立委)', reason: '已解職/轉任' }]);
    });

    it('(歿) base name matches a non-incumbent official → skip 已解職/轉任', () => {
      const officials = [off('1', '張世賢', '臺南市第01選舉區', undefined, false)];
      const manifest: ManifestEntry[] = [{ name: '張世賢(歿)', img_url: 'http://x/w.jpg' }];
      const r = matchManifest(officials, manifest, '臺南市');
      expect(r.matched).toEqual([]);
      expect(r.skipped).toEqual([{ name: '張世賢(歿)', reason: '已解職/轉任' }]);
    });

    it('(解職...free text) base name matches a non-incumbent official → skip 已解職/轉任', () => {
      const officials = [off('1', '蔡淑惠', '臺南市第02選舉區', undefined, false)];
      const manifest: ManifestEntry[] = [
        { name: '蔡淑惠(解職自115.06.30起生效)', img_url: 'http://x/x.jpg' },
      ];
      const r = matchManifest(officials, manifest, '臺南市');
      expect(r.matched).toEqual([]);
      expect(r.skipped).toEqual([{ name: '蔡淑惠(解職自115.06.30起生效)', reason: '已解職/轉任' }]);
    });

    it('status-suffix base name matches no one at all (incumbent or not) → falls back to 查無現任', () => {
      const officials = [off('1', '王小明', '高雄市第01選舉區')];
      const manifest: ManifestEntry[] = [{ name: '不存在的人(轉任立委)', img_url: 'http://x/y.jpg' }];
      const r = matchManifest(officials, manifest, '高雄市');
      expect(r.matched).toEqual([]);
      expect(r.skipped).toEqual([{ name: '不存在的人(轉任立委)', reason: '查無現任' }]);
    });

    it('status-suffix base name actually matches a current incumbent → still matched normally', () => {
      const officials = [off('1', '黃紹庭', '高雄市第03選舉區', undefined, true)];
      const manifest: ManifestEntry[] = [{ name: '黃紹庭(解職)', img_url: 'http://x/z.jpg' }];
      const r = matchManifest(officials, manifest, '高雄市');
      expect(r.matched).toEqual([{ officialId: '1', slug: 'c-黃紹庭', imgUrl: 'http://x/z.jpg' }]);
      expect(r.skipped).toEqual([]);
    });

    it('non-incumbent officials are never counted as matching candidates for photo assignment', () => {
      const officials = [off('1', '李柏毅', '高雄市第05選舉區', undefined, false)];
      const manifest: ManifestEntry[] = [{ name: '李柏毅', img_url: 'http://x/aa.jpg' }];
      const r = matchManifest(officials, manifest, '高雄市');
      expect(r.matched).toEqual([]);
      expect(r.skipped).toEqual([{ name: '李柏毅', reason: '查無現任' }]);
    });
  });
});
