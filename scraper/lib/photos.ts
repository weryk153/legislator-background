// 議員照片 manifest ↔ officials 比對邏輯（純函式，無 IO）。
// 見 docs/superpowers/specs/2026-07-24-councilor-photos-design.md「比對規則」：
//   - 姓名經 normalizeNameChars（異體字）後完全相等；絕不跨縣市比對。
//   - 同議會同名多人：manifest 有選區且能對上（寬鬆比對，含容錯前導零）→ 掛；
//     否則（無選區可用 or 選區對不出恰一人）→ 跳過，寧缺勿錯。
//   - 精確比對落空時，退回「中文前綴」比對（見 chinesePrefixOf/manifestChinesePrefix）：
//     處理原民籍議員 officials.name 帶羅馬拼音尾綴（如「石慶龍Rungquan．Lhkatafatu」）
//     而議會官網 manifest 通常只留中文本名（或用括號/圓點附註羅馬拼音）的落差。
//     僅在「該縣市恰一位 official 前綴相符，且 manifest 內恰一筆前綴相符」時才掛，
//     否則寧缺勿錯（避免不同人共用前綴時誤配）。
//   - manifest 姓名中間夾帶頭銜（如花蓮「張議長峻」「徐副議長雪玉」）：先試著剝除
//     「代理議長／副議長／議長」字樣再比對；只有剝除後能對上才採用該結果，否則不影響
//     （不會拿一個查無此人的怪名字硬塞進 skipped 清單以外的用途）。
//   - manifest 姓名帶狀態註記（如「李柏毅(轉任立委)」「張世賢(歿)」
//     「蔡淑惠(解職自115.06.30起生效)」）：先剝除該括號註記再比對；剝除後仍比對不到
//     現任、但能在該縣市找到「非現任」的同名 official → skipped，原因為「已解職/轉任」
//     （與純粹查無此人的「查無現任」區分，兩者都不是錯誤，只是不同語意）。
//   - manifest 有、officials 查無同名現任者 → skipped，原因固定為「查無現任」
//     （議會官網名單以現任為準，查不到代表非本站現任名冊——不是錯誤，只是不比對）。
//   - officials 有、manifest 無對應項 → 不是錯誤，本函式不輸出任何東西（呼叫端留 photo_url=null）。
import { normalizeNameChars } from '../../src/lib/nameVariant';

export interface OfficialLite {
  id: string;
  slug: string;
  name: string;
  district: string;
  // 現任與否；省略視為 true（呼叫端若只傳現任名冊，原有行為不變）。
  // 僅用於「狀態註記」skip 原因判斷（已解職/轉任 vs 查無現任）——實際掛照片
  // 仍只會配對到現任者。
  isIncumbent?: boolean;
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

// 中文前綴：取姓名開頭連續的 CJK 統一表意文字，遇到第一個非此範圍的字元
// （空白、羅馬拼音字母、正規化後的間隔號「‧」等）即停止。同一想法沿用自
// scraper/enrich-legislator-photos.ts 的 chinesePrefix（立院 API 查詢原民立委用）。
// 全字串皆為 CJK（無羅馬拼音尾綴）時回傳整個字串——此時此函式的行為等同精確比對，
// 不會產生額外誤配風險。
function chinesePrefixOf(name: string): string {
  const norm = normalizeNameChars(name);
  const m = norm.match(/^[一-鿿]+/);
  if (m) return m[0];
  // 開頭非 CJK（如臺南「Ingay Tali穎艾達利」羅馬拼音在前）：取字串中第一段 CJK 連續字元。
  const anywhere = norm.match(/[一-鿿]+/);
  return anywhere ? anywhere[0] : norm;
}

// manifest 姓名的中文前綴：先去除任一括號/圓括號內文字（羅馬拼音常見寫法如
// 「林秉君(AliWalis)」），再套用上面同一套「取開頭 CJK 連續字元」規則。
function manifestChinesePrefix(name: string): string {
  const noParens = name.replace(/[（(][^）)]*[）)]/g, '').trim();
  return chinesePrefixOf(noParens);
}

// 狀態註記：manifest 姓名帶「(轉任立委)」「(解職...)」「(歿)」等括號後綴，代表
// 議會官網名單仍留著這個人（如榮譽記錄／過渡期未移除），但本站現任名冊已不收錄。
// 回傳去除該註記後的姓名（其餘文字原樣保留，包含可能同時存在的羅馬拼音）。
const STATUS_SUFFIX_RE = /[（(](轉任立委|解職[^）)]*|歿)[）)]/;
function stripStatusSuffix(name: string): { base: string; hadStatusSuffix: boolean } {
  const m = name.match(STATUS_SUFFIX_RE);
  if (!m || m.index === undefined) return { base: name, hadStatusSuffix: false };
  const base = (name.slice(0, m.index) + name.slice(m.index + m[0].length)).trim();
  return { base, hadStatusSuffix: true };
}

