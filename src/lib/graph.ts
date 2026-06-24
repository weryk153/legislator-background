import type {
  GraphData, GraphEdge, GraphNode, OfficeType, RelationType,
  RawEntity, RawOfficial, RawRelationship,
} from './types';

type RawOfficialNode = Pick<RawOfficial, 'id' | 'slug' | 'name' | 'party' | 'office_type'>;
const keyOf = (type: 'official' | 'entity', id: string) => `${type}:${id}`;

// relation_type → 白話標籤。單一來源，供檔案頁文字清單與（Phase 2）全局關係圖共用。
export const RELATION_LABEL: Record<RelationType, string> = {
  spouse: '配偶', parent_child: '親子', sibling: '手足', relative: '親屬',
  faction: '同派系', mentor: '師徒', party_bloc: '同黨團', aide: '助理', backer: '金主', co_case: '共同被告',
};
// 家族類關係（其餘為政治類）。
export const FAMILY_RELATIONS: ReadonlySet<RelationType> = new Set<RelationType>([
  'spouse', 'parent_child', 'sibling', 'relative',
]);

// Pure: raw rows → GraphData + validation errors. No fs / no network (unit-testable, browser-safe).
export function buildGraphData(
  officials: RawOfficialNode[],
  entities: RawEntity[],
  relationships: RawRelationship[],
): { data: GraphData; errors: string[] } {
  const errors: string[] = [];

  // All possible nodes, keyed; only referenced ones are emitted.
  const allNodes = new Map<string, GraphNode>();
  for (const o of officials) {
    allNodes.set(keyOf('official', o.id), {
      key: keyOf('official', o.id), name: o.name, kind: 'official',
      subtype: o.office_type, slug: o.slug, party: o.party, officeType: o.office_type as OfficeType,
    });
  }
  for (const e of entities) {
    allNodes.set(keyOf('entity', e.id), {
      key: keyOf('entity', e.id), name: e.name, kind: 'entity',
      subtype: e.entity_type, description: e.description,
    });
  }

  const edges: GraphEdge[] = [];
  const seen = new Set<string>(); // dedup key
  const used = new Set<string>(); // node keys actually referenced

  for (const r of relationships) {
    const from = keyOf(r.from_type, r.from_id);
    const to = keyOf(r.to_type, r.to_id);
    if (!allNodes.has(from)) { errors.push(`relationship ${r.id}: endpoint ${from} not found`); continue; }
    if (!allNodes.has(to)) { errors.push(`relationship ${r.id}: endpoint ${to} not found`); continue; }
    if (from === to) { errors.push(`relationship ${r.id}: self-loop`); continue; }
    if (!r.source) { errors.push(`relationship ${r.id}: missing source`); continue; }

    // Dedup: directed → keep (from,to,type); undirected → canonicalise pair so A-B == B-A.
    const pair = r.directed ? `${from}|${to}` : [from, to].sort().join('|');
    const dedupKey = `${pair}|${r.relation_type}|${r.directed}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    edges.push({
      id: r.id, source: from, target: to, type: r.relation_type,
      directed: r.directed, note: r.note ?? null, sourceUrl: r.source.url,
    });
    used.add(from); used.add(to);
  }

  const nodes = [...used].map((k) => allNodes.get(k)!).sort((a, b) => a.key.localeCompare(b.key));
  edges.sort((a, b) => a.id.localeCompare(b.id));
  return { data: { nodes, edges }, errors };
}

// Pure: BFS from centerKey up to `hops`, return the induced subgraph (nodes + edges among them).
export function egoSubgraph(data: GraphData, centerKey: string, hops = 2): GraphData {
  const byKey = new Map(data.nodes.map((n) => [n.key, n]));
  if (!byKey.has(centerKey)) return { nodes: [], edges: [] };

  const adj = new Map<string, GraphEdge[]>();
  for (const e of data.edges) {
    (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e);
    (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e);
  }

  const within = new Set<string>([centerKey]);
  let frontier = [centerKey];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const k of frontier) {
      for (const e of adj.get(k) ?? []) {
        const other = e.source === k ? e.target : e.source;
        if (!within.has(other)) { within.add(other); next.push(other); }
      }
    }
    frontier = next;
  }

  const nodes = [...within].map((k) => byKey.get(k)!).sort((a, b) => a.key.localeCompare(b.key));
  const edges = data.edges.filter((e) => within.has(e.source) && within.has(e.target));
  return { nodes, edges };
}

