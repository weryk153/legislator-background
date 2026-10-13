// 2022 參照先以名冊編號檢查可否沿用；編號相同不代表已核對 2026 正式範圍。
// 已人工核對的正式公告由 applyVerifiedDistricts 覆蓋，來源與範圍一併帶到前端。
import { splitCsvFields } from './cecVoteData';
import { normalizeAreaName } from './areaMatch';
import type { DistrictType, DistrictSource } from '../../src/lib/candidateTypes';

type KnownType = Exclude<DistrictType, 'unknown'>;
export interface DistrictRef { no: number; type: KnownType; townCodes: string[]; scope?: string }
export interface CountyDistrictRef { countyName: string; districts: Map<number, DistrictRef>; splitTownCodes: Set<string>; source?: DistrictSource }

export interface VerifiedDistricts {
  source: Omit<DistrictSource, 'pages'>;
  counties: { countyName: string; pages: number[]; districts: {
    no: number; type: string; scope: string; townNames: string[]; partialTownNames?: string[];
  }[] }[];
}

/** 正式公告覆蓋舊參照。地名須精確命中本縣市，部分行政區一律不做整區對應。 */
export function applyVerifiedDistricts(
  refs: Map<string, CountyDistrictRef>, data: VerifiedDistricts,
  townsByCounty: Map<string, { code: string; name: string }[]>,
): Map<string, CountyDistrictRef> {
  const result = new Map(refs);
  const seen = new Set<string>();
  for (const county of data.counties) {
    if (seen.has(county.countyName)) throw new Error(`公告縣市重複：${county.countyName}`);
    seen.add(county.countyName);
    const towns = townsByCounty.get(county.countyName);
    if (!towns) throw new Error(`公告縣市查無地圖：${county.countyName}`);
    const codeOf = (name: string) => {
      const matches = towns.filter(t => normalizeAreaName(t.name) === normalizeAreaName(name));
      if (matches.length !== 1) throw new Error(`公告地名無法唯一對應：${county.countyName}/${name}`);
      return matches[0].code;
    };
    const districts = new Map<number, DistrictRef>();
    const splitTownCodes = new Set<string>();
    const regional = new Map<string, number>();
    for (const d of county.districts) {
      if (!Number.isInteger(d.no) || d.no < 1 || districts.has(d.no) || !d.scope.trim()
        || !['regional', 'plainIndigenous', 'mountainIndigenous'].includes(d.type)) {
        throw new Error(`公告選區格式錯誤：${county.countyName}/${d.no}`);
      }
      for (const name of d.partialTownNames ?? []) {
        if (!d.townNames.includes(name)) throw new Error(`部分行政區未列於範圍：${name}`);
        splitTownCodes.add(codeOf(name));
      }
      const townCodes = d.townNames.map(codeOf);
      if (d.type === 'regional') for (const code of townCodes) {
        if (regional.has(code)) splitTownCodes.add(code);
        regional.set(code, d.no);
      }
      districts.set(d.no, { no: d.no, type: d.type as KnownType, townCodes, scope: d.scope });
    }
    if (!districts.size) throw new Error(`公告選區不得為空：${county.countyName}`);
    result.set(county.countyName, { countyName: county.countyName, districts, splitTownCodes,
      source: { ...data.source, pages: county.pages } });
  }
  return result;
}

/**
 * elbase 五段代碼：縣市(2)、縣市內碼(3)、選區(2)、鄉鎮市區(3)、村里(4)。
 * 縣市列：選區 00、鄉鎮 000；選區列：鄉鎮 000；鄉鎮列：村里 0000。
 * 地圖檔的鄉鎮代碼把選區段固定為 00（63-000-00-010-0000），故轉換時抹掉選區段。
 */
export function buildDistrictRefs(inputs: { type: KnownType; elbaseCsv: string }[]): Map<string, CountyDistrictRef> {
  const refs = new Map<string, CountyDistrictRef>();
  // 只看區域選區判斷切分：原住民選區本來就涵蓋全縣，與區域選區重疊是正常的
  const regionalTownDistricts = new Map<string, Set<number>>();

  for (const { type, elbaseCsv } of inputs) {
    const rows = elbaseCsv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map(splitCsvFields);
    const countyNames = new Map<string, string>();
    for (const r of rows) {
      if (r[0] !== '00' && r[2] === '00' && r[3] === '000' && r[4] === '0000') {
        countyNames.set(`${r[0]}-${r[1]}`, normalizeAreaName(r[5]));
      }
    }
    for (const r of rows) {
      if (r[2] === '00' || r[3] === '000' || r[4] !== '0000') continue;  // 只要鄉鎮列
      const countyName = countyNames.get(`${r[0]}-${r[1]}`);
      if (!countyName) throw new Error(`elbase 鄉鎮列找不到所屬縣市：${r.join(',')}`);
      const no = Number(r[2]);
      const townCode = `${r[0]}-${r[1]}-00-${r[3]}-0000`;
      const ref = refs.get(countyName)
        ?? refs.set(countyName, { countyName, districts: new Map(), splitTownCodes: new Set() }).get(countyName)!;
      const d = ref.districts.get(no) ?? ref.districts.set(no, { no, type, townCodes: [] }).get(no)!;
      if (d.type !== type) throw new Error(`${countyName}第${no}選舉區同時出現在 ${d.type} 與 ${type}`);
      if (!d.townCodes.includes(townCode)) d.townCodes.push(townCode);
      if (type === 'regional') {
        (regionalTownDistricts.get(townCode) ?? regionalTownDistricts.set(townCode, new Set()).get(townCode)!).add(no);
      }
    }
  }
  for (const ref of refs.values()) {
    for (const d of ref.districts.values()) {
      for (const t of d.townCodes) {
        if ((regionalTownDistricts.get(t)?.size ?? 0) > 1) ref.splitTownCodes.add(t);
      }
    }
  }
  return refs;
}

export function reconcileCounty(
  ref: CountyDistrictRef | undefined, nos2026: number[],
): { confirmed: boolean; reason: string | null } {
  if (!ref) return { confirmed: false, reason: '2022 資料查無此縣市的議員選區' };
  const a = [...ref.districts.keys()].sort((x, y) => x - y);
  const b = [...new Set(nos2026)].sort((x, y) => x - y);
  if (a.length === b.length && a.every((n, i) => n === b[i])) return { confirmed: true, reason: null };
  return {
    confirmed: false,
    reason: `${ref.source ? '2026 公告' : '2022'}有 ${a.length} 個選區、2026 名冊有 ${b.length} 個，選區編號不一致，須重新核對（可能已重劃）`,
  };
}
