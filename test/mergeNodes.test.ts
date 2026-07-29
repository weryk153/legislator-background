import { describe, it, expect } from 'vitest';
import { planMerges, type RelRow, type MergePair } from '../scraper/lib/mergeNodes';

const row = (over: Partial<RelRow>): RelRow => ({
  id: 'r1', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B',
  relation_type: 'faction', directed: false, ...over,
});

// entity E（重複建立的韓國瑜）→ official O（本站收錄的韓國瑜）
const pairs: MergePair[] = [
  { label: '韓國瑜', from: { type: 'entity', id: 'E' }, to: { type: 'official', id: 'O' } },
];

describe('planMerges', () => {
  it('改寫 from 端點', () => {
    const { updates, deletes } = planMerges([row({ id: 'r1' })], pairs);
    expect(deletes).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: 'r1', from_type: 'official', from_id: 'O', to_type: 'official', to_id: 'B' });
  });

  it('改寫 to 端點', () => {
    const rows = [row({ id: 'r1', from_type: 'official', from_id: 'B', to_type: 'entity', to_id: 'E' })];
    const { updates } = planMerges(rows, pairs);
    expect(updates[0]).toMatchObject({ to_type: 'official', to_id: 'O' });
  });

  it('端點沒被改到的列不產生 update', () => {
    const rows = [row({ id: 'r1', from_type: 'official', from_id: 'X', to_type: 'official', to_id: 'Y' })];
    expect(planMerges(rows, pairs)).toEqual({ updates: [], deletes: [] });
  });

  it('改寫後變成自連 → 刪除，不 update', () => {
    // E 與 O 之間原本有一條邊；E 併入 O 後兩端相同
    const rows = [row({ id: 'r1', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'O' })];
    const { updates, deletes } = planMerges(rows, pairs);
    expect(updates).toEqual([]);
    expect(deletes).toEqual(['r1']);
  });

  it('改寫後與既有列重複 → 保留 id 較小者，刪除較大者', () => {
    const rows = [
      row({ id: 'r1', from_type: 'official', from_id: 'O', to_type: 'official', to_id: 'B' }), // 既有
      row({ id: 'r2', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B' }),   // 改寫後撞上 r1
    ];
    const { updates, deletes } = planMerges(rows, pairs);
    expect(deletes).toEqual(['r2']);
    expect(updates).toEqual([]);
  });

  it('無向邊的重複判定不分方向', () => {
    const rows = [
      row({ id: 'r1', from_type: 'official', from_id: 'B', to_type: 'official', to_id: 'O' }), // B–O
      row({ id: 'r2', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B' }),   // 改寫後 O–B，與 r1 同組
    ];
    expect(planMerges(rows, pairs).deletes).toEqual(['r2']);
  });

  it('有向邊的重複判定要分方向', () => {
    const dir = { relation_type: 'parent_child', directed: true };
    const rows = [
      row({ id: 'r1', from_type: 'official', from_id: 'B', to_type: 'official', to_id: 'O', ...dir }), // B→O
      row({ id: 'r2', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B', ...dir }),   // 改寫後 O→B，方向相反不算重複
    ];
    const { updates, deletes } = planMerges(rows, pairs);
    expect(deletes).toEqual([]);
    expect(updates).toHaveLength(1);
  });

  it('關係類型不同不算重複', () => {
    const rows = [
      row({ id: 'r1', from_type: 'official', from_id: 'O', to_type: 'official', to_id: 'B', relation_type: 'mentor' }),
      row({ id: 'r2', from_type: 'entity', from_id: 'E', to_type: 'official', to_id: 'B', relation_type: 'faction' }),
    ];
    expect(planMerges(rows, pairs).deletes).toEqual([]);
  });

  it('可重複執行：已合併完的資料不再產生任何異動', () => {
    const rows = [row({ id: 'r1', from_type: 'official', from_id: 'O', to_type: 'official', to_id: 'B' })];
    expect(planMerges(rows, pairs)).toEqual({ updates: [], deletes: [] });
  });

  it('支援 entity → entity 合併（派系去重）', () => {
    const facPairs: MergePair[] = [
      { label: '新潮流系', from: { type: 'entity', id: 'DUP' }, to: { type: 'entity', id: 'KEEP' } },
    ];
    const rows = [row({ id: 'r1', from_type: 'entity', from_id: 'DUP', to_type: 'official', to_id: 'B' })];
    const { updates } = planMerges(rows, facPairs);
    expect(updates[0]).toMatchObject({ from_type: 'entity', from_id: 'KEEP' });
  });
});
