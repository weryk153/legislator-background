// 名冊稽核核心邏輯（純函式，無 I/O、無 DB 寫入）。
// 見 docs/superpowers/specs/2026-07-23-roster-audit-design.md 「稽核邏輯」「邊界」。
//
// normalizeName / normalizeDistrict：比對鍵正規化（異體字、選區前導零）。
// diffRoster：CEC 整批當選名單 vs 站上現任名冊 → {missing, transferred, extra, near_miss}。

export type OfficeType = 'legislator' | 'mayor_magistrate' | 'councilor';

export type CecWinner = {
  office: OfficeType;
  name: string;
  district: string;
  party: string;
  election: string; // 資料來源標籤，如 "2022 T1(prv)"、"2024 區域立委"、"2024新竹縣議員第7選舉區缺額補選"
};

export type OfficialRecord = {
  id: string;
  name: string;
  office_type: OfficeType;
  district: string;
  party: string;
};

export type MissingEntry = { cec: CecWinner };
export type TransferredEntry = { cec: CecWinner; foundAs: OfficialRecord; vacatedDistrict: string };
export type ExtraEntry = { official: OfficialRecord; note?: string };
export type NearMissEntry = { cec: CecWinner; official: OfficialRecord };

export type DiffResult = {
  missing: MissingEntry[];
  transferred: TransferredEntry[];
  extra: ExtraEntry[];
  near_miss: NearMissEntry[];
};

// 異體字映射（保守：僅收設計文件列出的四組，避免誤合併不同姓名）。
// 姍↔姗、台↔臺、峯↔峰、恆↔恒 — 皆映射到慣用/繁體字形。
const VARIANT_MAP: Record<string, string> = {
  姗: '姍',
  台: '臺',
  峰: '峯',
  恒: '恆',
};

// 全形/半形間隔點變體（原住民姓名常見：族名．羅馬拼音）。比對時整段移除——
// 因站上與 CEC 對同一人有時以空白、有時以間隔點分隔羅馬拼音（如「鄭天財Sra Kacaw」
// vs CEC「鄭天財 Sra‧Kacaw」），只统一符號不足以比對成功，故連同空白一併移除。
const MIDDLE_DOTS = /[·・･．‧]/gu;

export function normalizeName(s: string): string {
  if (!s) return '';
  let out = s.normalize('NFC').replace(/\s+/gu, '').replace(MIDDLE_DOTS, '');
  out = Array.from(out).map((ch) => VARIANT_MAP[ch] ?? ch).join('');
  return out;
}

// 選區正規化：去前導零、統一「選區」/「選舉區」用字（CEC 113 年區域立委 elbase 用
// 「第01選區」，站上/CEC 議員用「第01選舉區」）。首長（無「第X選區」樣式）原樣返回（僅 trim）。
export function normalizeDistrict(s: string): string {
  if (!s) return '';
  const trimmed = s.trim();
  return trimmed.replace(/第0*(\d+)選舉?區/gu, '第$1選舉區');
}

function officeKey(office: OfficeType, name: string): string {
  return `${office}|${normalizeName(name)}`;
}

export function diffRoster(cecWinners: CecWinner[], officials: OfficialRecord[]): DiffResult {
  const officialsByOfficeName = new Map<string, OfficialRecord[]>();
  const officialsByName = new Map<string, OfficialRecord[]>();
  const cecByOfficeName = new Map<string, CecWinner[]>();

  for (const o of officials) {
    const ok = officeKey(o.office_type, o.name);
    (officialsByOfficeName.get(ok) ?? officialsByOfficeName.set(ok, []).get(ok)!).push(o);
    const nk = normalizeName(o.name);
    (officialsByName.get(nk) ?? officialsByName.set(nk, []).get(nk)!).push(o);
  }
  for (const w of cecWinners) {
    const ok = officeKey(w.office, w.name);
    (cecByOfficeName.get(ok) ?? cecByOfficeName.set(ok, []).get(ok)!).push(w);
  }

  const missing: MissingEntry[] = [];
  const transferred: TransferredEntry[] = [];

  // 轉任偵測分兩階段：先收集每位「同姓名、換職務」候選官員被幾筆 CEC 當選人聲稱（claims）。
  // 兩個不同人同名同姓分屬不同城市議會、卻只有一位真的轉任立委（如「李柏毅」：高雄市議員→立委，
  // 臺北市議員是另一人）時，該立委官員會被兩筆 CEC 記錄同時聲稱——此時才用政黨消歧義；
  // 若某候選官員僅被單一筆聲稱（無衝突），姓名相符即信任為轉任，不因政黨標籤差異（常見於
  // 議員選舉「無黨籍及未經政黨推薦」登記、日後才以政黨籍參選立委）而誤判為 missing。
  const pending: { w: CecWinner; others: OfficialRecord[] }[] = [];
  const claims = new Map<string, number>(); // official.id → 被幾筆 CEC 記錄聲稱

  for (const w of cecWinners) {
    const ok = officeKey(w.office, w.name);
    if (officialsByOfficeName.has(ok)) continue; // 同職務同姓名（含異體字）已匹配

    const others = (officialsByName.get(normalizeName(w.name)) ?? []).filter((o) => o.office_type !== w.office);
    if (others.length === 0) { missing.push({ cec: w }); continue; }
    pending.push({ w, others });
    for (const o of others) claims.set(o.id, (claims.get(o.id) ?? 0) + 1);
  }

  for (const { w, others } of pending) {
    let chosen: OfficialRecord | undefined;
    for (const o of others) {
      const contested = (claims.get(o.id) ?? 0) > 1;
      if (!contested || o.party === w.party) { chosen = o; break; }
    }
    if (chosen) transferred.push({ cec: w, foundAs: chosen, vacatedDistrict: w.district });
    else missing.push({ cec: w });
  }

  const extra: ExtraEntry[] = [];
  for (const o of officials) {
    const ok = officeKey(o.office_type, o.name);
    if (!cecByOfficeName.has(ok)) extra.push({ official: o });
  }

  // near_miss 只在雙邊「同職務+同選區+同政黨」恰好各僅一筆候選時才配對——不分區等選區
  // 不具鑑別力（同黨同選區可能同時有多筆缺漏/多餘），一對多時無從判斷對應關係，寧可不猜。
  const nearMissKey = (office: OfficeType, district: string, party: string) => `${office}|${normalizeDistrict(district)}|${party}`;
  const missingGroups = new Map<string, MissingEntry[]>();
  for (const m of missing) {
    const k = nearMissKey(m.cec.office, m.cec.district, m.cec.party);
    (missingGroups.get(k) ?? missingGroups.set(k, []).get(k)!).push(m);
  }
  const extraGroups = new Map<string, ExtraEntry[]>();
  for (const e of extra) {
    const k = nearMissKey(e.official.office_type, e.official.district, e.official.party);
    (extraGroups.get(k) ?? extraGroups.set(k, []).get(k)!).push(e);
  }
  const near_miss: NearMissEntry[] = [];
  for (const [k, ms] of missingGroups) {
    const es = extraGroups.get(k);
    if (!es || ms.length !== 1 || es.length !== 1) continue;
    // 名稱在此必然不同（否則早已於同職務同姓名比對中匹配掉）
    near_miss.push({ cec: ms[0].cec, official: es[0].official });
  }

  return { missing, transferred, extra, near_miss };
}
