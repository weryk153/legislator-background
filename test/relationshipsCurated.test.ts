// 靜態驗證 scraper/relationships-curated.json 的跨列身份慣例——不連資料庫。
// import-relationships.ts 分兩輪匯入：第一輪處理 subjectKind !== 'entity' 的列（同時建出
// 所有被當作 counterpart 提到的 entity），第二輪才處理 subjectKind: 'entity' 的 2 度關係列，
// 其 (subject, subjectDistinct) 必須在第一輪就已由某一列的 counterpart 建出，否則
// resolveSubject 會 skip（見 scraper/lib/relEndpoints.ts）。這個「先出現在 counterpart、
// 後才能當 subject」的慣例目前只有匯入時的執行期報告能抓到——本檔在不寫資料庫的前提下
// 靜態核對它。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { entityWikiKey } from '../scraper/lib/entitiesWiki';

const here = dirname(fileURLToPath(import.meta.url));
const CURATED_PATH = join(here, '..', 'scraper', 'relationships-curated.json');

interface Curated {
  subject: string;
  subjectKind?: 'official' | 'entity';
  subjectDistinct?: string;
  counterpartName: string;
  counterpartKind: 'official' | 'entity';
  counterpartDistinct?: string;
  relationType: string;
  parentName?: string;
  sourceType: string;
}

const rows = JSON.parse(readFileSync(CURATED_PATH, 'utf8')) as Curated[];

// migrations 的 relation_type enum（supabase/migrations/0006_relationships.sql）。
const RELATION_TYPES = new Set([
  'spouse', 'parent_child', 'sibling', 'relative',
  'faction', 'mentor', 'party_bloc', 'aide', 'backer', 'co_case',
]);

describe('relationships-curated.json（實際檔案）：subjectKind entity 的可建出性', () => {
  // 誰在第一輪「可能」被建成 entity：只要某列把某個名字當 counterpart 提到，那個名字
  // 在執行期就有機會被 ensureEntity() 建出（counterpartKind 明寫 'entity'、或有
  // counterpartDistinct 兩者必定建 entity；counterpartKind 明寫 'official' 但名冊查無
  // 唯一匹配時，也會在執行期退成 entity——這條路徑依賴資料庫當下的名冊內容，本檔不連
  // 資料庫故無法重現，因此把「有沒有出現過在某列的 counterpart 位置」當作必要條件：
  // 一個名字若從未出現在任何列的 counterpart 位置，不論名冊內容為何都絕不可能被建成
  // entity，subjectKind: 'entity' 引用它必然是 typo 或方向寫反。
  const counterpartKeys = new Set(
    rows.map((r) => entityWikiKey(r.counterpartName, r.counterpartDistinct)),
  );

  it('每一列 subjectKind: entity 的 (subject, subjectDistinct) 都曾在某列被當作 counterpart 提到', () => {
    const entitySubjectRows = rows.filter((r) => r.subjectKind === 'entity');
    expect(entitySubjectRows.length).toBeGreaterThan(0); // 這份資料本來就該有 2 度關係列，否則本測試沒意義
    for (const r of entitySubjectRows) {
      const key = entityWikiKey(r.subject, r.subjectDistinct);
      expect(counterpartKeys.has(key)).toBe(true);
    }
  });

  it('目前共 46 個不重複的 subjectKind: entity 主體，唯一帶 subjectDistinct 者為 李傑::海軍上將、前國防部長', () => {
    const keys = new Set(
      rows.filter((r) => r.subjectKind === 'entity').map((r) => entityWikiKey(r.subject, r.subjectDistinct)),
    );
    expect(keys.size).toBe(46);
    const withDistinct = rows.filter((r) => r.subjectKind === 'entity' && r.subjectDistinct);
    expect(withDistinct.map((r) => entityWikiKey(r.subject, r.subjectDistinct))).toEqual(['李傑::海軍上將、前國防部長']);
  });
});

describe('relationships-curated.json（實際檔案）：parent_child 方向欄位', () => {
  it('parentName 非空，且等於該列 subject 或 counterpartName 之一', () => {
    const pcRows = rows.filter((r) => r.relationType === 'parent_child');
    expect(pcRows.length).toBeGreaterThan(0);
    for (const r of pcRows) {
      expect(r.parentName).toBeTruthy();
      expect([r.subject, r.counterpartName]).toContain(r.parentName);
    }
  });
});

describe('relationships-curated.json（實際檔案）：無自我迴圈', () => {
  it('沒有任何一列 subject === counterpartName 且雙方 kind 相同（同一人連到自己）', () => {
    const selfLoops = rows.filter((r) => {
      const subjectKind = r.subjectKind ?? 'official';
      return r.subject === r.counterpartName && subjectKind === r.counterpartKind;
    });
    expect(selfLoops).toEqual([]);
  });
});

describe('relationships-curated.json（實際檔案）：欄位值合法性', () => {
  it('relationType 皆屬 supabase/migrations/0006_relationships.sql 的 enum', () => {
    const bad = rows.filter((r) => !RELATION_TYPES.has(r.relationType));
    expect(bad).toEqual([]);
  });

  it('sourceType 皆為 wiki 或 news', () => {
    const bad = rows.filter((r) => r.sourceType !== 'wiki' && r.sourceType !== 'news');
    expect(bad).toEqual([]);
  });
});
