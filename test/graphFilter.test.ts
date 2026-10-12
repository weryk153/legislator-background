import { describe, it, expect } from 'vitest';
import { filterGraph } from '../src/lib/graphFilter';
import type { GraphData } from '../src/lib/types';
const graph: GraphData = {
  nodes: [
    { key: 'a', name: '戴瑋姍', kind: 'official', subtype: 'councilor' },
    { key: 'b', name: '李同名', kind: 'entity', subtype: 'family_member' },
    { key: 'c', name: '陳三', kind: 'official', subtype: 'legislator' },
    { key: 'd', name: '李同名', kind: 'entity', subtype: 'other' },
    { key: 'e', name: '孤立者', kind: 'entity', subtype: 'other' },
  ],
  edges: [
    { id: 'ab', source: 'a', target: 'b', type: 'spouse', directed: false, note: null, sourceUrl: '' },
    { id: 'bc', source: 'b', target: 'c', type: 'mentor', directed: true, note: null, sourceUrl: '' },
    { id: 'cd', source: 'c', target: 'd', type: 'parent_child', directed: true, note: null, sourceUrl: '' },
  ],
};
describe('filterGraph', () => {
  it('保留完整關係，隱藏沒有可見連線的孤點', () => {
    expect(filterGraph(graph).edges).toHaveLength(3);
    expect(filterGraph(graph).nodes.map(n => n.key)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('姓名搜尋保留直接鄰居，不加入第二層，支援異體字', () => {
    const result = filterGraph(graph, { query: ' 戴瑋姗 ' });
    expect(result.nodes.map(n => n.key)).toEqual(['a', 'b']);
    expect(result.edges.map(e => e.id)).toEqual(['ab']);
  });
  it('姓名與關係類型篩選可疊加，全部關閉時無孤點', () => {
    expect(filterGraph(graph, { query: '李同名', family: false }).edges.map(e => e.id)).toEqual(['bc']);
    expect(filterGraph(graph, { family: false, political: false })).toEqual({ nodes: [], edges: [] });
  });
  it('以 key 聚焦，不把同名不同人合併，也不改變邊方向', () => {
    const result = filterGraph(graph, { focusKey: 'd' });
    expect(result.nodes.map(n => n.key)).toEqual(['c', 'd']);
    expect(result.edges[0]).toEqual(graph.edges[2]);
  });
  it('不存在的姓名與 key、空圖回傳空結果', () => {
    expect(filterGraph(graph, { query: '無此姓名' }).nodes).toEqual([]);
    expect(filterGraph(graph, { focusKey: 'missing' }).edges).toEqual([]);
    expect(filterGraph({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });
});
