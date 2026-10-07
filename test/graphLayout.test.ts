import { describe, it, expect } from 'vitest';
import { computeGlobalLayout } from '../src/lib/graphLayout';
import type { GraphData } from '../src/lib/types';

const node = (key: string, kind: 'official' | 'entity' = 'official') =>
  ({ key, kind, name: key, subtype: kind === 'official' ? 'legislator' : 'person' }) as GraphData['nodes'][number];
const edge = (source: string, target: string) =>
  ({ id: `${source}-${target}`, source, target, type: 'spouse', directed: false, note: null, sourceUrl: '' }) as unknown as GraphData['edges'][number];

const data: GraphData = {
  nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => node(k)),
  edges: [edge('a', 'b'), edge('b', 'c'), edge('c', 'a'), edge('d', 'e'), edge('e', 'f')],
};

describe('computeGlobalLayout（/graph 建置時預先算好的力導向座標）', () => {
  it('每個節點都有有限的座標', () => {
    const pos = computeGlobalLayout(data);
    expect(Object.keys(pos).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    for (const p of Object.values(pos)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
  it('同一份資料每次結果相同（固定亂數種子，重新建置不會換一種排法）', () => {
    expect(computeGlobalLayout(data)).toEqual(computeGlobalLayout(data));
  });
  it('節點有被排開，不會疊在同一點', () => {
    const pos = Object.values(computeGlobalLayout(data));
    const distinct = new Set(pos.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    expect(distinct.size).toBe(pos.length);
  });
  it('不改動全域的 Math.random', () => {
    const before = Math.random;
    computeGlobalLayout(data);
    expect(Math.random).toBe(before);
  });
  it('空圖回空物件', () => {
    expect(computeGlobalLayout({ nodes: [], edges: [] })).toEqual({});
  });
});
