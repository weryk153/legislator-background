// /graph 的力導向排版改在建置時算好（Astro frontmatter 呼叫），前端直接用固定座標
// （cytoscape preset）。過去在瀏覽器端每次載入都跑 cose：416 個節點在手機上主執行緒
// 卡 3–4 秒，而且每次排法都不同。
//
// cose 內部用 Math.random 決定初始位置；這裡以固定種子的亂數暫時替換，讓同一份資料
// 每次建置都得到同一種排法，算完立刻還原。參數必須與 RelationshipGraph.svelte 原本
// global 模式的 cose 設定一致；節點尺寸用同一個 data(size)（toCytoscapeElements 給的）。
import cytoscape from 'cytoscape';
import type { GraphData } from './types';
import { toCytoscapeElements } from './graphView';

export const GLOBAL_COSE = { name: 'cose', padding: 30, animate: false, nodeRepulsion: 9000, idealEdgeLength: 110 } as const;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeGlobalLayout(data: GraphData): Record<string, { x: number; y: number }> {
  if (data.nodes.length === 0) return {};
  const { nodes, edges } = toCytoscapeElements(data, null);
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [...nodes, ...edges] as cytoscape.ElementDefinition[],
    style: [{ selector: 'node', style: { width: 'data(size)', height: 'data(size)' } }],
  });
  const random = Math.random;
  Math.random = mulberry32(20260926);
  try {
    cy.layout(GLOBAL_COSE as cytoscape.LayoutOptions).run();
  } finally {
    Math.random = random;
  }
  const out: Record<string, { x: number; y: number }> = {};
  cy.nodes().forEach((n) => {
    const p = n.position();
    out[n.id()] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  });
  cy.destroy();
  return out;
}
