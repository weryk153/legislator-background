import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseElbase, countyCodeOf, townCodeOf, parseElcand, parseElpaty,
  winnersByArea, pendingDrawByArea, INDEPENDENT_PARTY_CODE,
} from '../scraper/lib/cecVoteData';

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

  it('0A0x 的合併選舉單位標成 electoralUnit，不當成村里', () => {
    const csv = [
      '09,007,00,010,0002,復興村',
      '09,007,00,010,0A01,復興村、福沃村',
    ].join('\n');
    expect(parseElbase(csv)).toEqual([
      { code: '09-007-00-010-0002', level: 'village', name: '復興村', parent: '09-007-00-010-0000' },
      { code: '09-007-00-010-0A01', level: 'electoralUnit', name: '復興村、福沃村', parent: '09-007-00-010-0000' },
    ]);
  });

  it('未知形態的村里別代碼拋錯，不猜它屬於哪一層', () => {
    expect(() => parseElbase('09,007,00,010,0Z99,某某單位')).toThrow(/不是已知的代碼形態/);
    expect(() => parseElbase('09,007,00,010,00A,某某單位')).toThrow(/不是已知的代碼形態/);
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

  // 代表會的選區別是 01–05（鄉鎮市內再分選舉區），而行政區樹的鄉鎮市區節點
  // 選區別固定是 00。townCodeOf 若保留選區別，368 個鄉鎮市區永遠對不到自己的
  // 代表會席次，而且不會有任何錯誤或警告——這正是曾經發生過的事。
  it('鄉鎮市民代表的選區代碼可上溯到鄉鎮市區——選區別不是行政區階層的一環', () => {
    expect(townCodeOf('10-016-02-050-0000')).toBe('10-016-00-050-0000');
    expect(townCodeOf('64-000-02-360-0001')).toBe('64-000-00-360-0000');
  });
  it('countyCodeOf 與 townCodeOf 對選區別的假設一致——兩者都歸零', () => {
    const code = '10-005-04-110-0001';
    expect(countyCodeOf(code).split('-')[2]).toBe('00');
    expect(townCodeOf(code).split('-')[2]).toBe('00');
  });
});

