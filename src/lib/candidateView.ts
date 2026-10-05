// 2026 頁籤側欄要顯示哪些候選人。純函式：地圖的層級／選取狀態 + 已載入的 JSON → 顯示模式。
// 側欄元件只負責畫，不自己判斷層級與代碼換算。
import { isUnassignedVillage } from './mapTypes';
import type { ChiefRace, CountyCandidates, CouncilDistrict, NationalCandidates } from './candidateTypes';

type Level = 'national' | 'county' | 'town';
type AreaLite = { code: string; name: string };
type LayerLite = { parentName: string; areas: { code: string }[] };

export type SidebarCandidates =
  | { mode: 'nationalOverview'; municipalities: ChiefRace[]; others: { countyCode: string; countyName: string; count: number }[] }
  | { mode: 'chief'; race: ChiefRace | null; countyName: string }
  | { mode: 'county'; race: ChiefRace | null; county: CountyCandidates | null; highlight: CouncilDistrict | null; townNote: string | null }
  | { mode: 'town'; townName: string; district: CouncilDistrict | null; note: string | null };

/** 五段代碼的前兩段即縣市；鄉鎮、村里代碼都適用。 */
export const countyCodeOf = (code: string) => `${code.split('-').slice(0, 2).join('-')}-00-000-0000`;
export const townCodeOf = (code: string) => {
  const s = code.split('-');
  return `${s[0]}-${s[1]}-00-${s[3]}-0000`;
};

function firstRealCode(layer: LayerLite): string | null {
  return layer.areas.find((a) => !isUnassignedVillage(a))?.code ?? null;
}

export function focusCountyCode(level: Level, _area: AreaLite | null, layer: LayerLite): string | null {
  if (level === 'national') return null;
  const code = firstRealCode(layer);
  return code ? countyCodeOf(code) : null;
}

function districtOfTown(county: CountyCandidates, townCode: string): { district: CouncilDistrict | null; note: string | null } {
  if (county.townToDistrict === null) return { district: null, note: county.mappingNote };
  if (county.splitTowns.includes(townCode)) return { district: null, note: '此區分屬多個選區，請見下方選區列表。' };
  const no = county.townToDistrict[townCode];
  const district = no === undefined ? null : county.districts.find((d) => d.no === no) ?? null;
  return { district, note: district ? null : '查無此區所屬議員選區。' };
}

export function selectCandidates(
  level: Level, area: AreaLite | null, layer: LayerLite,
  national: NationalCandidates, county: CountyCandidates | null,
): SidebarCandidates {
  const raceOf = (code: string) => national.races.find((r) => r.countyCode === code) ?? null;

  if (level === 'national') {
    if (!area) {
      return {
        mode: 'nationalOverview',
        municipalities: national.races.filter((r) => r.isMunicipality),
        others: national.races.filter((r) => !r.isMunicipality)
          .map((r) => ({ countyCode: r.countyCode, countyName: r.countyName, count: r.candidates.length })),
      };
    }
    return { mode: 'chief', race: raceOf(countyCodeOf(area.code)), countyName: area.name };
  }

  const countyCode = focusCountyCode(level, area, layer);
  const race = countyCode ? raceOf(countyCode) : null;

  if (level === 'county') {
    if (!county || !area) return { mode: 'county', race, county, highlight: null, townNote: null };
    const { district, note } = districtOfTown(county, townCodeOf(area.code));
    return { mode: 'county', race, county, highlight: district, townNote: note };
  }

  const code = firstRealCode(layer);
  if (!county || !code) return { mode: 'town', townName: layer.parentName, district: null, note: null };
  const { district, note } = districtOfTown(county, townCodeOf(code));
  return { mode: 'town', townName: layer.parentName, district, note };
}
