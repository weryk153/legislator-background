import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeAreaName, areaKey, buildKeyIndex, buildCodeIndex,
  expandVillageUnitKey, KNOWN_MISSING_BOUNDARY_KEYS,
} from '../scraper/lib/areaMatch';
import { parseElbase } from '../scraper/lib/cecVoteData';

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

describe('expandVillageUnitKey：展開含頓號的複合鍵', () => {
  it('連江縣的合選單位拆成多個村里鍵', () => {
    expect(expandVillageUnitKey('連江縣/南竿鄉/復興村、福沃村')).toEqual([
      '連江縣/南竿鄉/復興村',
      '連江縣/南竿鄉/福沃村',
    ]);
  });
  it('三段以上的合選單位全部拆開', () => {
    expect(expandVillageUnitKey('連江縣/南竿鄉/仁愛村、津沙村、馬祖村、四維村')).toEqual([
      '連江縣/南竿鄉/仁愛村',
      '連江縣/南竿鄉/津沙村',
      '連江縣/南竿鄉/馬祖村',
      '連江縣/南竿鄉/四維村',
    ]);
  });
  it('正常村里（名稱不含頓號）原樣傳回，不受誤傷', () => {
    expect(expandVillageUnitKey('臺北市/松山區/莊敬里')).toEqual(['臺北市/松山區/莊敬里']);
  });
  it('只拆最後一段：縣市或鄉鎮市區名稱本身不會被誤拆（合成情境，實際資料沒有這種名稱）', () => {
    expect(expandVillageUnitKey('測試縣、測試市/測試鄉/正常村')).toEqual(['測試縣、測試市/測試鄉/正常村']);
  });
  it('省略下層即為該層的鍵，同樣不受影響', () => {
    expect(expandVillageUnitKey('臺北市/松山區')).toEqual(['臺北市/松山區']);
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
        const fullKey = codeIndex.get(a.code) ?? a.code;
        // 連江縣（馬祖）人口稀少，中選會把數個行政村合併成一個選舉單位，名稱以
        // 頓號相連（如「復興村、福沃村」），但界線檔仍按行政村逐村畫界，天生是
        // 一個選舉單位對應多個多邊形——故拆開頓號後逐一比對每個行政村是否都有
        // 界線，而非要求整串合併名稱剛好對到單一多邊形（這是加嚴，不是放寬：
        // 8 個選舉單位拆開後變成 21 筆逐一檢查，任何一村缺界線都會被抓到）。
        // 展開邏輯與 scraper/build-election-map.ts 共用同一份實作
        // （scraper/lib/areaMatch.ts 的 expandVillageUnitKey），避免兩處各自
        // 演化到互相分歧。
        for (const key of expandVillageUnitKey(fullKey)) {
          if (!keys.has(key) && !KNOWN_MISSING_BOUNDARY_KEYS.has(key)) missing.push(key);
        }
      }
      expect(missing).toEqual([]);
    });
  }
});
