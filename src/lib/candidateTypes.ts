// 2026 候選人資料的型別。scraper（產出）與前端（讀取）共用同一份，不各自宣告。
import type { Officeholder, TermLimitStatus } from './mapTypes';

/** 議員選區類型。unknown：2026 選區與 2022 對不上，類型無從得知（見 spec §2.3）。 */
export type DistrictType = 'regional' | 'plainIndigenous' | 'mountainIndigenous' | 'unknown';

/** 縣市名 → 首長職稱：臺北市 → 臺北市長、宜蘭縣 → 宜蘭縣長。 */
export function chiefTitle(county: string): string {
  return county.endsWith('市') ? `${county.slice(0, -1)}市長` : `${county.slice(0, -1)}縣長`;
}

export type CandidateStage = 'registration' | 'certified' | 'numbered' | 'announced';

/** 側欄底部的資料狀態列。名單會隨選務進度換版，讀者要知道眼前是哪一版。 */
export const STAGE_LABEL: Record<CandidateStage, string> = {
  registration: '中選會登記名冊（未經審定）',
  certified: '中選會審定名單（號次待抽籤）',
  numbered: '中選會審定名單（已抽籤定號次）',
  announced: '中選會公告候選人名單',
};

/** 六都，固定順序。版面上的「六都優先」只靠這個順序，不靠視覺加權。 */
export const MUNICIPALITIES = ['臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市'] as const;

export interface CandidateSource { stage: CandidateStage; url: string; tableDate: string }

export interface CandidateEntry {
  name: string;
  partyName: string;            // 名冊原文；無黨籍為「無」
  partyCode: string | null;     // null：2022 代碼表查無（新政黨），前端畫成「其他」，不可當無黨籍
  number: number | null;        // 號次，抽籤前為 null
  registeredOn: string;         // ISO
  slug: string | null;          // 站上檔案；無法確認是本人就是 null
  identity: string | null;      // 一行身分說明，如「現任臺北市長」
}

/**
 * 2022 選出、目前在任的首長，給 2026 側欄與靜態表做對照。資料來自地圖檔
 * public/data/map/national.json 的 chief（已含補選／重行選舉修正），建置期帶入，前端不另查。
 */
export type Incumbent2022 = Pick<Officeholder, 'name' | 'partyName' | 'partyCode' | 'slug'> & {
  termLimitStatus: TermLimitStatus; termLimitReason: string;
};

export interface ChiefRace {
  countyCode: string; countyName: string; isMunicipality: boolean; candidates: CandidateEntry[];
  incumbent2022: Incumbent2022 | null;   // 地圖檔查無首長（如尚未補選）時為 null
}
export interface NationalCandidates { source: CandidateSource; races: ChiefRace[] }

export interface CouncilDistrict { no: number; label: string; type: DistrictType; candidates: CandidateEntry[] }
export interface CountyCandidates {
  source: CandidateSource;
  countyCode: string;
  countyName: string;
  districts: CouncilDistrict[];
  /** 鄉鎮市區代碼（地圖檔格式）→ 區域選區編號。選區對應未確認的縣市為 null。 */
  townToDistrict: Record<string, number> | null;
  /** 分屬多個區域選區的鄉鎮市區，不放進 townToDistrict。 */
  splitTowns: string[];
  /** 對應未確認的原因，給側欄顯示。 */
  mappingNote: string | null;
}

/**
 * 2026 九合一選務時程（中選會公告）。/elections 頁的時程軸用這份畫節點，並以建置當天
 * 標出目前位置。區間節點（登記、公告）以 start～end 表示；單日節點 start === end。
 * 審定名單的日期是「最晚於此日前」審定，故 dateText 寫「前」，判斷已過與否仍以該日為準。
 * 公告名單分兩天：直轄市長 11/12、其餘選舉 11/17，當成一個區間節點。
 */
export interface ElectionMilestone {
  key: string;
  label: string;
  start: string;      // ISO 日期
  end: string;        // ISO 日期；單日節點與 start 相同
  dateText: string;   // 顯示用
}

export const ELECTION_MILESTONES: readonly ElectionMilestone[] = [
  { key: 'registration', label: '候選人登記', start: '2026-08-31', end: '2026-09-04', dateText: '8/31～9/4' },
  { key: 'certified', label: '審定候選人名單', start: '2026-10-16', end: '2026-10-16', dateText: '10/16 前' },
  { key: 'numbered', label: '抽籤定號次', start: '2026-10-23', end: '2026-10-23', dateText: '10/23' },
  { key: 'announced', label: '公告候選人名單', start: '2026-11-12', end: '2026-11-17', dateText: '11/12（直轄市長）・11/17（其餘）' },
  { key: 'vote', label: '投票', start: '2026-11-28', end: '2026-11-28', dateText: '11/28' },
];

/** done：已過；current：今天正落在該節點（含區間節點的期間內）；upcoming：未到。 */
export type MilestoneState = 'done' | 'current' | 'upcoming';

export interface TimelineProgress {
  states: MilestoneState[];
  /**
   * 「今天」標記要畫在第 i 個節點之後（i = -1 表示畫在第一個節點之前）。
   * 今天正逢某節點（該節點為 current）時為 null——節點本身已標出目前位置，不另畫標記。
   */
  todayAfter: number | null;
}

/** 給定今天（ISO 日期），算出各節點狀態與「今天」標記的位置。ISO 日期字串可直接比大小。 */
export function timelineProgress(milestones: readonly ElectionMilestone[], today: string): TimelineProgress {
  const states = milestones.map((m): MilestoneState =>
    today > m.end ? 'done' : today >= m.start ? 'current' : 'upcoming');
  if (states.includes('current')) return { states, todayAfter: null };
  return { states, todayAfter: states.lastIndexOf('done') };
}

/** 建置當天的臺灣日期（ISO）。建置機器可能在 UTC，不能直接取 toISOString() 的日期。 */
export function taipeiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(now);
}
