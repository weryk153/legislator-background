import type { GraphData } from './types';

export type GraphPositions = Record<string, { x: number; y: number }>;
type Rect = { x: number; y: number; w: number; h: number };
type Cluster = { keys: string[]; x: number; y: number; w: number; h: number };

/** 每個連通群組維持內部座標，群組之間依畫布比例緊密排列，不改動關係或節點身分。 */
export function packGraphComponents(data: GraphData, positions: GraphPositions, aspect = 1.5): GraphPositions {
  if (!data.nodes.length) return {};
  const ratio = Number.isFinite(aspect) && aspect > 0 ? Math.max(.35, Math.min(4, aspect)) : 1.5;
  const adjacency = new Map(data.nodes.map(node => [node.key, [] as string[]]));
  for (const edge of data.edges) {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }
  const seen = new Set<string>();
  const clusters: Cluster[] = [];
  // 把頭像與最多三行姓名／身分標籤算進群組外框，避免不同群組的文字相撞。
  const SIDE = 62, TOP = 36, BOTTOM = 100, GAP = 40;
  for (const node of data.nodes) {
    if (seen.has(node.key)) continue;
    const keys = [node.key];
    seen.add(node.key);
    for (let i = 0; i < keys.length; i++) {
      for (const key of adjacency.get(keys[i]) ?? []) {
        if (!seen.has(key) && adjacency.has(key)) { seen.add(key); keys.push(key); }
      }
    }
    const points = keys.map(key => positions[key] ?? { x: 0, y: 0 });
    const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y));
    const maxX = Math.max(...points.map(p => p.x)), maxY = Math.max(...points.map(p => p.y));
    clusters.push({ keys, x: minX, y: minY, w: maxX - minX + SIDE * 2 + GAP, h: maxY - minY + TOP + BOTTOM + GAP });
  }
  // 大群組先放，小群組可填入其餘空間；同大小時以 key 穩定排序。
  clusters.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h || a.keys[0].localeCompare(b.keys[0]));
  const area = clusters.reduce((sum, cluster) => sum + cluster.w * cluster.h, 0);

  function attempt(scale: number) {
    const width = Math.max(Math.sqrt(area * ratio) * scale, ...clusters.map(cluster => cluster.w));
    const height = Math.max(Math.sqrt(area / ratio) * scale, ...clusters.map(cluster => cluster.h));
    let free: Rect[] = [{ x: 0, y: 0, w: width, h: height }];
    const placed: { cluster: Cluster; rect: Rect }[] = [];
    for (const cluster of clusters) {
      // Best short-side fit：避免逐列排版因最高的群組留下一整排大洞。
      const candidates = free.filter(rect => rect.w >= cluster.w && rect.h >= cluster.h).sort((a, b) =>
        Math.min(a.w - cluster.w, a.h - cluster.h) - Math.min(b.w - cluster.w, b.h - cluster.h)
        || a.y - b.y || a.x - b.x);
      if (!candidates.length) return null;
      const rect: Rect = { x: candidates[0].x, y: candidates[0].y, w: cluster.w, h: cluster.h };
      placed.push({ cluster, rect });
      const next: Rect[] = [];
      for (const space of free) {
        if (rect.x >= space.x + space.w || rect.x + rect.w <= space.x || rect.y >= space.y + space.h || rect.y + rect.h <= space.y) { next.push(space); continue; }
        if (rect.x > space.x) next.push({ ...space, w: rect.x - space.x });
        if (rect.x + rect.w < space.x + space.w) next.push({ ...space, x: rect.x + rect.w, w: space.x + space.w - rect.x - rect.w });
        if (rect.y > space.y) next.push({ ...space, h: rect.y - space.y });
        if (rect.y + rect.h < space.y + space.h) next.push({ ...space, y: rect.y + rect.h, h: space.y + space.h - rect.y - rect.h });
      }
      free = next.filter((space, i) => !next.some((other, j) => i !== j && other.x <= space.x && other.y <= space.y && other.x + other.w >= space.x + space.w && other.y + other.h >= space.y + space.h && (other.w * other.h > space.w * space.h || j < i)));
    }
    return placed;
  }

  // 由緊到寬尋找可容納全部群組的矩形；有限次嘗試避免瀏覽器長時間運算。
  let packed = null;
  for (let scale = 1; scale <= 3 && !packed; scale += .05) packed = attempt(scale);
  if (!packed) return Object.fromEntries(data.nodes.map(node => [node.key, { ...(positions[node.key] ?? { x: 0, y: 0 }) }]));
  const result: GraphPositions = {};
  for (const { cluster, rect } of packed) {
    for (const key of cluster.keys) {
      const p = positions[key] ?? { x: 0, y: 0 };
      result[key] = { x: Math.round((p.x - cluster.x + rect.x + SIDE) * 10) / 10, y: Math.round((p.y - cluster.y + rect.y + TOP) * 10) / 10 };
    }
  }
  return result;
}
