// /elections 頁「參選概況」與六都卡片的統計。全部是純函式，建置期在 elections.astro 呼叫，
// 單元測試見 test/candidateStats.test.ts。
//
// 中立原則：這裡只算數字，不排名、不評分。頁面上所有候選人同版型呈現，
// 排序一律依中選會名冊（有號次時依號次），不依政黨或筆數。
import type { Official } from './types';
import { PARTY_VAR } from './mapTypes';
import type { CandidateEntry, ChiefRace, CountyCandidates, NationalCandidates } from './candidateTypes';

/** 現任縣市長爭取連任：候選人連到的檔案即 2022 當選、目前在任的首長。 */
export function isChiefReelect(c: CandidateEntry, race: ChiefRace): boolean {
  return !!c.slug && c.slug === race.incumbent2022?.slug;
}

/** 現任議員爭取連任：名冊身分說明以「現任議員」開頭（含新竹縣這類選區重劃後換編號者）。 */
export function isCouncilReelect(c: CandidateEntry): boolean {
  return !!c.identity?.startsWith('現任議員');
}

export interface CandidateOverview {
  chiefCount: number;
  councilCount: number;
  chiefReelect: number;
  councilReelect: number;
  /** 2022 當選者依法不得連任的縣市名，依名冊縣市順序。 */
  termLimited: string[];
}

export function candidateOverview(national: NationalCandidates, councils: CountyCandidates[]): CandidateOverview {
  const councilCands = councils.flatMap((co) => co.districts.flatMap((d) => d.candidates));
  return {
    chiefCount: national.races.reduce((n, r) => n + r.candidates.length, 0),
    councilCount: councilCands.length,
    chiefReelect: national.races.reduce((n, r) => n + r.candidates.filter((c) => isChiefReelect(c, r)).length, 0),
    councilReelect: councilCands.filter(isCouncilReelect).length,
    termLimited: national.races.filter((r) => r.incumbent2022?.termLimitStatus === 'limited').map((r) => r.countyName),
  };
}

export interface PartyBar {
  key: string;          // 政黨代碼；無黨籍為 'none'，新政黨合併為 'other'
  label: string;
  cssVar: string;       // 政黨色 CSS 變數名
  count: number;
  /** 僅 'other'：併入的各政黨名與人數，依人數排序。 */
  parties?: { name: string; count: number }[];
}

const byCountThenName = <T extends { count: number }>(name: (x: T) => string) => (a: T, b: T) =>
  b.count - a.count || name(a).localeCompare(name(b), 'zh-Hant');

/**
 * 各黨提名人數。
 *   無黨籍（名冊「無」）單獨一條，用 --party-none。
 *   partyCode 為 null（2022 代碼表查無的新政黨）合併成「其他政黨」一條，並列出黨名。
 *   其餘依政黨代碼各一條，色彩查 PARTY_VAR，查無者用 --party-other（與地圖、圖例同規則）。
 * 依人數由多到少排序，同數依名稱。
 */
export function partyTally(cands: CandidateEntry[]): PartyBar[] {
  const bars = new Map<string, PartyBar>();
  const others = new Map<string, number>();
  for (const c of cands) {
    if (c.partyName === '無' || c.partyCode === '999') {
      const b = bars.get('none') ?? { key: 'none', label: '無黨籍', cssVar: '--party-none', count: 0 };
      b.count++; bars.set('none', b);
    } else if (c.partyCode === null) {
      others.set(c.partyName, (others.get(c.partyName) ?? 0) + 1);
    } else {
      const b = bars.get(c.partyCode)
        ?? { key: c.partyCode, label: c.partyName, cssVar: PARTY_VAR[c.partyCode] ?? '--party-other', count: 0 };
      b.count++; bars.set(c.partyCode, b);
    }
  }
  if (others.size > 0) {
    const parties = [...others].map(([name, count]) => ({ name, count })).sort(byCountThenName((p) => p.name));
    bars.set('other', {
      key: 'other', label: '其他政黨', cssVar: '--party-other',
      count: parties.reduce((n, p) => n + p.count, 0), parties,
    });
  }
  return [...bars.values()].sort(byCountThenName((b) => b.label));
}

/** 名冊順序：全部抽完號次才依號次排，否則維持中選會名冊順序。不改動原陣列。 */
export function orderCandidates(cands: CandidateEntry[]): CandidateEntry[] {
  return cands.every((c) => c.number !== null)
    ? [...cands].sort((a, b) => (a.number as number) - (b.number as number))
    : [...cands];
}

export interface RecordCounts { careers: number; judgments: number; controversies: number; donations: number }

/** 站上檔案的各類筆數；沒有檔案時回 null（頁面顯示「本站尚無檔案」，不顯示 0）。 */
export function recordCounts(
  o: Pick<Official, 'careers' | 'judgments' | 'controversies' | 'donations'> | undefined,
): RecordCounts | null {
  if (!o) return null;
  return {
    careers: o.careers.length, judgments: o.judgments.length,
    controversies: o.controversies.length, donations: o.donations.length,
  };
}
