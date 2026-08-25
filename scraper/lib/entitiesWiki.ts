// 外部人物 ↔ 維基條目 ↔ 照片授權 對照表（scraper/entities-wiki.json）。
// 這份檔案是唯一真相：import:relationships 每次重跑會把非判決來源的 entity 全部重建
// （新 UUID），任何寫在 DB entities 上的 photo_url / wikipedia_url 重匯即消失，所以
// 照片與條目資訊只能存在版控檔案裡、匯入時套上。
// 見 docs/superpowers/specs/2026-08-25-relationship-graph-wiki-expansion-design.md §2–3。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface EntityPhoto {
  file: string;        // 站內路徑，如 /photos/entities/柯文哲.jpg
  author: string;      // Commons extmetadata Artist（去 HTML）
  license: string;     // extmetadata LicenseShortName，如 CC BY-SA 4.0
  commonsUrl: string;  // https://commons.wikimedia.org/wiki/File:…
}
export interface EntityWiki {
  name: string;
  // 同名不同人時填，值須與 relationships-curated.json 該 entity 的 counterpartDistinct 一字不差。
  distinct?: string;
  wikiTitle: string;      // 條目標題（API 用；可能含消歧義括號）
  wikipediaUrl: string;   // https://zh.wikipedia.org/wiki/…（匯入時寫入 entities.wikipedia_url，也是與 DB 列配對的鍵）
  photo?: EntityPhoto;    // 由 enrich:entity-photos 寫入
  noPhoto?: boolean;      // 人工確認主圖不是本人／不宜使用 → 之後跳過不再抓
}

const here = dirname(fileURLToPath(import.meta.url));
export const ENTITIES_WIKI_PATH = join(here, '..', 'entities-wiki.json');
export const PHOTO_DIR_URL = '/photos/entities/';

// entity 識別鍵，與 import-relationships.ts 的 entity 去重快取鍵同規則。
export function entityWikiKey(name: string, distinct?: string): string {
  return distinct ? `${name}::${distinct}` : name;
}

// 檔名用中文，比照 public/photos/councilors/；distinct 只取前 8 個字避免檔名過長。
export function photoFileName(name: string, distinct?: string): string {
  return distinct ? `${name}-${[...distinct].slice(0, 8).join('')}.jpg` : `${name}.jpg`;
}

export function photoCredit(p: EntityPhoto): string {
  return `${p.author}／${p.license}`;
}

export function validateEntitiesWiki(rows: EntityWiki[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const key = entityWikiKey(r.name, r.distinct);
    if (seen.has(key)) errors.push(`重複鍵：${key}`);
    seen.add(key);
    if (!r.wikiTitle) errors.push(`${key}：wikiTitle 不可為空`);
    if (!/^https:\/\/zh\.wikipedia\.org\/wiki\/./.test(r.wikipediaUrl)) {
      errors.push(`${key}：wikipediaUrl 須為 https://zh.wikipedia.org/wiki/…`);
    }
    if (r.photo && r.noPhoto) errors.push(`${key}：photo 與 noPhoto 不可並存`);
    else if (r.photo) {
      if (!r.photo.file.startsWith(PHOTO_DIR_URL)) errors.push(`${key}：photo.file 須以 ${PHOTO_DIR_URL} 開頭`);
      if (!r.photo.author) errors.push(`${key}：photo.author 不可為空`);
      if (!r.photo.license) errors.push(`${key}：photo.license 不可為空`);
      if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(r.photo.commonsUrl)) {
        errors.push(`${key}：photo.commonsUrl 須為 https://commons.wikimedia.org/wiki/File:…`);
      }
    }
  }
  return errors;
}

export function indexEntitiesWiki(rows: EntityWiki[]): Map<string, EntityWiki> {
  return new Map(rows.map((r) => [entityWikiKey(r.name, r.distinct), r]));
}

// 讀檔＋驗證；驗證失敗直接丟錯，讓每個用到對照表的腳本在一開始就停下來。
export function loadEntitiesWiki(): EntityWiki[] {
  const rows = JSON.parse(readFileSync(ENTITIES_WIKI_PATH, 'utf8')) as EntityWiki[];
  const errors = validateEntitiesWiki(rows);
  if (errors.length) throw new Error(`entities-wiki.json 驗證失敗：\n- ${errors.join('\n- ')}`);
  return rows;
}
