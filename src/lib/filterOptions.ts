import { normalizeParty } from './partyNames';
export { normalizeParty } from './partyNames';
// 共用選單順序：西部由北到南，接東部、離島；其他與未知地區放最後。
const REGION_ORDER = [
  '基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣',
  '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣',
  '臺東縣', '澎湖縣', '金門縣', '連江縣',
];
const regionRank = (name: string) => {
  const index = REGION_ORDER.indexOf(name.replace(/^台/, '臺'));
  return index < 0 ? REGION_ORDER.length : index;
};
export const compareRegions = (a: string, b: string) => regionRank(a) - regionRank(b) || a.localeCompare(b, 'zh-Hant');

/** 僅以本站收錄的現任公職計席次，候選人與離任者不計；同一人物不重複計數。 */
export function partiesBySeats(people: { id: string; party: string; officeType: string; departed: boolean }[]): string[] {
  const seats = new Map<string, Set<string>>();
  for (const person of people) {
    const party = normalizeParty(person.party);
    if (!seats.has(party)) seats.set(party, new Set());
    if (person.officeType !== 'candidate' && !person.departed) seats.get(party)!.add(person.id);
  }
  return [...seats.keys()].sort((a, b) => seats.get(b)!.size - seats.get(a)!.size || a.localeCompare(b, 'zh-Hant'));
}

/** 各頁只列可篩選政黨，順序沿用完整名冊的席次，不受捐贈筆數或分批載入影響。 */
export function orderPartyOptions(parties: string[], seatOrder: string[]): string[] {
  const order = [...new Set(seatOrder.map(normalizeParty))];
  const rank = (party: string) => { const i = order.indexOf(party); return i < 0 ? order.length : i; };
  return [...new Set(parties.map(normalizeParty))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-Hant'));
}

/** 有明確年度者新到舊，同年依縣市、首長／議員排列；無年度的補選保留原名並置後。 */
export function compareElectionNames(a: string, b: string): number {
  const year = (name: string) => {
    const value = Number(name.match(/^(\d{2,4})年/)?.[1] ?? 0);
    return value && value < 1911 ? value + 1911 : value;
  };
  const region = (name: string) => name.match(/(?:\d年|屆)(.+?[縣市])/)?.[1] ?? '';
  const office = (name: string) => {
    const title = name.replace(/^\d{2,4}年/, '').slice(region(name).length);
    if (/立法委員/.test(name)) return 0;
    if (/^(?:縣長|市長)選舉$/.test(title)) return 1;
    if (/^議員/.test(title)) return 2;
    return 3;
  };
  return year(b) - year(a) || compareRegions(region(a), region(b)) || office(a) - office(b) || a.localeCompare(b, 'zh-Hant', { numeric: true });
}
