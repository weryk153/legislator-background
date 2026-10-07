// 2026 參選人照片的維基條目與 Commons 署名對照表（scraper/candidate-photos-wiki.json）。
// 照片本身由 scraper/enrich-candidate-photos.ts 落地並寫進 officials.photo_url；
// 站上從這份對照表讀署名（CC BY／CC BY-SA 要求標示作者、授權並可連回原始檔）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CandidatePhoto {
  slug: string;           // officials.slug（cand-<姓名>-<縣市>）
  name: string;
  wikiTitle: string;      // 條目標題（API 用；可能含消歧義括號）
  wikipediaUrl: string;
  verifiedBy: string;     // 人工查證依據：條目內容與參選縣市、政黨相符之處
  photo?: { file: string; author: string; license: string; commonsUrl: string };
  noPhoto?: boolean;      // 人工確認主圖不是本人／不宜使用 → 之後跳過不再抓
}

export const CANDIDATE_PHOTOS_PATH = join(process.cwd(), 'scraper', 'candidate-photos-wiki.json');
export const CANDIDATE_PHOTO_DIR_URL = '/photos/candidates/';

export function validateCandidatePhotos(rows: CandidatePhoto[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.slug)) errors.push(`重複 slug：${r.slug}`);
    seen.add(r.slug);
    if (!r.slug.startsWith('cand-')) errors.push(`${r.slug}：slug 須為 cand-…`);
    if (!r.wikiTitle) errors.push(`${r.slug}：wikiTitle 不可為空`);
    if (!r.verifiedBy) errors.push(`${r.slug}：verifiedBy 不可為空（須寫明查證依據）`);
    if (r.photo && r.noPhoto) errors.push(`${r.slug}：photo 與 noPhoto 不可並存`);
    if (r.photo) {
      if (r.photo.file !== `${CANDIDATE_PHOTO_DIR_URL}${r.slug}.jpg`) errors.push(`${r.slug}：photo.file 須為 ${CANDIDATE_PHOTO_DIR_URL}${r.slug}.jpg`);
      if (!r.photo.author || !r.photo.license) errors.push(`${r.slug}：photo 須有 author 與 license`);
      if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(r.photo.commonsUrl)) {
        errors.push(`${r.slug}：photo.commonsUrl 須為 https://commons.wikimedia.org/wiki/File:…`);
      }
    }
  }
  return errors;
}

// 讀檔＋驗證；驗證失敗直接丟錯。
export function loadCandidatePhotos(): CandidatePhoto[] {
  const rows = JSON.parse(readFileSync(CANDIDATE_PHOTOS_PATH, 'utf8')) as CandidatePhoto[];
  const errors = validateCandidatePhotos(rows);
  if (errors.length) throw new Error(`candidate-photos-wiki.json 驗證失敗：\n- ${errors.join('\n- ')}`);
  return rows;
}

let cache: Map<string, NonNullable<CandidatePhoto['photo']>> | null = null;

/** slug → 照片署名。建置時每張卡片都會呼叫，讀檔只做一次。 */
export function candidatePhotoCredits(): Map<string, NonNullable<CandidatePhoto['photo']>> {
  if (cache) return cache;
  cache = new Map(loadCandidatePhotos().flatMap((r) => (r.photo ? [[r.slug, r.photo] as const] : [])));
  return cache;
}
