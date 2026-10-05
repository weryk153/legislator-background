// 2026 縣市選舉頁（src/pages/elections/2026/[county].astro）的組字與資料整理。
// 全部是純函式，建置期呼叫，單元測試見 test/countyPage.test.ts。
import { chiefTitle, type CouncilDistrict } from './candidateTypes';

/** h1：「2026 新北市長與新北市議員選舉候選人」。 */
export const countyPageHeading = (county: string): string =>
  `2026 ${chiefTitle(county)}與${county}議員選舉候選人`;

/** <title>：「2026 新北市長候選人與新北市議員候選人名單｜政治人物背景」。 */
export const countyPageTitle = (county: string): string =>
  `2026 ${chiefTitle(county)}候選人與${county}議員候選人名單｜政治人物背景`;

/** /elections 的 ItemList 與頁尾連結用的選舉名稱：「2026 新北市長與新北市議員選舉」。 */
export const countyRaceName = (county: string): string =>
  `2026 ${chiefTitle(county)}與${county}議員選舉`;

/** 搜尋結果摘要約顯示 160 字，超過就截掉縣市長姓名。 */
export const DESCRIPTION_MAX = 160;

/**
 * meta description：「2026 {縣市}長候選人：甲、乙；{縣市}議員 N 個選區、M 位候選人名單，附…」。
 * 全列超過上限時只列前 6 位＋「等 n 人」（n 為縣市長候選人總數）；
 * 若仍超過（登記姓名極長時），再逐一減少列出的人數，至少列 1 位。
 */
export function countyPageDescription(
  county: string, chiefNames: string[], districtCount: number, councilCount: number, max = DESCRIPTION_MAX,
): string {
  const tail = `；${county}議員 ${districtCount} 個選區、${councilCount} 位候選人名單，附候選人經歷、判決、爭議與政治獻金。`;
  const build = (names: string) => `2026 ${chiefTitle(county)}候選人：${names}${tail}`;
  const full = build(chiefNames.join('、'));
  if (full.length <= max || chiefNames.length <= 1) return full;
  for (let k = Math.min(6, chiefNames.length - 1); k >= 1; k--) {
    const s = build(`${chiefNames.slice(0, k).join('、')}等 ${chiefNames.length} 人`);
    if (s.length <= max || k === 1) return s;
  }
  return full; // 不會走到：上面迴圈在 k === 1 時必定回傳
}

/**
 * townToDistrict（鄉鎮市區代碼 → 區域選區編號）反查成「選區編號 → 鄉鎮市區名稱」。
 * 名稱依鄉鎮市區代碼排序（即內政部行政區順序）；地圖檔查不到名稱的代碼略過。
 * townToDistrict 為 null（選區對應未確認）時回空 Map。
 */
export function districtTowns(
  townToDistrict: Record<string, number> | null, townNames: Map<string, string>,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (!townToDistrict) return out;
  for (const code of Object.keys(townToDistrict).sort()) {
    const name = townNames.get(code);
    if (!name) continue;
    const no = townToDistrict[code];
    out.set(no, [...(out.get(no) ?? []), name]);
  }
  return out;
}

/** 選區分兩組：區域（含類型未知者）與原住民（平地／山地）。各組維持名冊順序。 */
export function groupDistricts(districts: CouncilDistrict[]): { regional: CouncilDistrict[]; indigenous: CouncilDistrict[] } {
  const isIndigenous = (d: CouncilDistrict) => d.type === 'plainIndigenous' || d.type === 'mountainIndigenous';
  return { regional: districts.filter((d) => !isIndigenous(d)), indigenous: districts.filter(isIndigenous) };
}
