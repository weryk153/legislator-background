// 行政區名稱的正規化與對應。純函式，無 I/O。
//
// 中選會用自己的五段代碼，內政部界線檔用行政區代碼，兩套不通用。唯一可靠的橋是名稱，
// 但單以村里名不唯一（「中山里」全台數十個），故以「縣市／鄉鎮市區／村里」複合鍵對應。
import type { AreaNode } from './cecVoteData';

/**
 * 名稱正規化。兩份官方檔案的用字不完全一致：
 *   「台」與「臺」兩種寫法都出現（中選會多用臺，部分界線檔用台）
 *   界線檔的名稱可能夾雜空白或全形數字
 * 只做這幾項確定的轉換，不做同義詞猜測——猜錯會把職務掛到別的行政區。
 */
export function normalizeAreaName(name: string): string {
  return (name ?? '')
    .replace(/[\s　]/g, '')
    .replace(/台/g, '臺')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/** 複合鍵。省略下層即為該層的鍵。 */
export function areaKey(county: string, town?: string, village?: string): string {
  return [county, town, village]
    .filter((s): s is string => s != null && s !== '')
    .map(normalizeAreaName)
    .join('/');
}

/** 由節點上溯出「縣市/鄉鎮市區/村里」的名稱路徑。 */
function namePath(a: AreaNode, byCode: Map<string, AreaNode>): string[] {
  const path = [a.name];
  let cur = a;
  while (cur.parent) {
    const p = byCode.get(cur.parent);
    if (!p) break;
    path.unshift(p.name);
    cur = p;
  }
  return path;
}

/**
 * 名稱鍵 → 中選會代碼。
 *
 * 回傳的 Map 大小應與輸入節點數相同；若小於，代表有鍵碰撞，必須查明後修正，
 * 不可放著不管——碰撞會讓兩個行政區的資料互相覆蓋。
 */
export function buildKeyIndex(areas: AreaNode[]): Map<string, string> {
  const byCode = new Map(areas.map((a) => [a.code, a]));
  const index = new Map<string, string>();
  for (const a of areas) {
    const p = namePath(a, byCode);
    index.set(areaKey(p[0], p[1], p[2]), a.code);
  }
  return index;
}

/** 中選會代碼 → 名稱鍵。與 buildKeyIndex 互為反向。 */
export function buildCodeIndex(areas: AreaNode[]): Map<string, string> {
  const byCode = new Map(areas.map((a) => [a.code, a]));
  const index = new Map<string, string>();
  for (const a of areas) {
    const p = namePath(a, byCode);
    index.set(a.code, areaKey(p[0], p[1], p[2]));
  }
  return index;
}
