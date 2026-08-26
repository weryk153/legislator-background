import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { toTermRecords, termLimited, seatBreakdown, type TermRecord } from '../scraper/lib/electionRules';
import { parseElcand, parseElpaty, winnersByArea, countyCodeOf } from '../scraper/lib/cecVoteData';

describe('toTermRecords：把當選者轉成任期紀錄', () => {
  it('選區代碼上溯為縣市代碼——連任限制綁在縣市，不是選區', () => {
    const w = parseElcand('10,005,00,000,0000,1,鍾東錦,999,1,0520102,59,臺灣省,大學,N,*, ');
    expect(toTermRecords(2022, w)).toEqual([
      { year: 2022, countyCode: '10-005-00-000-0000', name: '鍾東錦', birthDate: '0520102' },
    ]);
  });
});

describe('termLimited：縣市長連任一次為限', () => {
  const 苗栗 = '10-005-00-000-0000';
  const 王 = { name: '王某', birthDate: '0500101' };
  const rec = (year: number, countyCode: string, name = '王某', birthDate = '0500101'): TermRecord =>
    ({ year, countyCode, name, birthDate });

  it('連續兩屆當選者不得再選', () => {
    expect(termLimited(王, [rec(2018, 苗栗), rec(2022, 苗栗)], 苗栗, 2026).limited).toBe(true);
  });

  it('只當選一屆者可以再選', () => {
    expect(termLimited(王, [rec(2022, 苗栗)], 苗栗, 2026).limited).toBe(false);
  });

  it('隔屆當選不算連任，不受限', () => {
    expect(termLimited(王, [rec(2014, 苗栗), rec(2022, 苗栗)], 苗栗, 2026).limited).toBe(false);
  });

  it('在不同縣市各當選一屆不受限——限制綁在同一縣市的職位上', () => {
    expect(termLimited(王, [rec(2018, '10-001-00-000-0000'), rec(2022, 苗栗)], 苗栗, 2026).limited).toBe(false);
  });

  it('同名但出生日期不同者視為不同人，不可合併計算', () => {
    const history = [rec(2018, 苗栗, '王某', '0300101'), rec(2022, 苗栗, '王某', '0500101')];
    expect(termLimited(王, history, 苗栗, 2026).limited).toBe(false);
  });

  it('受限時說明理由，供頁面直接顯示', () => {
    expect(termLimited(王, [rec(2018, 苗栗), rec(2022, 苗栗)], 苗栗, 2026).reason)
      .toBe('已連任一次（2018、2022 當選），依地方制度法不得再選');
  });
});

describe('seatBreakdown：政黨席次統計', () => {
  const parties = parseElpaty('1,中國國民黨\n16,民主進步黨\n999,無黨籍及未經政黨推薦');
  const winners = parseElcand([
    '10,005,01,000,0000,1,甲,1,1,0500101,60,臺灣省,大學,N,*, ',
    '10,005,01,000,0000,2,乙,1,2,0500101,60,臺灣省,大學,N,*, ',
    '10,005,02,000,0000,1,丙,16,1,0500101,60,臺灣省,大學,N,*, ',
    '10,005,02,000,0000,2,丁,999,1,0500101,60,臺灣省,大學,N,*, ',
  ].join('\n'));

  it('依席次由多到少排序', () => {
    expect(seatBreakdown(winners, parties).map((s) => [s.partyName, s.seats]))
      .toEqual([['中國國民黨', 2], ['民主進步黨', 1], ['無黨籍及未經政黨推薦', 1]]);
  });

  it('無黨籍照實計入，不併入其他也不略去——多數村里長是無黨籍，略去等於謊報版圖', () => {
    expect(seatBreakdown(winners, parties).some((s) => s.partyCode === '999')).toBe(true);
  });

  it('代碼表查無的政黨以代號顯示，不靜默丟棄，否則席次總數會對不上', () => {
    const unknown = parseElcand('10,005,01,000,0000,1,戊,777,1,0500101,60,臺灣省,大學,N,*, ');
    expect(seatBreakdown(unknown, parties))
      .toEqual([{ partyCode: '777', partyName: '未知政黨（代號 777）', seats: 1 }]);
  });
});

describe('termLimited：對 2018 與 2022 真實資料', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  const R22 = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉';
  const R18 = 'scraper/out-roster/cec/voteData/2018-107年地方公職人員選舉';

  const w22 = [...winnersByArea(['city', 'prv'].flatMap(
    (s) => parseElcand(read(`${R22}/C1/${s}/elcand.csv`)))).values()].flat();
  // 2018 匯出檔是 Excel 風格的引號 CSV，parseElcand 內部已自動剝除引號（見
  // cecVoteData.ts 的 splitCsvFields），這裡不需要任何額外轉換。
  const w18 = [...winnersByArea(['直轄市市長', '縣市市長'].flatMap(
    (d) => parseElcand(read(`${R18}/${d}/elcand.csv`)))).values()].flat();
  const history = [...toTermRecords(2018, w18), ...toTermRecords(2022, w22)];

  it('2022 當選的 21 位縣市長都判得出結果', () => {
    const results = w22.map((w) => termLimited(w, history, countyCodeOf(w.areaCode), 2026));
    expect(results.length).toBe(21);
    expect(results.every((r) => typeof r.limited === 'boolean')).toBe(true);
  });

  it('受連任限制者為少數而非全部或零——兩種極端都代表判斷條件寫錯', () => {
    const limited = w22.filter((w) => termLimited(w, history, countyCodeOf(w.areaCode), 2026).limited);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited.length).toBeLessThan(21);
  });
});
