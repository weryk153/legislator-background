// 2022 議員選區參照：哪些鄉鎮市區屬於哪個選區、選區是區域還是原住民。
//
// 2026 名冊只寫「新北市第12選舉區」，不標類型也不列涵蓋範圍，只能拿 2022 的劃分
// 來補——但選區會重劃，故另有 reconcileCounty：2026 名冊的選區編號集合與 2022
// 完全相同才算確認，否則整個縣市標為未確認，前端不做鄉鎮市區 → 選區的對應。
import { splitCsvFields } from './cecVoteData';
import { normalizeAreaName } from './areaMatch';
import type { DistrictType } from '../../src/lib/candidateTypes';

type KnownType = Exclude<DistrictType, 'unknown'>;
export interface DistrictRef { no: number; type: KnownType; townCodes: string[] }
export interface CountyDistrictRef { countyName: string; districts: Map<number, DistrictRef>; splitTownCodes: Set<string> }

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
    reason: `2022 有 ${a.length} 個選區、2026 名冊有 ${b.length} 個，選區可能已重劃`,
  };
}
