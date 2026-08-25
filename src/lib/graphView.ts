// GraphData → Cytoscape elements 的純轉換。無 DOM、無 Cytoscape 依賴，可單元測試。
// RelationshipGraph.svelte 只負責掛載與樣式，不在元件內組裝資料。
import type { EntityType, GraphData, OfficeType } from './types';
import { RELATION_LABEL, FAMILY_RELATIONS, ENTITY_LABEL, OFFICE_LABEL } from './graph';

export interface CyNode {
  data: {
    id: string; label: string; name: string; slug: string; kind: string;
    depth: number; center: 0 | 1; size: number; avatar: string;
    // 節點 tooltip 用（entity 才有內容；official 為空字串，Cytoscape data 不放 undefined）
    description: string; wikipediaUrl: string; photoCredit: string;
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
// 這裡直接沿用亮模式的 --faint 值，兩模式都可用。真正的姓名在圓形下方，用 --fg，不受影響。
const AVATAR_FG = '#8c887f';

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]!));

// 無照片節點：姓氏第一個字的 SVG，背景透明讓節點的 --surface 底色透出來，
// 因此同一張圖在亮/暗模式都適用。
export function avatarDataUri(name: string): string {
  // 用 [...] 取完整 code point，而非 charAt(0) 取 UTF-16 code unit：
  // 罕見漢字（如 CJK 擴展 B/C 區）或 emoji 屬於 non-BMP，charAt(0) 只會拿到
  // 半個代理對，交給 encodeURIComponent 會丟出 URI malformed。
  const ch = escapeXml([...name.trim()][0] || '·');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
    `<text x="50" y="50" fill="${AVATAR_FG}" font-family="Georgia,serif" font-size="52" ` +
    `text-anchor="middle" dominant-baseline="central">${ch}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 外部公眾人物的第二行：優先用該筆 entity 的描述（如「民宿經營者」／「前雲林縣議員…」），
// 沒有描述時才退回類別標籤（「家屬」「企業界」…）。這不是裝飾：站上刻意保留了幾組
// 同名不同人（李佳芬、李傑），若兩人都只顯示通用類別就會長得一模一樣，維護者會把它們
// 當成重複節點「修好」，而重新合併正是「常見名寧缺勿錯」原則要防止的錯誤。
// 回傳完整字串不截斷——/graph 的伺服器渲染清單有版面空間，該顯示完整描述；
// 畫在圖上時才另外交給 wrapRole() 斷行與截斷。
export function entityRole(description: string | undefined, subtype: string): string {
  const desc = description?.trim();
  if (desc) return desc;
  return ENTITY_LABEL[subtype as EntityType] ?? '其他公眾人物';
}

// 節點樣式雖設了 text-max-width: 110，但 Cytoscape 的 text-wrap: 'wrap' 只在空白處斷行，
// 中文沒有空白，等於對本站的標籤完全無效：20 字的描述會拉成一條 350px 寬的單行，
// 橫跨並蓋掉旁邊的邊標籤。故在這裡自己斷行——每行 8 個漢字（13px 字級下約 110px，
// 與 text-max-width 一致），最多兩行，超出者截斷加省略號（完整描述在 /graph 清單看得到）。
const ROLE_CHARS_PER_LINE = 8;
const ROLE_MAX_LINES = 2;
export function wrapRole(role: string): string {
  const chars = [...role];
  const cap = ROLE_CHARS_PER_LINE * ROLE_MAX_LINES;
  const kept = chars.length > cap ? [...chars.slice(0, cap - 1), '…'] : chars;
  const lines: string[] = [];
  for (let i = 0; i < kept.length; i += ROLE_CHARS_PER_LINE) {
    lines.push(kept.slice(i, i + ROLE_CHARS_PER_LINE).join(''));
  }
  return lines.join('\n');
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
    // depths 查不到時 fallback 為第一層：僅在 data 為 centerKey 的 ego subgraph
    // （每個節點必連回中心），或 centerKey 為 null（depths 恆空）時才正確；
    // 若餵入完整圖並指定中心，未連通節點會被誤判為第一層。
    const depth = depths.get(n.key) ?? 1;
    const role = n.kind === 'official'
      ? OFFICE_LABEL[n.subtype as OfficeType] ?? ''
      : wrapRole(entityRole(n.description, n.subtype));
    return {
      data: {
        id: n.key,
        // Cytoscape 一個節點只有一個 label，無法對兩行分別上色；
        // 第二行加括號讓它讀起來是次要資訊。
        label: role ? `${n.name}\n（${role}）` : n.name,
        // 純姓名（不含職稱行），供 /graph 的「搜尋姓名」比對用——
        // label 是兩行文字，直接拿它比對會連職稱字樣（如「立委」）都命中。
        name: n.name,
        slug: n.slug ?? '',
        kind: n.kind,
        depth,
        center: isCenter ? 1 : 0,
        size: isCenter ? 88 : depth <= 1 ? 64 : 48,
        avatar: n.photoUrl ?? avatarDataUri(n.name),
        description: n.description ?? '',
        wikipediaUrl: n.wikipediaUrl ?? '',
        photoCredit: n.photoCredit ?? '',
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