describe('parseElbase：對真實資料', () => {
  const areas = parseElbase(readFileSync(V1_ELBASE, 'utf8'));

  it('層級數與 2022 年的行政區數相符', () => {
    const n = (l: string) => areas.filter((a) => a.level === l).length;
    expect(n('county')).toBe(22);
    expect(n('town')).toBe(368);
    // 7,748 而非 7,756：V1/elbase.csv 裡另有 8 列村里別為 0A01/0A02/0A03 的
    // 合併選舉單位，那是鄉鎮市民代表的選舉區，不是村里（V1/elcand.csv 裡它們
    // 一位候選人都沒有），故單獨歸類為 electoralUnit，不混入村里層。
    expect(n('village')).toBe(7748);
    expect(n('electoralUnit')).toBe(8);
  });

  it('連江縣 4 個鄉的 22 個村都在村里層，一個都不少', () => {
    const lienchiang = areas.filter((a) => a.level === 'village' && a.code.startsWith('09-007-'));
    expect(lienchiang).toHaveLength(22);
    expect(lienchiang.map((a) => a.name)).toContain('復興村');
    expect(lienchiang.map((a) => a.name)).toContain('福沃村');
  });

  it('合併選舉單位不在村里層——否則會多出一批 chief 為 null 的幽靈村里', () => {
    expect(areas.filter((a) => a.level === 'village').some((a) => a.name.includes('、'))).toBe(false);
    expect(areas.filter((a) => a.level === 'electoralUnit').map((a) => a.name))
      .toContain('復興村、福沃村');
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

  // 欄位不足時原本是靜默 continue（與同檔 parseElbase 拋錯的策略相反）。若 2026 年
  // 的欄位數有變動，靜默略過的行為是「當選人整批安靜消失」——正是本檔檔首註解
  // 花了十幾行警告的那個災難。
  it('欄位不足的殘列拋錯，不靜默略過', () => {
    expect(() => parseElcand('10,005,00,000,0000,1,某某')).toThrow(/欄位不足/);
  });

  it('姓名欄為空的列拋錯', () => {
    expect(() => parseElcand('10,005,00,000,0000,1,,999,1,0520102,59,臺灣省,大學,N,*, ')).toThrow(/姓名欄為空/);
  });
});

describe('parseElcand：當選註記的四種值', () => {
  const row = (mark: string, sex = '1') =>
    `10,005,01,000,0000,1,某某,1,${sex},0520102,59,臺灣省,大學,N,${mark}, `;

  it('* 為一般得票當選', () => {
    const c = parseElcand(row('*'))[0];
    expect([c.elected, c.electedBy, c.pendingDraw]).toEqual([true, 'vote', false]);
  });

  it('! 為婦女保障名額當選——同樣是當選，不可當成落選', () => {
    const c = parseElcand(row('!', '2'))[0];
    expect([c.elected, c.electedBy, c.pendingDraw]).toEqual([true, 'quota', false]);
  });

  it('? 為得票相同待抽籤——既非當選也非落選，獨立成 pendingDraw', () => {
    const c = parseElcand(row('?'))[0];
    expect([c.elected, c.electedBy, c.pendingDraw]).toEqual([false, null, true]);
  });

  it('空白為未當選', () => {
    const c = parseElcand(row(' '))[0];
    expect([c.elected, c.electedBy, c.pendingDraw]).toEqual([false, null, false]);
  });

  it('第五種未知註記一律拋錯，不靜默當成落選', () => {
    expect(() => parseElcand(row('#'))).toThrow(/不是已知的四種值/);
  });

  it('原始註記保留下來供稽核', () => {
    expect(parseElcand(row('!', '2'))[0].electedMark).toBe('!');
  });
});

// 中選會 2018 年（含）以前的匯出檔是 Excel 引號格式：每欄以雙引號包住，代碼類欄位
// 再加前導單引號強制以文字讀入。以下三個 describe 用逐字抄自真實 2018 年檔案的列，
// 驗證 parseElcand / parseElbase / parseElpaty 都能自動吃這種格式——不需要呼叫端
// 先做任何轉換。
describe('parseElcand：相容 2018 年 Excel 引號格式與 2022 年純格式', () => {
  it('2022 年無引號格式：欄位值正確解析', () => {
    // 逐字抄自 2022 C1/city/elcand.csv 第 3 列
    const line = '09,007,00,000,0000,3,王忠銘,1,1,0470227,64,金馬地區,碩士,N,*, ';
    expect(parseElcand(line)).toEqual([{
      areaCode: '09-007-00-000-0000',
      number: 3,
      name: '王忠銘',
      partyCode: '1',
      sex: '1',
      birthDate: '0470227',
      age: 64,
      education: '碩士',
      incumbent: false,
      electedMark: '*',
      elected: true,
      electedBy: 'vote',
      pendingDraw: false,
    }]);
  });

  it('2018 年 Excel 引號格式：剝除引號與前導單引號後，欄位值與無引號格式相同', () => {
    // 逐字抄自 2018 縣市市長/elcand.csv 第 1 列（含雙引號與前導單引號）
    const line = '"\'10","\'004","\'00","\'000","\'0000","1","楊文科","\'1","\'1","\'0400322","67","臺灣省","碩士","N","*"," "';
    expect(parseElcand(line)).toEqual([{
      areaCode: '10-004-00-000-0000',
      number: 1,
      name: '楊文科',
      partyCode: '1',
      sex: '1',
      birthDate: '0400322',
      age: 67,
      education: '碩士',
      incumbent: false,
      electedMark: '*',
      elected: true,
      electedBy: 'vote',
      pendingDraw: false,
    }]);
  });
});

describe('parseElcand：對 2018 年真實資料（Excel 引號格式）的當選席次', () => {
  const R18 = 'scraper/out-roster/cec/voteData/2018-107年地方公職人員選舉';

  it('直轄市市長＋縣市市長合計 22 位當選縣市長——這正是引號未剝除時會靜默歸零之處，須有測試盯著它', () => {
    const cands = ['直轄市市長', '縣市市長'].flatMap((d) =>
      parseElcand(readFileSync(`${R18}/${d}/elcand.csv`, 'utf8')));
    expect(cands.filter((c) => c.elected).length).toBe(22);
  });
});

describe('parseElbase：相容 2018 年 Excel 引號格式', () => {
  it('引號與前導單引號會被剝除，解析結果與無引號格式相同', () => {
    // 逐字抄自 2018 直轄市市長/elbase.csv 第 2 列
    const line = '"\'63","\'000","\'00","\'000","\'0000","臺北市"';
    expect(parseElbase(line)).toEqual([
      { code: '63-000-00-000-0000', level: 'county', name: '臺北市', parent: null },
    ]);
  });
});

describe('parseElpaty：政黨代碼表', () => {
  it('代號對名稱', () => {
    const m = parseElpaty('1,中國國民黨\n16,民主進步黨\n999,無黨籍及未經政黨推薦');
    expect(m.get('1')).toBe('中國國民黨');
    expect(m.get('999')).toBe('無黨籍及未經政黨推薦');
  });

  it('相容 2018 年 Excel 引號格式：引號會被剝除，解析結果與無引號格式相同', () => {
    // 逐字抄自 2018 縣市市長/elpaty.csv
    const line = '"999","無黨籍及未經政黨推薦"';
    expect(parseElpaty(line).get('999')).toBe('無黨籍及未經政黨推薦');
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
  // C1/T1/T2/T3 之下再分 city/ 與 prv/；其餘類別的 CSV 直接位於類別目錄下。
  // [類別, 子目錄, 當選(*＋!), 婦女保障名額(!), 待抽籤(?)]
  // 全部逐檔實測而來，含 `!`（婦女保障名額）——曾經只認 `*`，21 位婦女保障名額
  // 當選人被當成落選，其中 4 位在本站上還有檔案頁、標記為現任議員。
  const CASES: [string, string[], number, number, number][] = [
    ['C1', ['city', 'prv'], 21, 0, 0],   // 21 而非 22：嘉義市長延後重行選舉，資料另存他處
    ['T1', ['city', 'prv'], 841, 4, 0],
    ['T2', ['city', 'prv'], 34, 0, 0],
    ['T3', ['city', 'prv'], 35, 0, 0],
    ['D1', [''], 198, 0, 0],
    ['D2', [''], 6, 0, 0],
    ['R1', [''], 2016, 15, 2],
    ['R2', [''], 72, 2, 0],
    ['R3', [''], 50, 0, 0],
    ['V1', [''], 7740, 0, 16],
  ];

  const load = (cat: string, subs: string[]) => subs.flatMap((s) =>
    parseElcand(readFileSync([ROOT, cat, s, 'elcand.csv'].filter(Boolean).join('/'), 'utf8')));

  for (const [cat, subs, elected, quota, pending] of CASES) {
    it(`${cat} 的當選席次為 ${elected}（其中婦女保障名額 ${quota}、待抽籤 ${pending}）`, () => {
      const cands = load(cat, subs);
      expect(cands.filter((c) => c.elected).length).toBe(elected);
      expect(cands.filter((c) => c.electedBy === 'quota').length).toBe(quota);
      expect(cands.filter((c) => c.pendingDraw).length).toBe(pending);
    });
  }

  // 這是本分支唯一的總量守門員，故**從原始檔重算**，不驗 CASES 常數自身的加總——
  // 原本寫成 `CASES.reduce(...)` 只是在驗一個寫死的常數等於另一個寫死的常數，
  // 而那個常數本身就漏了 `!` 的 21 席。
  it('十類合計為九合一的完整席次（從原始檔重算，非常數自身加總）', () => {
    const all = CASES.flatMap(([cat, subs]) => load(cat, subs));
    expect(all.filter((c) => c.elected).length).toBe(11013);        // 10,992 個 `*` ＋ 21 個 `!`
    expect(all.filter((c) => c.electedMark === '*').length).toBe(10992);
    expect(all.filter((c) => c.electedBy === 'quota').length).toBe(21);
    expect(all.filter((c) => c.pendingDraw).length).toBe(18);
    expect(all.length).toBe(19747);
  });

  it('婦女保障名額當選者的性別欄全部是女性——這是該註記的特徵，可交叉驗證解析無誤', () => {
    const quota = CASES.flatMap(([cat, subs]) => load(cat, subs)).filter((c) => c.electedBy === 'quota');
    expect(quota).toHaveLength(21);
    expect(quota.every((c) => c.sex === '2')).toBe(true);
  });

  it('本站標為現任議員的四位婦女保障名額當選人，解析結果必須是當選', () => {
    const t1 = load('T1', ['city', 'prv']);
    for (const [name, area] of [
      ['唐麗輝', '09-020-01-000-0000'], ['吳菊花', '10-004-02-000-0000'],
      ['蕭詠萱', '10-005-05-000-0000'], ['沈家鳳', '67-000-01-000-0000'],
    ]) {
      const c = t1.find((x) => x.name === name && x.areaCode === area);
      expect(c?.elected, `${name} 應為當選`).toBe(true);
      expect(c?.electedBy).toBe('quota');
    }
  });
});

describe('pendingDrawByArea：待抽籤席位', () => {
  const ROOT = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉';

  it('村里長：8 個村里各 2 人得票相同，不可當成落選、也不可當成無人當選', () => {
    const m = pendingDrawByArea(parseElcand(readFileSync(`${ROOT}/V1/elcand.csv`, 'utf8')));
    expect(m.size).toBe(8);
    expect([...m.values()].every((v) => v.length === 2)).toBe(true);
  });

  it('鄉鎮市民代表：1 個選舉區 2 人得票相同', () => {
    const m = pendingDrawByArea(parseElcand(readFileSync(`${ROOT}/R1/elcand.csv`, 'utf8')));
    expect([...m.keys()]).toEqual(['10-016-02-050-0000']);
  });

  it('7,740 位當選村長＋8 個待抽籤村里＝7,748，恰為村里總數——每個村里都有結果', () => {
    const cands = parseElcand(readFileSync(`${ROOT}/V1/elcand.csv`, 'utf8'));
    const villages = parseElbase(readFileSync(V1_ELBASE, 'utf8')).filter((a) => a.level === 'village');
    expect(winnersByArea(cands).size + pendingDrawByArea(cands).size).toBe(villages.length);
  });
});
