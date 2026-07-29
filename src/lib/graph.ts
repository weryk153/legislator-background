import type {
  EntityType, GraphData, GraphEdge, GraphNode, OfficeType, RelationType,
  RawEntity, RawOfficial, RawRelationship,
} from './types';

type RawOfficialNode = Pick<RawOfficial, 'id' | 'slug' | 'name' | 'party' | 'office_type' | 'photo_url'>;
const keyOf = (type: 'official' | 'entity', id: string) => `${type}:${id}`;

// relation_type → 白話標籤。單一來源，供檔案頁文字清單與（Phase 2）全局關係圖共用。
export const RELATION_LABEL: Record<RelationType, string> = {
  spouse: '配偶', parent_child: '親子', sibling: '手足', relative: '親屬',
  // party_bloc 已於 2026-07 停用：原 17 筆資料經檢視為各種不相干關係的大雜燴，已個別改標為正確類型；
  // 保留 enum 值僅因移除需改 migration，新資料請勿再使用此類型。
  faction: '同派系', mentor: '師徒', party_bloc: '同陣營', aide: '助理', backer: '政治支持', co_case: '共同被告',
};
// 家族類關係（其餘為政治類）。
export const FAMILY_RELATIONS: ReadonlySet<RelationType> = new Set<RelationType>([
  'spouse', 'parent_child', 'sibling', 'relative',
]);
// 外部公眾人物（非本站政治人物）的類別標籤。
export const ENTITY_LABEL: Record<EntityType, string> = {
  businessperson: '企業界', religious: '宗教界', celebrity: '演藝界', media: '媒體界',
  family_member: '家屬', organization: '組織／法人', other: '其他公眾人物',
};
// 公職類別 → 白話標籤。供關係圖節點標籤與檔案頁標題共用。
export const OFFICE_LABEL: Record<OfficeType, string> = {
  legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員',
};

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
      // photo_url 為 null 時整個欄位省略，讓 graph.json 不長出一堆 "photoUrl":null
      ...(o.photo_url ? { photoUrl: o.photo_url } : {}),
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

  // 先依 id 排序再去重：資料庫裡確實有幾組重複的關係列（同一對人、同一類型記了兩筆），
  // 去重時「誰活下來」決定了邊的 source/target 方向與顯示的 note。若照呼叫端傳入的順序
  // 處理，勝出者就取決於 DB 回傳的列順序，重跑一次匯出可能讓某條邊悄悄換方向、換說明。
  // 固定以 id 最小者為準（與下方輸出的排序一致），讓匯出結果可重現。
  const ordered = [...relationships].sort((a, b) => a.id.localeCompare(b.id));
  for (const r of ordered) {
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

