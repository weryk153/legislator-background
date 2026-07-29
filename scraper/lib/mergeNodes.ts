// 合併重複建立的節點：把 `from` 端點改寫成 `to` 端點，並清掉因此產生的自連與重複邊。
// 純運算、無 I/O，供 merge-duplicate-entities.ts 使用並可單元測試。
export type NodeType = 'official' | 'entity';

export interface Endpoint { type: NodeType; id: string }

export interface RelRow {
  id: string;
  from_type: NodeType; from_id: string;
  to_type: NodeType; to_id: string;
  relation_type: string; directed: boolean;
}

export interface MergePair { label: string; from: Endpoint; to: Endpoint }

export interface MergeResult { updates: RelRow[]; deletes: string[] }

const keyOf = (type: NodeType, id: string) => `${type}:${id}`;

// 與 src/lib/graph.ts 的 buildGraphData 同一套去重規則：
// 有向邊比對 from|to|type；無向邊把兩端排序後比對，使 A–B 與 B–A 視為同一條。
function dedupKey(r: RelRow): string {
  const from = keyOf(r.from_type, r.from_id);
  const to = keyOf(r.to_type, r.to_id);
  const pair = r.directed ? `${from}|${to}` : [from, to].sort().join('|');
  return `${pair}|${r.relation_type}|${r.directed}`;
}

export function planMerges(rows: RelRow[], pairs: MergePair[]): MergeResult {
  const remap = new Map<string, Endpoint>();
  for (const p of pairs) remap.set(keyOf(p.from.type, p.from.id), p.to);

  // 依 id 排序，讓「重複時保留哪一筆」有穩定結果（保留 id 較小者）。
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));

  const updates: RelRow[] = [];
  const deletes: string[] = [];
  const seen = new Set<string>();

  for (const r of sorted) {
    const nf = remap.get(keyOf(r.from_type, r.from_id));
    const nt = remap.get(keyOf(r.to_type, r.to_id));
    const next: RelRow = {
      ...r,
      from_type: nf?.type ?? r.from_type, from_id: nf?.id ?? r.from_id,
      to_type: nt?.type ?? r.to_type, to_id: nt?.id ?? r.to_id,
    };
    const changed = Boolean(nf || nt);

    // 改寫後兩端相同 → 自連，刪掉。
    if (keyOf(next.from_type, next.from_id) === keyOf(next.to_type, next.to_id)) {
      deletes.push(r.id);
      continue;
    }

    // 與先前保留的列重複 → 刪掉。未改寫的列也要參與比對，
    // 因為改寫後的列可能撞上原本就存在的邊。
    const k = dedupKey(next);
    if (seen.has(k)) {
      deletes.push(r.id);
      continue;
    }
    seen.add(k);

    if (changed) updates.push(next);
  }

  return { updates, deletes };
}
