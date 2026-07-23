// 議員照片 manifest ↔ officials 比對邏輯（純函式，無 IO）。
// 見 docs/superpowers/specs/2026-07-24-councilor-photos-design.md「比對規則」：
//   - 姓名經 normalizeNameChars（異體字）後完全相等；絕不跨縣市比對。
//   - 同議會同名多人：manifest 有選區且能對上（寬鬆比對，含容錯前導零）→ 掛；
//     否則（無選區可用 or 選區對不出恰一人）→ 跳過，寧缺勿錯。
//   - manifest 有、officials 查無同名現任者 → skipped，原因固定為「查無現任」
//     （議會官網名單以現任為準，查不到代表非本站現任名冊——不是錯誤，只是不比對）。
//   - officials 有、manifest 無對應項 → 不是錯誤，本函式不輸出任何東西（呼叫端留 photo_url=null）。
import { normalizeNameChars } from '../../src/lib/nameVariant';

export interface OfficialLite {
  id: string;
  slug: string;
  name: string;
  district: string;
}

export interface ManifestEntry {
  name: string;
  district?: string;
  img_url: string;
}

export interface MatchedPhoto {
  officialId: string;
  slug: string;
  imgUrl: string;
}

export interface SkippedEntry {
  name: string;
  reason: string;
}

export interface MatchManifestResult {
  matched: MatchedPhoto[];
  skipped: SkippedEntry[];
}

// 從選區字串抽出選區號碼（去除前導零的效果由 parseInt 天然達成），涵蓋
// manifest 常見寫法：「第3選區」「第03選區」「3」「臺北市議會第3選舉區」等。
// 抽不出數字（如小型議會只有縣市層級、無分區）回傳 null。
function districtNum(s: string): number | null {
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// 寬鬆判斷 official.district（如「臺北市第3選舉區」）與 manifest 的 district
// （格式不一，見上）是否指同一選區：兩邊都能抽出號碼 → 比號碼；
// 否則退回 contains/equals 寬鬆比對（如皆無分區、只有縣市名的小型議會）。
function districtsCorrespond(officialDistrict: string, manifestDistrict: string): boolean {
  const a = districtNum(officialDistrict);
  const b = districtNum(manifestDistrict);
  if (a !== null && b !== null) return a === b;
  return officialDistrict.includes(manifestDistrict) || manifestDistrict.includes(officialDistrict);
}

/**
 * 比對單一縣市的 officials（現任議員）與其議會官網 manifest。
 * @param officials 該縣市現任議員（呼叫端須已篩選 office_type='councilor' && is_incumbent）
 * @param manifest 該議會官網抓到的名單
 * @param county 縣市全名（如「臺北市」），用於限制 officials 僅取該縣市（絕不跨縣市比對）
 */
export function matchManifest(
  officials: OfficialLite[],
  manifest: ManifestEntry[],
  county: string,
): MatchManifestResult {
  const pool = officials.filter((o) => o.district.startsWith(county));
  const matched: MatchedPhoto[] = [];
  const skipped: SkippedEntry[] = [];

  for (const entry of manifest) {
    const normName = normalizeNameChars(entry.name);
    const candidates = pool.filter((o) => normalizeNameChars(o.name) === normName);

    if (candidates.length === 0) {
      skipped.push({ name: entry.name, reason: '查無現任' });
      continue;
    }

    if (candidates.length === 1) {
      matched.push({ officialId: candidates[0].id, slug: candidates[0].slug, imgUrl: entry.img_url });
      continue;
    }

    // 同名多人：非有選區可對應恰一人不可，寧缺勿錯。
    if (!entry.district) {
      skipped.push({ name: entry.name, reason: '同名多人且 manifest 無選區可消歧' });
      continue;
    }
    const byDistrict = candidates.filter((o) => districtsCorrespond(o.district, entry.district!));
    if (byDistrict.length === 1) {
      matched.push({ officialId: byDistrict[0].id, slug: byDistrict[0].slug, imgUrl: entry.img_url });
    } else {
      skipped.push({ name: entry.name, reason: '同名多人，選區無法消歧為恰一人' });
    }
  }

  return { matched, skipped };
}
