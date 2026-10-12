import { describe, it, expect } from 'vitest';
import { packGraphComponents, type GraphPositions } from '../src/lib/graphPacking';
import type { GraphData } from '../src/lib/types';

function fixture(count = 24) {
  const graph: GraphData = { nodes: [], edges: [] };
  const positions: GraphPositions = {};
  for (let i = 0; i < count; i++) {
    const a = `${i}-a`, b = `${i}-b`;
    graph.nodes.push({ key: a, name: a, kind: 'official', subtype: 'legislator' }, { key: b, name: b, kind: 'entity', subtype: 'family_member' });
    graph.edges.push({ id: `${i}`, source: a, target: b, type: 'spouse', directed: false, note: null, sourceUrl: '' });
    // 故意把所有群組疊在同一處，驗證群組間排版，而非沿用原始位置。
    positions[a] = { x: 0, y: 0 };
    positions[b] = { x: 100 + i % 3 * 20, y: 60 };
  }
  return { graph, positions };
}
function bounds(positions: GraphPositions) {
  const p = Object.values(positions);
  return { w: Math.max(...p.map(p => p.x)) - Math.min(...p.map(p => p.x)), h: Math.max(...p.map(p => p.y)) - Math.min(...p.map(p => p.y)) };
}
describe('packGraphComponents', () => {
  it('保留群組內相對位置與所有節點，不修改傳入資料', () => {
    const { graph, positions } = fixture();
    const original = JSON.stringify({ graph, positions });
    const packed = packGraphComponents(graph, positions);
    expect(Object.keys(packed).sort()).toEqual(Object.keys(positions).sort());
    for (const edge of graph.edges) {
      expect(packed[edge.target].x - packed[edge.source].x).toBe(positions[edge.target].x);
      expect(packed[edge.target].y - packed[edge.source].y).toBe(60);
    }
    expect(JSON.stringify({ graph, positions })).toBe(original);
  });
  it('不同群組的頭像和標籤外框不重疊', () => {
    const { graph, positions } = fixture();
    const packed = packGraphComponents(graph, positions);
    const rectangles = graph.edges.map(edge => ({
      left: packed[edge.source].x - 62, right: packed[edge.target].x + 62,
      top: packed[edge.source].y - 36, bottom: packed[edge.target].y + 100,
    }));
    for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
      const a = rectangles[i], b = rectangles[j];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
    }
  });
  it('橫向與直向畫布得到各自比例的分布', () => {
    const { graph, positions } = fixture(60);
    const wide = bounds(packGraphComponents(graph, positions, 1.8));
    const tall = bounds(packGraphComponents(graph, positions, .65));
    expect(wide.w / wide.h).toBeGreaterThan(1.5);
    expect(tall.w / tall.h).toBeLessThan(.85);
  });
  it('固定輸入產生相同排版；空圖與無效長寬比安全處理', () => {
    const { graph, positions } = fixture();
    expect(packGraphComponents(graph, positions)).toEqual(packGraphComponents(graph, positions));
    expect(packGraphComponents(graph, positions, NaN)).toEqual(packGraphComponents(graph, positions));
    expect(packGraphComponents({ nodes: [], edges: [] }, {})).toEqual({});
  });
  it('篩選後只排可見群組，單一群組不受原本空白距離影響', () => {
    const { graph, positions } = fixture();
    const subset = { nodes: graph.nodes.slice(-2), edges: graph.edges.slice(-1) };
    const packed = packGraphComponents(subset, positions);
    expect(Object.keys(packed)).toHaveLength(2);
    expect(Math.min(...Object.values(packed).map(p => p.x))).toBe(62);
  });
});
