// 選舉規則的判定。純函式，無 I/O。
import { INDEPENDENT_PARTY_CODE, countyCodeOf, type Candidate } from './cecVoteData';

export interface TermRecord {
  year: number;
  countyCode: string;
  name: string;
  birthDate: string;
}

export interface TermLimitResult {
  limited: boolean;
  reason: string;
}

/** 地方公職人員選舉為四年一屆。 */
const TERM_YEARS = 4;

/**
 * 還原 2018 年選舉資料匯出檔的 Excel 風格引號 CSV，使其成為與 2022 年相同的
 * 「無引號、純逗號分隔」格式，才能交給 parseElcand。
 *
 * 2018 年的 elcand.csv 每欄都以雙引號包住，代碼類欄位（省市別、縣市別、政黨代號、
 * 性別、出生日期等）還多了前導單引號（Excel 強制以文字讀入、避免 `005` 被讀成 `5`
 * 的慣用手法）。parseElcand 是依 2022 年無引號格式寫成的，直接以逗號切字串，若不先
 * 剝除引號，每個欄位都會多帶雙引號字元：區域代碼比對失敗，當選註記的判斷
 * `t(14) === '*'` 也會恆為 false（實際字串是 `"*"` 而非 `*`）——結果是「當選名單
 * 整批消失」而非報錯，非常隱蔽，若不特別處理會讓 2018 年的任期紀錄全數漏算，
 * 使連任限制判斷失真。2022 年的檔案本身無引號，對其套用此函式為 no-op，故可對
 * 兩年資料一視同仁地呼叫。
 */
export function stripLegacyCsvQuoting(csv: string): string {
  return csv.split('\n').map((line) => {
    if (!line.includes('"')) return line;
    const fields = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1].replace(/^'/, ''));
    return fields.join(',');
  }).join('\n');
}

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
 */
export function termLimited(
  person: { name: string; birthDate: string },
  history: TermRecord[],
  countyCode: string,
  upcomingYear: number,
): TermLimitResult {
  const years = new Set(history
    .filter((h) => h.name === person.name
      && h.birthDate === person.birthDate
      && h.countyCode === countyCode)
    .map((h) => h.year));
  const prev = upcomingYear - TERM_YEARS;
  const before = prev - TERM_YEARS;
  if (years.has(prev) && years.has(before)) {
    return { limited: true, reason: `已連任一次（${before}、${prev} 當選），依地方制度法不得再選` };
  }
  return { limited: false, reason: '' };
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
