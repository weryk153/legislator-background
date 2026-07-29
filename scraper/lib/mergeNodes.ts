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
  // 合併鏈防呆：若某 pair 的 to 端點又是另一 pair 的 from 端點，代表合併表本身
  // 需要串接才能算出最終落點，本函式不做遞移解析（可能默默算錯），直接拋錯要求
  // 操作者先攤平合併表。
  const fromKeys = new Set(pairs.map((p) => keyOf(p.from.type, p.from.id)));
  for (const p of pairs) {
    const toKey = keyOf(p.to.type, p.to.id);
    if (fromKeys.has(toKey)) {
      const chained = pairs.find((q) => keyOf(q.from.type, q.from.id) === toKey);
      throw new Error(
        `mergeNodes: 偵測到合併鏈「${p.label}」的目標端點同時是「${chained?.label ?? toKey}」的來源端點，請先攤平合併表再執行`,
      );
    }
  }

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
    const k = dedupKey(next);

    if (!changed) {
      // 未被任何 merge pair 改寫的列：只登記進 seen，讓後續改寫列可以偵測到
      // 「撞上既有邊」，但本身絕不因既有重複或既有自連而被刪除——那些不是
      // 這次合併造成的，刪除範圍必須限定在合併動作本身。
      seen.add(k);
      continue;
    }

    // 改寫後兩端相同 → 自連，刪掉（僅限「改寫造成」的自連）。
    if (keyOf(next.from_type, next.from_id) === keyOf(next.to_type, next.to_id)) {
      deletes.push(r.id);
      continue;
    }

    // 與先前保留（或先前登記）的列重複 → 刪掉（僅限「改寫造成」的重複）。
    if (seen.has(k)) {
      deletes.push(r.id);
      continue;
    }
    seen.add(k);
    updates.push(next);
  }

  return { updates, deletes };
}
