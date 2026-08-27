// 選舉規則的判定。純函式，無 I/O。
import { INDEPENDENT_PARTY_CODE, countyCodeOf, type Candidate } from './cecVoteData';

export interface TermRecord {
  year: number;
  countyCode: string;
  name: string;
  birthDate: string;
}

/**
 * 連任限制的判定結果。**三種狀態，不可折疊成布林**。
 *
 * `unknown` 是關鍵的第三種：規格 §3.2 明寫「只有姓名相同者列報待查，不逕自認定」，
 * 但把結果做成 `limited: boolean` 時，「無法判定」與「確定不受限」會回同一個值，
 * 介面上顯示成「不受限」——那是在拿不確定的東西謊稱確定。缺出生日期而只有姓名
 * 與縣市相符時，必須明確回 `unknown` 並列報。
 */
export type TermLimitStatus = 'limited' | 'notLimited' | 'unknown';

export interface TermLimitResult {
  status: TermLimitStatus;
  reason: string;
}

/** 地方公職人員選舉為四年一屆。 */
const TERM_YEARS = 4;

/** 把某年的當選者轉成任期紀錄。區代碼一律上溯到縣市——連任限制綁在縣市而非選區。 */
export function toTermRecords(year: number, winners: Candidate[]): TermRecord[] {
  return winners.map((w) => ({
    year,
    countyCode: countyCodeOf(w.areaCode),
    name: w.name,
    birthDate: w.birthDate,
  }));
}

/**
 * 縣市長是否已連任一次而不得再選（地方制度法第 55、56 條「連選得連任一次」）。
 *
 * 「同一人」不可只靠姓名：中選會資料同名者眾，把兩個同名的人合併計算，會誤判某人
 * 不能參選。以**姓名＋出生日期**認定，兩者皆同才算同一人。
 *
 * 「連任」須是連續兩屆。中間隔屆（2014 當選、2018 落選、2022 當選）不受限。
 *
 * 改制升格（如 2010 年縣市合併改制直轄市）不併入計算：改制後為新設地方自治團體，
 * 任期重新起算。此情形在 2018→2022 區間未發生，故此處不特別處理；日後若需處理，
 * 須以縣市代碼變動為判準，不可預設「合併計算」。
 *
 * 判定方式：把上一屆與上上屆各自判成三種可能，再合併（三種狀態見 TermLimitResult）。
 *   `yes`   該屆有同縣市、同姓名**且出生日期相同**的當選紀錄 → 確定是本人。
 *   `no`    該屆沒有同姓名的當選紀錄，或同姓名者的出生日期兩邊都在但不相同
 *           → 確定**不是**本人。出生日期不同是確定的不同人，不是不確定。
 *   `maybe` 有同姓名的當選紀錄，但其中一方缺出生日期 → 無從認定。
 *
 * 兩屆皆 `yes` → limited；任一屆為 `no` → notLimited（那一屆斷了，連任不成立）；
 * 其餘（有 maybe、沒有 no）→ unknown 並列報。回 notLimited 等於謊稱確定不受限。
 */
type YearVerdict = 'yes' | 'no' | 'maybe';

export function termLimited(
  person: { name: string; birthDate: string },
  history: TermRecord[],
  countyCode: string,
  upcomingYear: number,
): TermLimitResult {
  const prev = upcomingYear - TERM_YEARS;
  const before = prev - TERM_YEARS;
  const inCounty = history.filter((h) => h.countyCode === countyCode && h.name === person.name);

  const verdict = (year: number): YearVerdict => {
    const recs = inCounty.filter((h) => h.year === year);
    if (!recs.length) return 'no';
    if (person.birthDate && recs.some((h) => h.birthDate === person.birthDate)) return 'yes';
    if (recs.some((h) => !h.birthDate) || !person.birthDate) return 'maybe';
    return 'no';   // 同姓名但出生日期兩邊都在且都不同——確定的不同人
  };

  const vPrev = verdict(prev);
  const vBefore = verdict(before);

  if (vPrev === 'yes' && vBefore === 'yes') {
    return { status: 'limited', reason: `已連任一次（${before}、${prev} 當選），依地方制度法不得再選` };
  }
  if (vPrev === 'no' || vBefore === 'no') {
    return { status: 'notLimited', reason: '' };
  }
  const years = [[before, vBefore], [prev, vPrev]].filter(([, v]) => v === 'maybe').map(([y]) => y);
  return {
    status: 'unknown',
    reason: `${years.join('、')} 年同縣市有同姓名的當選紀錄，但缺出生日期，`
      + '無法確認是否同一人（本站原則：常見名寧缺勿錯，不逕自認定）',
  };
}

export interface SeatCount {
  partyCode: string;
  partyName: string;
  seats: number;
}

/**
 * 政黨席次統計，由多到少排序；席次相同時無黨籍排在具名政黨之後。
 *
 * 無黨籍照實計入：村里長與鄉鎮市民代表多數為無黨籍，把它併入「其他」或略去，
 * 會讓那幾層的政黨版圖看起來完全不是實情。
 * 代碼表查無的政黨也不丟棄——寧可顯示代號，也不要讓席次總數對不上。
 */
export function seatBreakdown(winners: Candidate[], parties: Map<string, string>): SeatCount[] {
  const n = new Map<string, number>();
  for (const w of winners) n.set(w.partyCode, (n.get(w.partyCode) ?? 0) + 1);
  return [...n.entries()]
    .map(([partyCode, seats]) => ({
      partyCode,
      partyName: parties.get(partyCode) ?? `未知政黨（代號 ${partyCode}）`,
      seats,
    }))
    .sort((a, b) => b.seats - a.seats
      || Number(a.partyCode === INDEPENDENT_PARTY_CODE) - Number(b.partyCode === INDEPENDENT_PARTY_CODE)
      || a.partyCode.localeCompare(b.partyCode));
}