// 頭銜夾在姓名中間：花蓮縣議會慣例將「議長／副議長／代理議長」字樣直接嵌入姓名
// （如「張議長峻」「徐副議長雪玉」），非姓名前後綴，需整段移除字樣本身。
// 沒有命中任一字樣時回傳 null（呼叫端據此判斷「原樣未變 → 不採用」）。
const HONORIFIC_RE = /(代理議長|副議長|議長)/g;
function stripEmbeddedHonorific(name: string): string | null {
  const stripped = name.replace(HONORIFIC_RE, '');
  return stripped !== name ? stripped : null;
}

/**
 * 比對單一縣市的 officials 與其議會官網 manifest。
 * @param officials 該縣市議員（呼叫端須已篩選 office_type='councilor'；建議連同非現任者一併傳入
 *   並標好 isIncumbent，才能判斷「已解職/轉任」skip 原因——只傳現任名冊也相容，isIncumbent 省略視為 true）
 * @param manifest 該議會官網抓到的名單
 * @param county 縣市全名（如「臺北市」），用於限制 officials 僅取該縣市（絕不跨縣市比對）
 */
export function matchManifest(
  officials: OfficialLite[],
  manifest: ManifestEntry[],
  county: string,
): MatchManifestResult {
  const countyOfficials = officials.filter((o) => o.district.startsWith(county));
  // 實際掛照片只能配到現任者；isIncumbent 省略視為現任（呼叫端若只傳現任名冊維持原行為）。
  const incumbentPool = countyOfficials.filter((o) => o.isIncumbent !== false);
  const matched: MatchedPhoto[] = [];
  const skipped: SkippedEntry[] = [];

  // 每筆 manifest 姓名先剝除「頭銜/狀態註記」後的「主要變體」，用於中文前綴比對時
  // 判斷「該前綴在整份 manifest 內是否恰一筆」——一律套用同一套剝除規則，
  // 確保計數口徑一致（不影響「精確比對」與「頭銜剝離只在對上時才採用」的既有規則）。
  const primaryVariantOf = (name: string): string => {
    const { base } = stripStatusSuffix(name);
    return stripEmbeddedHonorific(base) ?? base;
  };

  for (const entry of manifest) {
    const { base: statusBase, hadStatusSuffix } = stripStatusSuffix(entry.name);
    const honorificStripped = stripEmbeddedHonorific(statusBase);
    // 依序嘗試：狀態註記剝除後的原名 → 再剝除中間頭銜後的名字（僅在剝除後有變化時才嘗試）。
    const nameVariants = honorificStripped ? [statusBase, honorificStripped] : [statusBase];

    let candidates: OfficialLite[] = [];
    for (const variant of nameVariants) {
      const normName = normalizeNameChars(variant);
      candidates = incumbentPool.filter((o) => normalizeNameChars(o.name) === normName);
      if (candidates.length > 0) break;
    }

    // 精確比對（含頭銜剝除後）全數落空時，才退回中文前綴比對（原民籍羅馬拼音尾綴）。
    if (candidates.length === 0) {
      const prefix = manifestChinesePrefix(nameVariants[nameVariants.length - 1]);
      if (prefix) {
        const officialsWithPrefix = incumbentPool.filter((o) => chinesePrefixOf(o.name) === prefix);
        const manifestWithPrefix = manifest.filter((e) => manifestChinesePrefix(primaryVariantOf(e.name)) === prefix);
        if (officialsWithPrefix.length === 1 && manifestWithPrefix.length === 1) {
          candidates = officialsWithPrefix;
        }
      }
    }

    if (candidates.length === 1) {
      matched.push({ officialId: candidates[0].id, slug: candidates[0].slug, imgUrl: entry.img_url });
      continue;
    }

    if (candidates.length > 1) {
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
      continue;
    }

    // 完全比對不到現任者：若原名帶狀態註記且剝除後對得到「非現任」同名者，
    // 代表議會官網名單仍留著這人的過渡期記錄——區分「已解職/轉任」與純粹「查無現任」。
    if (hadStatusSuffix) {
      const normStatusBase = normalizeNameChars(statusBase);
      const departedMatch = countyOfficials.some(
        (o) => o.isIncumbent === false && normalizeNameChars(o.name) === normStatusBase,
      );
      if (departedMatch) {
        skipped.push({ name: entry.name, reason: '已解職/轉任' });
        continue;
      }
    }
    skipped.push({ name: entry.name, reason: '查無現任' });
  }

  return { matched, skipped };
}
