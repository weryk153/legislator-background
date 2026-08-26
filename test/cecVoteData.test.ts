import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseElbase, countyCodeOf, townCodeOf, parseElcand, parseElpaty, winnersByArea, INDEPENDENT_PARTY_CODE } from '../scraper/lib/cecVoteData';

const V1_ELBASE = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉/V1/elbase.csv';

describe('parseElbase：行政區樹', () => {
  const csv = [
    '00,000,00,000,0000,全國',
    '63,000,00,000,0000,臺北市',
    '63,000,00,010,0000,松山區',
    '63,000,00,010,0002,莊敬里',
    '09,007,00,000,0000,連江縣',
    '09,007,00,010,0000,南竿鄉',
    '09,007,00,010,0001,介壽村',
  ].join('\n');

  it('略過「全國」列——它不是行政區', () => {
    expect(parseElbase(csv).some((a) => a.name === '全國')).toBe(false);
  });

  it('直轄市以省市別辨識，其縣市別為 000，不可誤判為非縣市層', () => {
    expect(parseElbase(csv).find((a) => a.name === '臺北市'))
      .toEqual({ code: '63-000-00-000-0000', level: 'county', name: '臺北市', parent: null });
  });

  it('省轄縣市的省市別為 09 或 10，縣市別才是識別碼', () => {
    expect(parseElbase(csv).find((a) => a.name === '連江縣'))
      .toEqual({ code: '09-007-00-000-0000', level: 'county', name: '連江縣', parent: null });
  });

  it('鄉鎮市區掛在所屬縣市之下', () => {
    expect(parseElbase(csv).find((a) => a.name === '松山區'))
      .toEqual({ code: '63-000-00-010-0000', level: 'town', name: '松山區', parent: '63-000-00-000-0000' });
  });

  it('村里掛在所屬鄉鎮市區之下', () => {
    expect(parseElbase(csv).find((a) => a.name === '莊敬里'))
      .toEqual({ code: '63-000-00-010-0002', level: 'village', name: '莊敬里', parent: '63-000-00-010-0000' });
  });
});

describe('parseElbase：格式不良列的處理', () => {
  it('有內容但欄位不足的列要拋錯——靜默跳過會讓行政區樹悄悄少一塊', () => {
    const csv = [
      '63,000,00,000,0000,臺北市',
      '63,000,00,010,0000', // 缺名稱欄
    ].join('\n');
    expect(() => parseElbase(csv)).toThrow(/第 2 列/);
  });

  it('名稱欄為空的列也要拋錯，不能當成合法資料', () => {
    const csv = [
      '63,000,00,000,0000,臺北市',
      '63,000,00,010,0000,',
    ].join('\n');
    expect(() => parseElbase(csv)).toThrow(/第 2 列/);
  });

  it('純空白行不拋錯——只是版面留白，不是資料缺漏', () => {
    const csv = ['63,000,00,000,0000,臺北市', '   ', '63,000,00,010,0000,松山區'].join('\n');
    expect(() => parseElbase(csv)).not.toThrow();
    expect(parseElbase(csv)).toHaveLength(2);
  });

  it('檔尾換行留下的空列不拋錯', () => {
    const csv = '63,000,00,000,0000,臺北市\n';
    expect(() => parseElbase(csv)).not.toThrow();
    expect(parseElbase(csv)).toHaveLength(1);
  });
});

describe('countyCodeOf / townCodeOf：代碼上溯', () => {
  it('議員的選區代碼可上溯到縣市——席次要按縣市彙整，而選區別不是行政區', () => {
    expect(countyCodeOf('10-005-01-000-0000')).toBe('10-005-00-000-0000');
  });
  it('村里代碼可上溯到縣市與鄉鎮市區', () => {
    expect(countyCodeOf('63-000-00-010-0002')).toBe('63-000-00-000-0000');
    expect(townCodeOf('63-000-00-010-0002')).toBe('63-000-00-010-0000');
  });
  it('已是縣市層者上溯後不變', () => {
    expect(countyCodeOf('63-000-00-000-0000')).toBe('63-000-00-000-0000');
  });
});

describe('parseElbase：對真實資料', () => {
  const areas = parseElbase(readFileSync(V1_ELBASE, 'utf8'));

  it('層級數與 2022 年的行政區數相符', () => {
    const n = (l: string) => areas.filter((a) => a.level === l).length;
    expect(n('county')).toBe(22);
    expect(n('town')).toBe(368);
    expect(n('village')).toBe(7756);
  });

  it('每個非縣市節點的 parent 都存在於樹中——parent 斷鏈會讓整張地圖組不起來', () => {
    const codes = new Set(areas.map((a) => a.code));
    expect(areas.filter((a) => a.parent && !codes.has(a.parent))).toEqual([]);
  });

  it('每個村里的 townCodeOf 都指向存在的鄉鎮市區', () => {
    const towns = new Set(areas.filter((a) => a.level === 'town').map((a) => a.code));
    const bad = areas.filter((a) => a.level === 'village' && !towns.has(townCodeOf(a.code)));
    expect(bad).toEqual([]);
  });
});

