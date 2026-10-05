import type { OfficeType } from './types';

// 人物頁 <title> 用的精簡職稱：搜尋結果約只顯示前 30 個中文字，原本「（黨籍・議員・
// 新竹縣第08選舉區）」一段就佔掉近 20 字，把「經歷、判決、財產」這些關鍵字擠到截斷處之後。
// 改成人們實際搜尋的講法（「新竹縣議員」「臺北市長」「不分區立委」），完整選區仍留在 description。
export function officeRole(officeType: OfficeType, district: string): string {
  const county = district.match(/^(.+?[縣市])/)?.[1];
  // 因參選建檔者（office_type candidate）：district 為登記縣市。
  if (officeType === 'candidate') return county ? `2026 ${county}長參選人` : '2026 參選人';
  if (officeType === 'mayor_magistrate') return county ? `${county}長` : '縣市首長';
  if (officeType === 'councilor') return county ? `${county}議員` : '議員';
  if (district.includes('不分區')) return '不分區立委';
  const aboriginal = district.match(/^(山地|平地)原住民/)?.[0];
  if (aboriginal) return `${aboriginal}立委`;
  return county ? `${county}立委` : '立委';
}

// 中選會的「無黨籍及未經政黨推薦」在標題裡太長，搜尋者也不會這樣打。
export function shortParty(party: string): string {
  return party.startsWith('無黨籍') ? '無黨籍' : party;
}

export function officialPageTitle(o: { name: string; party: string; officeType: OfficeType; district: string }): string {
  return `${o.name}（${shortParty(o.party)}・${officeRole(o.officeType, o.district)}）經歷、判決、財產與政治獻金｜政治人物背景`;
}
