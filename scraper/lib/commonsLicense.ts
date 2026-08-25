// Wikimedia Commons imageinfo extmetadata → 可否使用與署名字串。純函式。
// 只收 CC 系列／公有領域／Attribution；fair use 與缺授權資訊一律不收（本站要落地縮圖，不能靠合理使用）。
// 「Attribution」是 Commons 對台灣政府機關依《政府資料開放授權條款》上傳之官方肖像的標示
// （extmetadata 只給 LicenseShortName=Attribution、Artist=機關名），屬署名即可使用的自由授權，
// 本站關係圖 tooltip 與 about 頁均有署名，故納入。
export type ExtMetadata = Record<string, { value: string } | undefined>;
export type LicenseVerdict =
  | { ok: true; license: string; author: string }
  | { ok: false; reason: string };

const ALLOWED = /^(CC|Public domain|CC0|PD|Attribution$)/i;

export function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function pickLicense(meta: ExtMetadata | undefined): LicenseVerdict {
  const license = meta?.LicenseShortName?.value?.trim();
  if (!license) return { ok: false, reason: '無授權資訊' };
  if (!ALLOWED.test(license)) return { ok: false, reason: `授權不符：${license}` };
  const author = stripHtml(meta?.Artist?.value ?? '') || stripHtml(meta?.Credit?.value ?? '') || '不詳';
  return { ok: true, license, author };
}