describe('parseElcand：候選人', () => {
  // 取自 V1/elcand.csv 與 C1/prv/elcand.csv 的真實列
  const csv = [
    '09,007,00,010,0001,1,陳春開,16,1,0440621,67,金馬地區,高中(職)以下,N, , ',
    '09,007,00,010,0001,2,陳美貴,1,1,0520630,59,金馬地區,高中(職)以下,Y,*, ',
    '10,005,00,000,0000,1,鍾東錦,999,1,0520102,59,臺灣省,大學,N,*, ',
  ].join('\n');

  it('當選註記是空白包夾的星號，須去空白後判斷', () => {
    expect(parseElcand(csv).map((c) => c.elected)).toEqual([false, true, true]);
  });

  it('現任註記 Y/N 轉為布林', () => {
    expect(parseElcand(csv).map((c) => c.incumbent)).toEqual([false, true, false]);
  });

  it('政黨代號保留字串——999 是無黨籍，轉成數字會失去代號語意', () => {
    expect(parseElcand(csv)[2].partyCode).toBe(INDEPENDENT_PARTY_CODE);
  });

  it('出生日期保留民國格式原樣，供「同姓名不同人」的辨識用', () => {
    expect(parseElcand(csv)[2].birthDate).toBe('0520102');
  });

  it('所屬區代碼與 elbase 的代碼格式一致', () => {
    expect(parseElcand(csv)[0].areaCode).toBe('09-007-00-010-0001');
    expect(parseElcand(csv)[2].areaCode).toBe('10-005-00-000-0000');
  });

  it('欄位不足的殘列略過，不產生半殘的候選人', () => {
    expect(parseElcand('10,005,00,000,0000,1,某某')).toEqual([]);
  });
});

describe('parseElpaty：政黨代碼表', () => {
  it('代號對名稱', () => {
    const m = parseElpaty('1,中國國民黨\n16,民主進步黨\n999,無黨籍及未經政黨推薦');
    expect(m.get('1')).toBe('中國國民黨');
    expect(m.get('999')).toBe('無黨籍及未經政黨推薦');
  });
});

describe('winnersByArea：當選者彙整', () => {
  const cands = parseElcand([
    '09,007,00,010,0001,1,陳春開,16,1,0440621,67,金馬地區,高中(職)以下,N, , ',
    '09,007,00,010,0001,2,陳美貴,1,1,0520630,59,金馬地區,高中(職)以下,Y,*, ',
    '10,005,01,000,0000,1,甲某,1,1,0500101,60,臺灣省,大學,N,*, ',
    '10,005,01,000,0000,2,乙某,16,2,0500101,60,臺灣省,大學,N,*, ',
  ].join('\n'));

  it('只收當選者', () => {
    expect([...winnersByArea(cands).values()].flat().map((c) => c.name))
      .toEqual(['陳美貴', '甲某', '乙某']);
  });

  it('議員與代表是複數席，同一區可有多位當選者', () => {
    expect(winnersByArea(cands).get('10-005-01-000-0000')?.length).toBe(2);
  });

  it('落選者所在的區不會出現在結果中', () => {
    expect(winnersByArea(parseElcand(
      '10,001,00,000,0000,1,丙某,1,1,0500101,60,臺灣省,大學,N, , ')).size).toBe(0);
  });
});

describe('parseElcand：對真實資料的席次總數', () => {
  const ROOT = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉';
  // C1/T1/T2/T3 之下再分 city/ 與 prv/；其餘類別的 CSV 直接位於類別目錄下
  const CASES: [string, string[], number][] = [
    ['C1', ['city', 'prv'], 21],   // 21 而非 22：嘉義市長延後重行選舉，資料另存他處
    ['T1', ['city', 'prv'], 837],
    ['T2', ['city', 'prv'], 34],
    ['T3', ['city', 'prv'], 35],
    ['D1', [''], 198],
    ['D2', [''], 6],
    ['R1', [''], 2001],
    ['R2', [''], 70],
    ['R3', [''], 50],
    ['V1', [''], 7740],
  ];

  for (const [cat, subs, expected] of CASES) {
    it(`${cat} 的當選席次為 ${expected}`, () => {
      const cands = subs.flatMap((s) =>
        parseElcand(readFileSync([ROOT, cat, s, 'elcand.csv'].filter(Boolean).join('/'), 'utf8')));
      expect(cands.filter((c) => c.elected).length).toBe(expected);
    });
  }

  it('十類合計為九合一的完整席次', () => {
    expect(CASES.reduce((n, [, , e]) => n + e, 0)).toBe(10992);
  });
});
