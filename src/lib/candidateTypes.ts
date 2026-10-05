// 2026 候選人資料的型別。scraper（產出）與前端（讀取）共用同一份，不各自宣告。

/** 議員選區類型。unknown：2026 選區與 2022 對不上，類型無從得知（見 spec §2.3）。 */
export type DistrictType = 'regional' | 'plainIndigenous' | 'mountainIndigenous' | 'unknown';

/** 縣市名 → 首長職稱：臺北市 → 臺北市長、宜蘭縣 → 宜蘭縣長。 */
export function chiefTitle(county: string): string {
  return county.endsWith('市') ? `${county.slice(0, -1)}市長` : `${county.slice(0, -1)}縣長`;
}
