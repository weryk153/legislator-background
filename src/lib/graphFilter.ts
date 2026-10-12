import type { GraphData } from './types';
import { FAMILY_RELATIONS } from './graph';
import { normalizeNameChars } from './nameVariant';

/** 搜尋保留命中人物的直接鄰居；不跨第二層、不以同名合併身分。 */
export function filterGraph(data: GraphData, options: {
  query?: string; family?: boolean; political?: boolean; focusKey?: string | null;
} = {}): GraphData {
  const query = normalizeNameChars(options.query?.trim() ?? '');
  const matches = new Set(data.nodes.filter(node => options.focusKey
    ? node.key === options.focusKey
    : !query || normalizeNameChars(node.name).includes(query)).map(node => node.key));
  const edges = data.edges.filter(edge => {
    const enabled = FAMILY_RELATIONS.has(edge.type) ? options.family !== false : options.political !== false;
    return enabled && (matches.has(edge.source) || matches.has(edge.target));
  });
  const visible = new Set(edges.flatMap(edge => [edge.source, edge.target]));
  return { nodes: data.nodes.filter(node => visible.has(node.key)), edges };
}
