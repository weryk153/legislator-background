import { normalizeNameChars } from './nameVariant';

export type Recipient = {
  name: string;
  election: string;
  amount: number;
  slug: string | null;
  party: string | null;
  officeType: string | null;
};

export type Donor = { uid: string; name: string; total: number; recipients: Recipient[] };

export type Official = {
  name: string;
  slug: string;
  party: string;
  officeType: string;
  district: string;
  totalIncome: number;
};

export type DonorSort = 'count' | 'total';

export interface DonorFilterQuery {
  party?: string;
  officeType?: string;
  election?: string;
  sort?: DonorSort;
}

export interface DonorView {
  recipients: Recipient[];
  count: number;
  total: number;
  filtered: boolean;
}

export interface RankedDonor {
  donor: Donor;
  view: DonorView;
}

type FilterFields = Pick<DonorFilterQuery, 'party' | 'officeType' | 'election'>;

/** 是否有任一政黨/職務/選舉篩選啟用。 */
export function hasActiveFilter(q: FilterFields): boolean {
  return Boolean(q.party || q.officeType || q.election);
}

/** 是否有政黨/職務（身分類）篩選啟用——落選人排除規則只受此類影響，選舉篩選單獨啟用不排除落選人。 */
function hasIdentityFilter(q: FilterFields): boolean {
  return Boolean(q.party || q.officeType);
}

/**
 * 判斷單一受贈者是否符合政黨/職務/選舉篩選（可 AND 組合）。
 * 無任何篩選時一律視為符合（含落選人）。
 * 選舉篩選單獨啟用時不排除落選人，僅比對 electionGroup(r.election) 是否等於篩選之粗分類；
 * 政黨/職務篩選啟用時，落選人（slug 為 null）一律排除。
 */
export function matchRecipient(r: Recipient, q: FilterFields): boolean {
  if (!hasActiveFilter(q)) return true;
  if (q.election && electionGroup(r.election) !== q.election) return false;
  if (hasIdentityFilter(q)) {
    if (!r.slug) return false;
    if (q.party && r.party !== q.party) return false;
    if (q.officeType && r.officeType !== q.officeType) return false;
  }
  return true;
}

/**
 * 依篩選條件計算單一捐贈者的展示子集合。
 * 無篩選時回傳原始受贈者陣列／原始總額（與現行行為一致）；
 * 篩選啟用時只列符合條件之受贈者，人數與總額皆以子集合重新計算。
 */
export function donorView(d: Donor, q: FilterFields): DonorView {
  const filtered = hasActiveFilter(q);
  const recipients = filtered ? d.recipients.filter((r) => matchRecipient(r, q)) : d.recipients;
  // 現任受贈人數：同一位現任只算一次
  const count = new Set(recipients.filter((r) => r.slug).map((r) => r.slug)).size;
  const total = filtered ? recipients.reduce((s, r) => s + r.amount, 0) : d.total;
  return { recipients, count, total, filtered };
}

function compareRanked(a: DonorView, b: DonorView, sort: DonorSort): number {
  return sort === 'total' ? b.total - a.total || b.count - a.count : b.count - a.count || b.total - a.total;
}

/**
 * 篩選＋排序捐贈者清單，回傳每筆連同其展示子集合。
 * minCount：現任人數門檻（排行榜用 2，一般搜尋預設不設門檻）；limit：結果上限。
 */
export function rankDonors(
  donors: Donor[],
  q: DonorFilterQuery,
  opts: { minCount?: number; limit?: number } = {},
): RankedDonor[] {
  const { minCount = 0, limit = Infinity } = opts;
  const sort = q.sort ?? 'count';
  return donors
    .map((donor) => ({ donor, view: donorView(donor, q) }))
    .filter((x) => x.view.count >= minCount)
    .sort((a, b) => compareRanked(a.view, b.view, sort))
    .slice(0, limit);
}

/** 政治人物搜尋結果套用政黨/職務篩選（依 official 本人屬性），排序固定依獻金總收入 desc；預設限 30 筆。 */
export function filterOfficials(
  officials: Official[],
  q: Pick<DonorFilterQuery, 'party' | 'officeType'>,
  opts: { limit?: number } = {},
): Official[] {
  const { limit = 30 } = opts;
  return officials
    .filter((o) => (!q.party || o.party === q.party) && (!q.officeType || o.officeType === q.officeType))
    .sort((a, b) => b.totalIncome - a.totalIncome)
    .slice(0, limit);
}

/** 從有連結受贈者（slug 非 null）動態收集 distinct 政黨，依出現次數降冪排序。 */
export function collectParties(donors: Donor[]): string[] {
  const counts = new Map<string, number>();
  for (const d of donors) {
    for (const r of d.recipients) {
      if (r.slug && r.party) counts.set(r.party, (counts.get(r.party) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([party]) => party);
}

/** 選舉粗分類固定順序（select 選項與 collectElectionGroups 皆依此排序）。 */
const ELECTION_GROUP_ORDER = ['立委選舉', '議員選舉', '縣市長選舉', '其他'] as const;

/**
 * 將選舉紀錄名稱（如「113年立法委員選舉」「第4屆臺中市議員補選」）分類為粗分類。
 * 依序判斷：含「立法委員」→立委選舉；含「議員」（含補選）→議員選舉；
 * 以「市長選舉」或「縣長選舉」結尾→縣市長選舉；否則→其他。
 */
export function electionGroup(name: string): string {
  if (name.includes('立法委員')) return '立委選舉';
  if (name.includes('議員')) return '議員選舉';
  if (/(市長|縣長)選舉$/.test(name)) return '縣市長選舉';
  return '其他';
}

/**
 * 依姓名比對候選字串是否符合查詢子字串（查詢與候選皆先以 normalizeNameChars 正規化異體字，
 * 如「姍/姗」「台/臺」），讓使用者輸入異體字仍能搜到正確寫法的資料，反之亦然。
 */
export function matchName(candidate: string, query: string): boolean {
  return normalizeNameChars(candidate).includes(normalizeNameChars(query));
}

/** 依（正規化後）姓名篩選政治人物清單。 */
export function filterOfficialsByName(officials: Official[], query: string): Official[] {
  return officials.filter((o) => matchName(o.name, query));
}

/**
 * 依（正規化後）名稱或統一編號篩選捐贈者清單。
 * 名稱比對套用異體字正規化；uid 前綴比對維持原始字串（統編為數字/固定格式，不涉異體字）。
 */
export function filterDonorsByName(donors: Donor[], query: string): Donor[] {
  return donors.filter((d) => matchName(d.name, query) || d.uid.startsWith(query));
}

/** 收集所有受贈紀錄（含未連結受贈者）出現過的選舉粗分類，依固定順序排列，只列有出現者。 */
export function collectElectionGroups(donors: Donor[]): string[] {
  const present = new Set<string>();
  for (const d of donors) {
    for (const r of d.recipients) {
      present.add(electionGroup(r.election));
    }
  }
  return ELECTION_GROUP_ORDER.filter((g) => present.has(g));
}
