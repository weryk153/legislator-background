// scraper/lib/candidateLinks.ts
// 候選人 ↔ 站上既有檔案。寧缺勿錯：連錯會把別人的判決、獻金掛到候選人名下，
// 所以只有「同名唯一＋現任＋地理與職務都吻合」才自動連結，其餘一律進審核清單，
// 人工確認後寫入 scraper/candidates-links-confirmed.json。
import { normalizeNameChars } from '../../src/lib/nameVariant';
import { chiefTitle } from '../../src/lib/candidateTypes';

export interface OfficialRef { slug: string; name: string; officeType: string; district: string; isIncumbent: boolean }
export interface RaceRef { kind: 'chief' | 'council'; county: string; district: string }
export interface LinkConfirmation { name: string; race: string; slug: string | null; basis: string }
export type LinkResult =
  | { kind: 'auto' | 'confirmed'; slug: string; reason: string }
  | { kind: 'none' | 'rejected'; slug: null; reason: string }
  | { kind: 'review'; slug: null; reason: string; candidates: string[] };

/**
 * 姓名比對 key：統一異體字後只留漢字。原住民姓名的羅馬拼音在各來源寫法不一
 * （「楊清順 Cinsun Pawtawan」「石慶龍Rungquan．Lhkatafatu」），拿來比對只會漏；
 * 漢字部分撞名的風險由後續的縣市／選區／職務條件把關。
 */
export function nameKey(name: string): string {
  const n = normalizeNameChars(name);
  const han = n.replace(/[^\p{Script=Han}]/gu, '');
  if (han) return han;
  // 名冊有純羅馬拼音姓名（如 LalingYumin）；Han key 為空會讓它們全部相等，改用帶前綴的拉丁 key
  return `latin:${n.replace(/[^A-Za-z]/g, '').toLowerCase()}`;
}

/**
 * 人工確認檔用完整姓名比對（去空白、統一異體字與分隔符）：同選區可能有漢字相同、
 * 羅馬拼音不同的兩位原住民候選人，只比漢字會讓一筆確認（連結或否決）套到另一人身上。
 */
export function fullKey(s: string): string {
  return normalizeNameChars(s).replace(/\s/g, '');
}

/** 選區字串正規化：去前導零、統一異體字。新北市第05選舉區 ≡ 新北市第5選舉區。 */
export function normalizeDistrict(d: string): string {
  return normalizeNameChars(d).replace(/第0*(\d+)選舉區/, '第$1選舉區');
}

/** 由選區字串取縣市；不分區、原住民立委選區沒有縣市，回 null。 */
export function countyOf(district: string): string | null {
  return normalizeNameChars(district).match(/^(.{2}[縣市])/)?.[1] ?? null;
}

const CHIEF_FEEDERS = new Set(['mayor_magistrate', 'legislator', 'councilor']);

export function linkCandidate(
  name: string, race: RaceRef, officials: OfficialRef[], confirmed: LinkConfirmation[],
): LinkResult {
  const key = nameKey(name);
  const raceKey = normalizeDistrict(race.district);
  const conf = confirmed.find((c) => fullKey(c.name) === fullKey(name) && normalizeDistrict(c.race) === raceKey);
  if (conf) {
    if (conf.slug === null) return { kind: 'rejected', slug: null, reason: `人工確認非本人：${conf.basis}` };
    if (!officials.some((o) => o.slug === conf.slug)) {
      throw new Error(`candidates-links-confirmed.json：${conf.name}（${conf.race}）指向不存在的 slug ${conf.slug}`);
    }
    return { kind: 'confirmed', slug: conf.slug, reason: conf.basis };
  }

  const same = officials.filter((o) => nameKey(o.name) === key);
  if (same.length === 0) return { kind: 'none', slug: null, reason: '站上無同名者' };
  const review = (reason: string): LinkResult =>
    ({ kind: 'review', slug: null, reason, candidates: same.map((o) => o.slug) });
  if (same.length > 1) return review(`同名 ${same.length} 筆`);

  const o = same[0];
  if (race.kind === 'chief') {
    if (o.officeType === 'candidate') {
      return normalizeNameChars(o.district) === normalizeNameChars(race.county)
        ? { kind: 'auto', slug: o.slug, reason: '因參選建檔，登記縣市相同' }
        : review(`因參選建檔於 ${o.district}，但登記於 ${race.county}`);
    }
    if (!o.isIncumbent) return review('同名者已離任');
    if (!CHIEF_FEEDERS.has(o.officeType)) return review(`同名者職務 ${o.officeType} 不在自動規則內`);
    const c = countyOf(o.district);
    if (c === null) return review(`同名者選區「${o.district}」無縣市可比對`);
    return c === normalizeNameChars(race.county)
      ? { kind: 'auto', slug: o.slug, reason: `同縣市現任（${o.district}）` }
      : review(`同名者在 ${c}，候選人登記於 ${race.county}`);
  }

  if (!o.isIncumbent) return review('同名者已離任');
  if (o.officeType !== 'councilor') return review(`同名者為 ${o.officeType}，非議員`);
  return normalizeDistrict(o.district) === raceKey
    ? { kind: 'auto', slug: o.slug, reason: '現任議員同選區' }
    : review(`同名議員在 ${o.district}，候選人登記於 ${race.district}`);
}

/** 候選人列下的一行身分說明，由連結到的檔案推得。因參選建檔者沒有公職身分，回 null。 */
export function identityLine(o: OfficialRef): string | null {
  const pre = o.isIncumbent ? '現任' : '前任';
  const d = normalizeDistrict(o.district);
  switch (o.officeType) {
    case 'mayor_magistrate': return `${pre}${chiefTitle(d)}`;
    case 'legislator':
      if (d.includes('不分區')) return `${pre}不分區立委`;
      if (countyOf(d) === null) return `${pre}${d}立委`;
      return `${pre}立委（${d}）`;
    case 'councilor': return `${pre}議員（${d}）`;
    default: return null;
  }
}
