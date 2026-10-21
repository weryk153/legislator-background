import type { AssetCategory, GraphData, Official, OfficeType } from './types';
import { normalizeNameChars } from './nameVariant';
import { normalizeParty, partiesBySeats, compareElectionNames } from './filterOptions';

export const RANKING_METRICS = [
  { id: 'deposit', label: '申報存款', group: '財產申報', unit: '元', section: 'assets', note: '依所選申報年度的存款金額排序。包含申報表收錄範圍，並非個人可支配現金。' },
  { id: 'securities', label: '申報有價證券', group: '財產申報', unit: '元', section: 'assets', note: '依申報有價證券金額排序，並非目前市值。' },
  { id: 'investment', label: '申報事業投資', group: '財產申報', unit: '元', section: 'assets', note: '依申報事業投資金額排序，並非目前市值。' },
  { id: 'debt', label: '申報債務', group: '財產申報', unit: '元', section: 'assets', note: '依申報債務金額排序；債務不等於淨資產或償債能力。' },
  { id: 'land', label: '申報土地筆數', group: '財產申報', unit: '筆', section: 'assets', note: '僅統計明確以筆數收錄的土地，不代表面積、持分或市值。' },
  { id: 'building', label: '申報建物筆數', group: '財產申報', unit: '筆', section: 'assets', note: '僅統計明確以筆數收錄的建物，不代表完整戶數、持分或市值。' },
  { id: 'income', label: '政治獻金收入', group: '政治獻金', unit: '元', section: 'donations', note: '比較同一場選舉的申報總收入，包含申報中的各類收入。' },
  { id: 'expense', label: '政治獻金支出', group: '政治獻金', unit: '元', section: 'donations', note: '比較同一場選舉的申報總支出。' },
  { id: 'corporate', label: '營利事業捐贈', group: '政治獻金', unit: '元', section: 'donations', note: '採申報收支科目的營利事業捐贈收入，不以部分大額捐贈名單推算。' },
  { id: 'corporateShare', label: '營利事業捐贈占比', group: '政治獻金', unit: '%', section: 'donations', note: '營利事業捐贈收入 ÷ 申報總收入；總收入為零或分類資料不明者不列入。' },
  { id: 'judgments', label: '收錄有罪判決筆數', group: '判決與爭議', unit: '筆', section: 'judgments', note: '依本站收錄的有罪判決紀錄計數，包含未定讞判決；不代表獨立案件數或違法程度，未定讞者受無罪推定保障。' },
  { id: 'finalJudgments', label: '收錄已定讞判決筆數', group: '判決與爭議', unit: '筆', section: 'judgments', note: '僅統計本站標示已定讞的有罪判決紀錄，不代表完整司法紀錄。' },
  { id: 'controversies', label: '收錄爭議筆數', group: '判決與爭議', unit: '筆', section: 'reports', note: '依本站收錄條目計數，一筆可能涵蓋多個事件，也可能包含不起訴、無罪或已澄清事件；不代表事件嚴重程度或違法。' },
  { id: 'connections', label: '收錄直接關係數', group: '人物關係', unit: '個對象', section: 'relations', note: '計算圖中有來源的直接相連人物或組織；同一對象的多種關係只計一次，不代表權力、影響力或親密程度。' },
] as const;
export type RankingMetric = typeof RANKING_METRICS[number]['id'];
export const rankingMetric = (id: string) => RANKING_METRICS.find(m => m.id === id) ?? RANKING_METRICS[0];
const assetKeys = ['deposit', 'securities', 'investment', 'debt', 'land', 'building'] as const;
type AssetMetric = typeof assetKeys[number];
export interface RankingPerson {
  id: string; slug: string; name: string; party: string; officeType: OfficeType;
  district: string; region: string; departed: boolean;
  assets: { year: number; values: Record<AssetMetric, number | null> }[];
  donations: { election: string; income: number | null; expense: number | null; corporate: number | null; corporateShare: number | null }[];
  judgments: number | null; finalJudgments: number | null; controversies: number | null; connections: number | null;
}
export interface RankingQuery {
  metric: RankingMetric; period: string; office: string; region: string; party: string; search: string; order: 'desc' | 'asc';
}
export const DEFAULT_RANKING_QUERY: RankingQuery = {
  metric: 'deposit', period: 'latest', office: '', region: '', party: '', search: '', order: 'desc',
};
export interface RankedPerson {
  id: string; slug: string; name: string; party: string; officeType: OfficeType;
  district: string; departed: boolean; value: number; period: string; rank: number;
}
export interface RankingResult { rows: RankedPerson[]; scopeCount: number; eligibleCount: number; excludedCount: number; }
const validAmount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** 依本站收錄的現任公職人數排序；參選人與離任者不計席次，零席政黨仍可篩選。 */
export function rankingParties(people: RankingPerson[]): string[] {
  return partiesBySeats(people);
}

