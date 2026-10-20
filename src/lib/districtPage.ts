import type { CouncilDistrict } from './candidateTypes';
import type { ElectionDistrictArea } from './electionFinder';

/** 選區編號來自該屆名冊，原住民選區也沿用正式編號，不由行政區名稱猜測。 */
export function districtPagePath(countyKey: string, districtNo: number): string {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(countyKey) || !Number.isSafeInteger(districtNo) || districtNo < 1) {
    throw new Error('無效的縣市或選區編號');
  }
  return `/elections/2026/${countyKey}/district-${districtNo}/`;
}

export const districtPageHeading = (county: string, district: Pick<CouncilDistrict, 'label'>): string =>
  `2026 ${county}${district.label}議員候選人`;

export function districtAreaSummary(area: ElectionDistrictArea): string {
  if (area.scope && area.source) return `公告範圍：${area.scope}`;
  if (area.towns.length) return `行政區參考（2022 對照）：${area.towns.join('、')}`;
  return area.note ?? '行政區對照待確認';
}

export function districtPageDescription(county: string, district: CouncilDistrict, area: ElectionDistrictArea): string {
  const scope = area.scope && area.source ? area.scope
    : area.towns.length ? `${area.towns.join('、')}（行政區參考，2026 範圍以公告為準）` : '';
  const tail = `共 ${district.candidates.length} 人，整理學歷、經歷與公開資料來源，附名單階段及查核日期。`;
  const prefix = `${districtPageHeading(county, district)}。`;
  return prefix + (scope && prefix.length + scope.length + tail.length < 155 ? `${scope}。` : '') + tail;
}
