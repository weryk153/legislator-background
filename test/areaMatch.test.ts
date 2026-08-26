import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeAreaName, areaKey, buildKeyIndex, buildCodeIndex, KNOWN_MISSING_BOUNDARY_KEYS,
} from '../scraper/lib/areaMatch';
import { parseElbase, type AreaNode } from '../scraper/lib/cecVoteData';

const V1_ELBASE = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉/V1/elbase.csv';

describe('normalizeAreaName', () => {
  it('台一律正規化為臺——兩種寫法在官方檔案裡都出現', () => {
    expect(normalizeAreaName('台北市')).toBe('臺北市');
    expect(normalizeAreaName('臺北市')).toBe('臺北市');
  });
  it('去除空白', () => {
    expect(normalizeAreaName(' 松山 區 ')).toBe('松山區');
  });
  it('全形數字轉半形', () => {
    expect(normalizeAreaName('中山１里')).toBe('中山1里');
  });
  it('空值不拋錯', () => {
    expect(normalizeAreaName('')).toBe('');
  });
  it('中選會的私用區罕用字（PUA）碼位轉回正常字元——經VILLCODE驗證過的碼位才轉換', () => {
    expect(normalizeAreaName('瓦\u{e008}里')).toBe('瓦磘里');
    expect(normalizeAreaName('\u{e02d}北里')).toBe('廍北里');
  });
  it('未收錄的私用區碼位維持原樣，不猜測——讓對不上的情形明確列出，而非悄悄轉錯', () => {
    expect(normalizeAreaName('\u{e099}里')).toBe('\u{e099}里');
  });
  it('界線檔的方括號記法拿掉方括號、保留內部字元', () => {
    expect(normalizeAreaName('瓦[磘]里')).toBe('瓦磘里');
  });
});

describe('areaKey：複合鍵', () => {
  it('三段以斜線相連', () => {
    expect(areaKey('臺北市', '松山區', '莊敬里')).toBe('臺北市/松山區/莊敬里');
  });
  it('省略下層即為該層的鍵', () => {
    expect(areaKey('臺北市', '松山區')).toBe('臺北市/松山區');
    expect(areaKey('臺北市')).toBe('臺北市');
  });
  it('組鍵時一併正規化，呼叫端不必先處理', () => {
    expect(areaKey('台北市', '松山區', '莊敬里')).toBe('臺北市/松山區/莊敬里');
  });
});

describe('buildKeyIndex：對真實資料', () => {
  const areas = parseElbase(readFileSync(V1_ELBASE, 'utf8'));

  it('全國每個行政區的複合鍵唯一——鍵若碰撞會把某村的村里長掛到另一村頭上', () => {
    expect(buildKeyIndex(areas).size).toBe(areas.length);
  });

  it('單以村里名不唯一，故複合鍵必須含上層', () => {
    const villages = areas.filter((a) => a.level === 'village');
    expect(new Set(villages.map((v) => v.name)).size).toBeLessThan(villages.length);
  });

  it('可用鍵反查代碼，也可用代碼反查鍵', () => {
    expect(buildKeyIndex(areas).get('臺北市/松山區/莊敬里')).toBe('63-000-00-010-0002');
    expect(buildCodeIndex(areas).get('63-000-00-010-0002')).toBe('臺北市/松山區/莊敬里');
  });
});

describe('buildKeyIndex / buildCodeIndex：碰撞一律拋錯', () => {
  // 碰撞若只在測試裡以「Map 大小等於節點數」斷言，擋不住實際發生過的事故：產出端
  // 另外把鍵展開過一次才建表，測試驗的是展開前的鍵，展開後才發生的碰撞一路通關，
  // 連江縣 21 個村的村里長全部被覆蓋掉。防護必須在建表的函式本身。
  const dup: AreaNode[] = [
    { code: '09-007-00-000-0000', level: 'county', name: '連江縣', parent: null },
    { code: '09-007-00-010-0000', level: 'town', name: '南竿鄉', parent: '09-007-00-000-0000' },
    { code: '09-007-00-010-0002', level: 'village', name: '復興村', parent: '09-007-00-010-0000' },
    { code: '09-007-00-010-0099', level: 'village', name: '復興村', parent: '09-007-00-010-0000' },
  ];

  it('同一個名稱鍵對到兩個代碼時拋錯並列出兩者', () => {
    expect(() => buildKeyIndex(dup)).toThrow(/連江縣\/南竿鄉\/復興村.*0002.*0099/s);
  });

  it('正常資料不拋錯', () => {
    expect(() => buildKeyIndex(dup.slice(0, 3))).not.toThrow();
  });
});

describe('界線檔與中選會行政區的全量對應', () => {
  const areas = parseElbase(readFileSync(V1_ELBASE, 'utf8'));
  const codeIndex = buildCodeIndex(areas);

  for (const level of ['county', 'town', 'village'] as const) {
    it(`${level} 層的每個中選會行政區都對得到界線`, () => {
      const topo = JSON.parse(readFileSync(`scraper/boundaries/${level}.topo.json`, 'utf8'));
      const keys = new Set<string>((Object.values(topo.objects) as any[])
        .flatMap((o) => o.geometries.map((g: any) => g.properties.key)));
      const missing: string[] = [];
      for (const a of areas.filter((area) => area.level === level)) {
        const key = codeIndex.get(a.code) ?? a.code;
        if (!keys.has(key) && !KNOWN_MISSING_BOUNDARY_KEYS.has(key)) missing.push(key);
      }
      expect(missing).toEqual([]);
    });
  }

  // 反向的守門員：每個界線多邊形的鍵最多只能對到一個行政區。前端就是用這個鍵
  // 建查找表把資料貼到多邊形上，一鍵多區代表某區的資料會被畫到另一區身上。
  it('每個界線多邊形鍵恰好對到一個行政區——一鍵多區會讓資料互相覆蓋', () => {
    const byKey = new Map<string, string[]>();
    for (const a of areas) {
      if (a.level === 'electoralUnit') continue;   // 選舉單位不畫在地圖上
      const key = codeIndex.get(a.code) ?? a.code;
      byKey.set(key, [...(byKey.get(key) ?? []), a.code]);
    }
    expect([...byKey.entries()].filter(([, codes]) => codes.length > 1)).toEqual([]);
  });

  it('連江縣 22 個村都對得到自己的界線多邊形', () => {
    const topo = JSON.parse(readFileSync('scraper/boundaries/village.topo.json', 'utf8'));
    const keys = new Set<string>((Object.values(topo.objects) as any[])
      .flatMap((o) => o.geometries.map((g: any) => g.properties.key)));
    const villages = areas.filter((a) => a.level === 'village' && a.code.startsWith('09-007-'));
    expect(villages).toHaveLength(22);
    expect(villages.filter((a) => !keys.has(codeIndex.get(a.code)!))).toEqual([]);
  });
});
