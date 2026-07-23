// ardata 專戶 → officials 身分比對。寧缺勿錯：只在「姓名完全相等 + 選舉類型與
// office_type 一致 + 縣市（或原住民地區）一致 + 現任 + 唯一」時 matched；
// 其餘 none/ambiguous 進 review 清單。
export interface OfficialLite {
  id: string; name: string;
  office_type: 'legislator' | 'mayor_magistrate' | 'councilor';
  district: string; is_incumbent: boolean;
}

export type MatchResult =
  | { status: 'matched'; officialId: string }
  | { status: 'none' | 'ambiguous'; reason: string };

/** 從 ardata 選舉名稱推公職類型；認不出（總統、鄉鎮市長/村里長等）回 null。 */
export function officeTypeOfElection(electionName: string): OfficialLite['office_type'] | null {
  const s = electionName ?? '';
  if (/立法委員/.test(s)) return 'legislator';
  if (/議員/.test(s)) return 'councilor';
  // 市長/縣長選舉：CSV 內實際欄位是 per-city 格式（「111年臺北市市長選舉」
  // 「111年南投縣縣長選舉」），與平台下載檔名的舊格式（「111年直轄市市長選舉」）不同，
  // 後者恰好也落在同一 $-錨點規則內所以一併涵蓋。$-錨點加上「鄉(鎮、市)長選舉」
  // 「村(里)長選舉」的括號，使「市)長選舉」「里)長選舉」等非本站範圍的職務自然被排除；
  // 「XX市長補選」「XX市市長補選」等鄉鎮市長補選則因結尾是「補選」而非「選舉」被排除。
  if (/(市長|縣長)選舉$/.test(s)) return 'mayor_magistrate';
  return null;
}

// 22 縣市（依常見全名列出，用於從選舉名稱/area 反推地區）。
const CITY_NAMES = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '宜蘭縣',
  '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣',
  '屏東縣', '臺東縣', '花蓮縣', '澎湖縣', '金門縣', '連江縣',
];
const CITY_RE = new RegExp(CITY_NAMES.join('|'));
const ABORIGINAL_AREAS = ['平地原住民', '山地原住民'];

export function matchAccount(
  account: { name: string; electionName: string; area?: string },
  officials: OfficialLite[],
): MatchResult {
  const office = officeTypeOfElection(account.electionName);
  if (!office) return { status: 'none', reason: `選舉類型不明: ${account.electionName}` };
  let pool = officials.filter(
    (o) => o.is_incumbent && o.name === account.name && o.office_type === office,
  );

  // 縣市一致性：姓名撞名時，選舉名稱（或找不到就退回 area）內含的縣市須與 district 前綴一致，
  // 否則不同縣市的同名者會被誤掛。
  const cityInName = account.electionName.match(CITY_RE)?.[0];
  const city = cityInName ?? (account.area && CITY_NAMES.includes(account.area) ? account.area : undefined);
  if (city) pool = pool.filter((o) => o.district.startsWith(city));

  // 原住民選舉區：electionName 本身不含縣市（如「113年立法委員選舉」），須靠 area 判斷。
  if (account.area && ABORIGINAL_AREAS.includes(account.area)) {
    pool = pool.filter((o) => o.district.includes(account.area!));
  }

  if (pool.length === 1) return { status: 'matched', officialId: pool[0].id };
  if (pool.length === 0) return { status: 'none', reason: '查無同名現任者' };
  return {
    status: 'ambiguous',
    reason: `同名同職類 ${pool.length} 人: ${pool.map((h) => h.district).join(' / ')}`,
  };
}
