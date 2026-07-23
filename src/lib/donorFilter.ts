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

/** 是否有任一政黨/職務篩選啟用。 */
export function hasActiveFilter(q: Pick<DonorFilterQuery, 'party' | 'officeType'>): boolean {
  return Boolean(q.party || q.officeType);
}

/**
 * 判斷單一受贈者是否符合政黨/職務篩選。
 * 無篩選時一律視為符合（含落選人）；篩選啟用時，落選人（slug 為 null）一律排除。
 */
export function matchRecipient(r: Recipient, q: Pick<DonorFilterQuery, 'party' | 'officeType'>): boolean {
  if (!hasActiveFilter(q)) return true;
  if (!r.slug) return false;
  if (q.party && r.party !== q.party) return false;
  if (q.officeType && r.officeType !== q.officeType) return false;
  return true;
}

/**
 * 依篩選條件計算單一捐贈者的展示子集合。
 * 無篩選時回傳原始受贈者陣列／原始總額（與現行行為一致）；
 * 篩選啟用時只列符合條件之受贈者，人數與總額皆以子集合重新計算。
 */
export function donorView(d: Donor, q: Pick<DonorFilterQuery, 'party' | 'officeType'>): DonorView {
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
