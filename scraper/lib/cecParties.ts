// 中選會政黨代碼表。原本是 build-election-map.ts 的私有函式（該檔頂層即執行建置，
// 無法 import），候選人建置也要同一份表，故抽出為純函式，I/O 留給呼叫端。
import { parseElpaty, INDEPENDENT_PARTY_CODE } from './cecVoteData';
import { normalizeAreaName } from './areaMatch';

/**
 * 合併多份 elpaty.csv。各選舉類別列出的政黨彼此不是子集關係（T1 用到但 V1 沒有的
 * 代碼多達 19 個），所以要全部讀入再合併。同一代碼對到不同名稱代表我們對資料的
 * 理解有誤——拋錯並列出衝突，不任選一個靜默蓋過去。
 */
export function mergeParties(sources: { path: string; csv: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  const conflicts: string[] = [];
  for (const { path, csv } of sources) {
    for (const [code, name] of parseElpaty(csv)) {
      const existing = m.get(code);
      if (existing && existing !== name) {
        conflicts.push(`代碼 ${code}：「${existing}」（先前讀到） vs 「${name}」（${path}）`);
        continue;
      }
      m.set(code, name);
    }
  }
  if (conflicts.length) {
    throw new Error(`政黨代碼表合併時發現衝突：同一代碼在不同選舉類別對應到不同政黨名稱，`
      + `無法安全合併（寧可拋錯，也不要任選一個靜默蓋過去）：${conflicts.join('；')}`);
  }
  return m;
}

/**
 * 政黨全名 → 代碼。名冊把無黨籍寫成「無」，對到 999。查無者回 null：2026 才出現
 * 的新政黨（如「臺灣SoR無法黨」）在 2022 表上沒有代碼，這時寧可讓前端畫成「其他」，
 * 也不可歸成無黨籍——那會把有推薦政黨的候選人說成無黨籍。
 */
export function partyCodeLookup(parties: Map<string, string>): (name: string) => string | null {
  const byName = new Map<string, string>();
  for (const [code, name] of parties) byName.set(normalizeAreaName(name), code);
  return (name: string) => {
    const n = normalizeAreaName(name);
    if (n === '無') return INDEPENDENT_PARTY_CODE;
    return byName.get(n) ?? null;
  };
}
