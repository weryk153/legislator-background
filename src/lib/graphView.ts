// GraphData → Cytoscape elements 的純轉換。無 DOM、無 Cytoscape 依賴，可單元測試。
// RelationshipGraph.svelte 只負責掛載與樣式，不在元件內組裝資料。
import type { EntityType, GraphData, OfficeType } from './types';
import { RELATION_LABEL, FAMILY_RELATIONS, ENTITY_LABEL, OFFICE_LABEL } from './graph';

export interface CyNode {
  data: {
    id: string; label: string; slug: string; kind: string;
    depth: number; center: 0 | 1; size: number; avatar: string;
  };
}
export interface CyEdge {
  data: {
    id: string; source: string; target: string; label: string;
    fam: 0 | 1; dir: 0 | 1; note: string; sourceUrl: string;
  };
}

// 無照片節點的頭像文字色。刻意寫死而非用 token：這個字是畫在 SVG data URI 裡的，
// 換亮/暗模式時無法重新上色。--faint 在兩種模式下相近（#8c887f / #7d7a72），
// 取中間值即可雙模式通用。真正的姓名在圓形下方，用 --fg，不受影響。
const AVATAR_FG = '#8c887f';

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]!));

// 無照片節點：姓氏第一個字的 SVG，背景透明讓節點的 --surface 底色透出來，
// 因此同一張圖在亮/暗模式都適用。
export function avatarDataUri(name: string): string {
  const ch = escapeXml(name.trim().charAt(0) || '·');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    `<text x="50" y="50" fill="${AVATAR_FG}" font-family="Georgia,serif" font-size="52" ` +
    `text-anchor="middle" dominant-baseline="central">${ch}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// BFS：中心為 0，每往外一層 +1。用來決定節點尺寸與第二層的視覺弱化。
export function nodeDepths(data: GraphData, centerKey: string): Map<string, number> {
  const depths = new Map<string, number>();
  if (!data.nodes.some((n) => n.key === centerKey)) return depths;

  const adj = new Map<string, string[]>();
  for (const e of data.edges) {
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
  }

  depths.set(centerKey, 0);
  let frontier = [centerKey];
  let d = 0;
  while (frontier.length > 0) {
    d += 1;
    const next: string[] = [];
    for (const k of frontier) {
      for (const other of adj.get(k) ?? []) {
        if (!depths.has(other)) { depths.set(other, d); next.push(other); }
      }
    }
    frontier = next;
  }
  return depths;
}

export function toCytoscapeElements(
  data: GraphData,
  centerKey: string | null,
): { nodes: CyNode[]; edges: CyEdge[] } {
  const depths = centerKey ? nodeDepths(data, centerKey) : new Map<string, number>();

  const nodes: CyNode[] = data.nodes.map((n) => {
    const isCenter = n.key === centerKey;
    const depth = depths.get(n.key) ?? 1;
    const role = n.kind === 'official'
      ? OFFICE_LABEL[n.subtype as OfficeType] ?? ''
      : ENTITY_LABEL[n.subtype as EntityType] ?? '其他公眾人物';
    return {
      data: {
        id: n.key,
        // Cytoscape 一個節點只有一個 label，無法對兩行分別上色；
        // 第二行加括號讓它讀起來是次要資訊。
        label: role ? `${n.name}\n（${role}）` : n.name,
        slug: n.slug ?? '',
        kind: n.kind,
        depth,
        center: isCenter ? 1 : 0,
        size: isCenter ? 88 : depth <= 1 ? 64 : 48,
        avatar: n.photoUrl ?? avatarDataUri(n.name),
      },
    };
  });

  const edges: CyEdge[] = data.edges.map((e) => ({
    data: {
      id: e.id, source: e.source, target: e.target,
      label: RELATION_LABEL[e.type] ?? e.type,
      fam: FAMILY_RELATIONS.has(e.type) ? 1 : 0,
      dir: e.directed ? 1 : 0,
      note: e.note ?? '',
      sourceUrl: e.sourceUrl ?? '',
    },
  }));

  return { nodes, edges };
}