export function buildRankingPeople(officials: Official[], graph: GraphData): RankingPerson[] {
  const nodes = new Set(graph.nodes.map(n => n.key));
  const neighbors = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!edge.sourceUrl || edge.source === edge.target || !nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    for (const [a, b] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      neighbors.get(a)!.add(b);
    }
  }
  return officials.map(o => ({
    id: o.id, slug: o.slug, name: o.name, party: normalizeParty(o.party), officeType: o.officeType,
    district: o.district, region: o.district.match(/^(.+?[縣市])/)?.[1] ?? '其他',
    departed: o.officeType !== 'candidate' && (!o.isIncumbent || !!o.departedReason),
    assets: o.assets.map(a => ({
      year: a.year,
      values: Object.fromEntries(assetKeys.map(key => {
        const items = a.items.filter(i => i.category === (key as AssetCategory));
        const isCount = key === 'land' || key === 'building';
        // An absent category is unknown, not zero. Never mix monetary amounts and counts.
        const usable = items.length > 0 && items.every(i => validAmount(i.amount) && (isCount ? i.label === 'count' && Number.isInteger(i.amount) : i.label !== 'count'));
        return [key, usable ? items.reduce((sum, i) => sum + i.amount, 0) : null];
      })) as Record<AssetMetric, number | null>,
    })).sort((a, b) => b.year - a.year),
    donations: o.donations.map(d => {
      // Multiple versions of one report cannot safely be added or chosen by array order.
      const unique = o.donations.filter(other => other.electionName === d.electionName).length === 1;
      const personalAccount = !(o.officeType === 'legislator' && /不分區|全國/.test(o.district));
      const income = unique && personalAccount && validAmount(d.totalIncome) ? d.totalIncome : null;
      const expense = unique && personalAccount && validAmount(d.totalExpense) ? d.totalExpense : null;
      const rawCorporate = d.incomeByType['營利事業捐贈收入'];
      const corporate = unique && personalAccount && validAmount(rawCorporate) ? rawCorporate : null;
      return { election: d.electionName, income, expense, corporate,
        corporateShare: income !== null && income > 0 && corporate !== null && corporate <= income ? corporate / income * 100 : null };
    }),
    judgments: o.judgments.length || null,
    finalJudgments: o.judgments.length ? o.judgments.filter(j => j.isFinal).length : null,
    controversies: o.controversies.length || null,
    connections: neighbors.get(`official:${o.id}`)?.size ?? null,
  }));
}

export function rankingPeriods(people: RankingPerson[], metric: RankingMetric): string[] {
  const group = rankingMetric(metric).group;
  if (group === '財產申報') return ['latest', ...[...new Set(people.flatMap(p => p.assets.map(a => String(a.year))))].sort((a,b) => Number(b)-Number(a))];
  if (group === '政治獻金') return [...new Set(people.flatMap(p => p.donations.map(d => d.election)))].sort(compareElectionNames);
  return ['all'];
}
export function queryRankings(people: RankingPerson[], q: RankingQuery): RankingResult {
  const scope = people.filter(p => (!q.office || p.officeType === q.office) && (!q.region || p.region === q.region) && (!q.party || p.party === q.party));
  const metric = rankingMetric(q.metric);
  const eligible: Omit<RankedPerson, 'rank'>[] = [];
  for (const p of scope) {
    let value: number | null = null;
    let period = '本站收錄紀錄';
    if (metric.group === '財產申報') {
      const a = q.period === 'latest' ? p.assets[0] : p.assets.find(a => String(a.year) === q.period);
      value = a?.values[q.metric as AssetMetric] ?? null;
      if (a) period = `${a.year} 年申報`;
    } else if (metric.group === '政治獻金') {
      const d = p.donations.find(d => d.election === q.period);
      value = d?.[q.metric as 'income' | 'expense' | 'corporate' | 'corporateShare'] ?? null;
      if (d) period = d.election;
    } else {
      value = p[q.metric as 'judgments' | 'finalJudgments' | 'controversies' | 'connections'];
    }
    if (value === null || !Number.isFinite(value)) continue;
    eligible.push({ id: p.id, slug: p.slug, name: p.name, party: p.party, officeType: p.officeType, district: p.district, departed: p.departed, value, period });
  }
  const direction = q.order === 'asc' ? 1 : -1;
  eligible.sort((a,b) => direction * (a.value - b.value) || a.name.localeCompare(b.name, 'zh-Hant') || a.id.localeCompare(b.id));
  let rank = 0;
  const ranked = eligible.map((row,index) => {
    if (!index || row.value !== eligible[index-1].value) rank = index + 1;
    return { ...row, rank };
  });
  const needle = normalizeNameChars(q.search.trim());
  return { rows: ranked.filter(r => normalizeNameChars(r.name).includes(needle)), scopeCount: scope.length,
    eligibleCount: eligible.length, excludedCount: scope.length - eligible.length };
}

export function rankingQueryFromParams(params: URLSearchParams, people: RankingPerson[]): RankingQuery {
  const metric = rankingMetric(params.get('metric') ?? '').id;
  const periods = rankingPeriods(people, metric);
  const period = params.get('period') ?? '';
  const member = (key: string, values: string[]) => values.includes(params.get(key) ?? '') ? params.get(key)! : '';
  const party = normalizeParty(params.get('party') ?? '');
  return { metric, period: periods.includes(period) ? period : periods[0] ?? 'all',
    office: member('office', people.map(p=>p.officeType)), region: member('region', people.map(p=>p.region)),
    party: people.some(p => p.party === party) ? party : '', search: (params.get('search') ?? '').slice(0,100),
    order: params.get('order') === 'asc' ? 'asc' : 'desc' };
}
export function rankingQueryParams(q: RankingQuery): string {
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(q)) if (value) params.set(key,value);
  return params.toString();
}
export function formatRankingValue(value: number, metric: RankingMetric): string {
  return new Intl.NumberFormat('zh-Hant', { maximumFractionDigits: metric === 'corporateShare' ? 2 : 0 }).format(value);
}
