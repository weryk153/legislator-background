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
