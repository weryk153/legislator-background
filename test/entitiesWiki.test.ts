import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  entityWikiKey, photoFileName, photoCredit, validateEntitiesWiki, indexEntitiesWiki,
  ENTITIES_WIKI_PATH, type EntityWiki,
} from '../scraper/lib/entitiesWiki';

const row = (over: Partial<EntityWiki> = {}): EntityWiki => ({
  name: '柯文哲', wikiTitle: '柯文哲',
  wikipediaUrl: 'https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2', ...over,
});

describe('entityWikiKey / photoFileName', () => {
  it('無 distinct 只用姓名', () => {
    expect(entityWikiKey('柯文哲')).toBe('柯文哲');
    expect(entityWikiKey('柯文哲', '')).toBe('柯文哲');
    expect(photoFileName('柯文哲')).toBe('柯文哲.jpg');
  });
  it('有 distinct 用 name::distinct；檔名取 distinct 前 8 字', () => {
    expect(entityWikiKey('李傑', '學者、鴻海副董')).toBe('李傑::學者、鴻海副董');
    expect(photoFileName('李傑', '前國防部長、前海軍總司令、海軍上將')).toBe('李傑-前國防部長、前海.jpg');
  });
});

describe('photoCredit', () => {
  it('作者／授權', () => {
    expect(photoCredit({ file: '/photos/entities/a.jpg', author: '王小明', license: 'CC BY-SA 4.0', commonsUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg' }))
      .toBe('王小明／CC BY-SA 4.0');
  });
});

describe('validateEntitiesWiki', () => {
  it('合法資料無錯誤', () => {
    expect(validateEntitiesWiki([row()])).toEqual([]);
  });
  it('name+distinct 重複', () => {
    expect(validateEntitiesWiki([row(), row()])).toEqual(['重複鍵：柯文哲']);
  });
  it('wikipediaUrl 必須是 zh.wikipedia.org', () => {
    expect(validateEntitiesWiki([row({ wikipediaUrl: 'https://en.wikipedia.org/wiki/Ko' })]))
      .toEqual(['柯文哲：wikipediaUrl 須為 https://zh.wikipedia.org/wiki/…']);
  });
  it('photo 欄位齊全且 file 指向 /photos/entities/', () => {
    const bad = row({ photo: { file: '/photos/mayors/x.jpg', author: '', license: 'CC BY 4.0', commonsUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg' } });
    expect(validateEntitiesWiki([bad])).toEqual([
      '柯文哲：photo.file 須以 /photos/entities/ 開頭',
      '柯文哲：photo.author 不可為空',
    ]);
  });
  it('photo 與 noPhoto 不可並存', () => {
    const bad = row({ noPhoto: true, photo: { file: '/photos/entities/x.jpg', author: 'a', license: 'CC0', commonsUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg' } });
    expect(validateEntitiesWiki([bad])).toEqual(['柯文哲：photo 與 noPhoto 不可並存']);
  });
  it('同姓名、distinct 前 8 字相同但整串不同 → 撞同一張照片檔名', () => {
    const a = row({ name: '李傑', distinct: '前國防部長、前海軍總司令、海軍上將' });
    const b = row({ name: '李傑', distinct: '前國防部長、前海軍總司令、學者' });
    expect(photoFileName(a.name, a.distinct)).toBe(photoFileName(b.name, b.distinct));
    expect(validateEntitiesWiki([a, b])).toEqual([
      `重複照片檔名：${photoFileName(a.name, a.distinct)}（${entityWikiKey(a.name, a.distinct)} / ${entityWikiKey(b.name, b.distinct)}）`,
    ]);
  });
});

describe('indexEntitiesWiki', () => {
  it('以鍵索引', () => {
    const idx = indexEntitiesWiki([row(), row({ name: '李傑', distinct: '學者' })]);
    expect(idx.get('柯文哲')?.wikiTitle).toBe('柯文哲');
    expect(idx.get('李傑::學者')?.name).toBe('李傑');
    expect(idx.get('李傑')).toBeUndefined();
  });
});

describe('scraper/entities-wiki.json（實際檔案）', () => {
  it('通過驗證', () => {
    const rows = JSON.parse(readFileSync(ENTITIES_WIKI_PATH, 'utf8')) as EntityWiki[];
    expect(validateEntitiesWiki(rows)).toEqual([]);
  });
});
