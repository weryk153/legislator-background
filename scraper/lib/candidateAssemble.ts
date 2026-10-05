// 名冊列 → 前端讀的 JSON。純函式；I/O、比對器、政黨表都由呼叫端注入，方便測試。
import type { RegistrationRow } from './candidatePdf';
import type { RaceRef, LinkResult } from './candidateLinks';
import { reconcileCounty, type CountyDistrictRef } from './councilDistricts';
import { normalizeAreaName } from './areaMatch';
import {
  MUNICIPALITIES, type CandidateEntry, type CandidateSource, type ChiefRace, type CountyCandidates,
  type CouncilDistrict, type NationalCandidates,
} from '../../src/lib/candidateTypes';

export interface ReviewItem { name: string; race: string; reason: string; candidates: string[] }
export interface AssembleInput {
  source: CandidateSource;
  chiefRows: RegistrationRow[];
  councilRows: RegistrationRow[];
  countyOrder: { code: string; name: string }[];
  partyCode: (name: string) => string | null;
  link: (name: string, race: RaceRef) => LinkResult;
  identity: (slug: string) => string | null;
  districtRefs: Map<string, CountyDistrictRef>;
}

const COUNCIL_RE = /^(.{2}[縣市])第(\d+)選舉區$/;
const TYPE_SUFFIX = { plainIndigenous: '（平地原住民）', mountainIndigenous: '（山地原住民）', regional: '', unknown: '' } as const;
const isMunicipality = (n: string) => (MUNICIPALITIES as readonly string[]).includes(n);

/** 全部有號次就依號次；否則保持名冊列序（Array.prototype.sort 是穩定排序）。 */
function ordered(list: CandidateEntry[]): CandidateEntry[] {
  return list.every((c) => c.number !== null) ? [...list].sort((a, b) => a.number! - b.number!) : list;
}

export function assemble(input: AssembleInput) {
  const review: ReviewItem[] = [];
  const warnings: string[] = [];
  const unknownParties = new Set<string>();
  const codeOf = new Map(input.countyOrder.map((c) => [normalizeAreaName(c.name), c.code]));

  const entry = (r: RegistrationRow, race: RaceRef): CandidateEntry => {
    const link = input.link(r.name, race);
    if (link.kind === 'review') review.push({ name: r.name, race: race.district, reason: link.reason, candidates: link.candidates });
    const partyCode = input.partyCode(r.party);
    if (partyCode === null) unknownParties.add(r.party);
    return {
      name: r.name, partyName: r.party, partyCode, number: r.number, registeredOn: r.registeredOn,
      slug: link.slug, identity: link.slug ? input.identity(link.slug) : null,
    };
  };

  // 同一場選舉裡兩人不可能是同一個人：兩人以上連到同一檔案，必有一方連錯，
  // 無從判斷是誰，所以全部取消連結、交人工審核。
  const dedupeSlugs = (list: CandidateEntry[], race: string) => {
    const count = new Map<string, number>();
    for (const c of list) if (c.slug) count.set(c.slug, (count.get(c.slug) ?? 0) + 1);
    for (const c of list) {
      if (!c.slug || count.get(c.slug)! < 2) continue;
      review.push({ name: c.name, race, reason: `同一選舉兩位候選人連到同一檔案（${c.slug}）`, candidates: [c.slug] });
      c.slug = null;
      c.identity = null;
    }
  };

  // 首長
  const chiefBy = new Map<string, CandidateEntry[]>();
  for (const r of input.chiefRows) {
    const county = normalizeAreaName(r.district);
    if (!codeOf.has(county)) throw new Error(`首長名冊的選舉區「${r.district}」不是已知縣市`);
    const list = chiefBy.get(county) ?? chiefBy.set(county, []).get(county)!;
    list.push(entry(r, { kind: 'chief', county, district: county }));
  }
  for (const [county, list] of chiefBy) dedupeSlugs(list, county);

  // 六都優先只體現在順序；其餘依地圖檔（countyOrder）順序
  const order = [
    ...MUNICIPALITIES.map((n) => input.countyOrder.find((c) => normalizeAreaName(c.name) === n)!).filter(Boolean),
    ...input.countyOrder.filter((c) => !isMunicipality(normalizeAreaName(c.name))),
  ];
  const races: ChiefRace[] = order
    .filter((c) => chiefBy.has(normalizeAreaName(c.name)))
    .map((c) => {
      const name = normalizeAreaName(c.name);
      return { countyCode: c.code, countyName: name, isMunicipality: isMunicipality(name), candidates: ordered(chiefBy.get(name)!) };
    });
  const national: NationalCandidates = { source: input.source, races };

  // 議員
  const councilBy = new Map<string, Map<number, CandidateEntry[]>>();
  for (const r of input.councilRows) {
    const m = normalizeAreaName(r.district).match(COUNCIL_RE);
    if (!m) throw new Error(`議員名冊的選舉區格式無法辨識：「${r.district}」`);
    const [, county, noStr] = m;
    if (!codeOf.has(county)) throw new Error(`議員名冊的縣市「${county}」不是已知縣市`);
    const no = Number(noStr);
    const byNo = councilBy.get(county) ?? councilBy.set(county, new Map()).get(county)!;
    const list = byNo.get(no) ?? byNo.set(no, []).get(no)!;
    list.push(entry(r, { kind: 'council', county, district: `${county}第${no}選舉區` }));
  }
  for (const [county, byNo] of councilBy) {
    for (const [no, list] of byNo) dedupeSlugs(list, `${county}第${no}選舉區`);
  }
  const counties: CountyCandidates[] = order
    .filter((c) => councilBy.has(normalizeAreaName(c.name)))
    .map((c) => {
      const name = normalizeAreaName(c.name);
      const byNo = councilBy.get(name)!;
      const ref = input.districtRefs.get(name);
      const rec = reconcileCounty(ref, [...byNo.keys()]);
      if (!rec.confirmed) warnings.push(`${name}：選區對應未確認——${rec.reason}`);
      const districts: CouncilDistrict[] = [...byNo.keys()].sort((a, b) => a - b).map((no) => {
        const type = rec.confirmed ? ref!.districts.get(no)!.type : 'unknown';
        return { no, label: `第${no}選舉區${TYPE_SUFFIX[type]}`, type, candidates: ordered(byNo.get(no)!) };
      });
      let townToDistrict: Record<string, number> | null = null;
      if (rec.confirmed) {
        townToDistrict = {};
        for (const d of ref!.districts.values()) {
          if (d.type !== 'regional') continue;
          for (const t of d.townCodes) if (!ref!.splitTownCodes.has(t)) townToDistrict[t] = d.no;
        }
      }
      return {
        source: input.source, countyCode: c.code, countyName: name, districts, townToDistrict,
        splitTowns: rec.confirmed ? [...ref!.splitTownCodes].sort() : [],
        mappingNote: rec.confirmed ? null : `議員選區與 2022 年劃分不同（${rec.reason}），無法標示各鄉鎮市區所屬選區。`,
      };
    });

  for (const p of [...unknownParties].sort()) warnings.push(`政黨「${p}」不在 2022 政黨代碼表，前端將以「其他」配色`);
  return { national, counties, review, warnings };
}
