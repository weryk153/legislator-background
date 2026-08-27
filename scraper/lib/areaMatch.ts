// 行政區名稱的正規化與對應。純函式，無 I/O。
//
// 中選會用自己的五段代碼，內政部界線檔用行政區代碼，兩套不通用。唯一可靠的橋是名稱，
// 但單以村里名不唯一（「中山里」全台數十個），故以「縣市／鄉鎮市區／村里」複合鍵對應。
import type { AreaNode } from './cecVoteData';

/**
 * 中選會 elbase.csv 裡出現的 Unicode 私用區（PUA, U+E000–U+F8FF）碼位對照表。
 *
 * 來由：早期戶役政系統用 Big5 造字區登錄村里名裡的罕用字（如「廍」「磘」），轉存
 * 成 Unicode 時沒有對應到公版碼位，落到私用區——這些碼位在多數字型下顯示為空白
 * 或方框，肉眼看像是字元「不見了」，實際上資料還在，只是不可見（不是中選會缺字，
 * 是編碼落在看不見的區段）。
 *
 * 每一筆對照都是拿 elbase.csv 裡含該 PUA 碼位的村里，用「縣市＋鄉鎮市區＋村里」的
 * 五段代碼精確換算成界線檔的 VILLCODE（而非用名稱模糊比對）查出界線檔的對應名稱，
 * 確認除 PUA／方括號位置外其餘字元完全相同，逐筆驗證後才收錄——不是猜測。
 *
 * 曾經試過改用「同一鄉鎮市區內找長度相同、非該位置字元也相同」的骨架比對來推導，
 * 結果證實不可靠：例如高雄市左營區同時有「頂北里」「中北里」「廟北里」「尾北里」
 * 「埤北里」「廍北里」六個里都符合「?北里」的骨架，骨架比對無法在其中唯一選出
 * 「廍北里」；臺南市安南區的「公里」同理在「公親里」「公塭里」間無法唯一判定。
 * 唯有精確代碼比對才能排除這種同鄉鎮市區內的多重候選，因此以下只收錄逐碼位、
 * 逐村里驗證過的清單，新增碼位一律要重複同樣的代碼比對驗證，不可用規則猜測補完。
 */
export const PUA_CHAR_MAP: Readonly<Record<string, string>> = {
  '': '那', // 臺南市新化區「[那]拔里」（VILLCODE 67000180018）
  '': '曹', // 新北市坪林區、臺南市龍崎區「石[曹]里」（VILLCODE 65000200004、67000300008）
  '': '塭', // 臺南市安南區「[塭]南里」「公[塭]里」（VILLCODE 67000350003、67000350024）
  '': '磘', // 新北市中和區等 9 個村里「瓦/灰/磚/硘/瓦[磘]里/村」
  '': '檨', // 臺南市西港區「[檨]林里」（VILLCODE 67000140004）
  '': '廍', // 臺北市萬華區等 16 個村里「糖/廍北/廍南/新廍/廍子/…」
};

const PUA_PATTERN = /[-]/g;

/**
 * 名稱正規化。兩份官方檔案的用字不完全一致：
 *   「台」與「臺」兩種寫法都出現（中選會多用臺，部分界線檔用台）
 *   界線檔的名稱可能夾雜空白或全形數字
 *   中選會的罕用字落在 Unicode 私用區（見 PUA_CHAR_MAP，逐碼位驗證過才收錄；
 *   未收錄的私用區碼位維持原樣，不猜測，讓後續比對時明確列為對不上）
 *   界線檔對罕用字另有「方括號包住單一字元」的記法（如「瓦[磘]里」），拿掉方括號
 *   後即為正常字元，兩邊正規化後才能收斂到同一個字串
 * 只做這幾項確定的轉換，不做同義詞猜測——猜錯會把職務掛到別的行政區。
 *
 * 執行順序刻意把「台→臺」放在 PUA 替換與方括號去除之後，不是隨意排列：PUA 與
 * 方括號兩步驟會把碼位／記法還原成「真正的字」，若日後新增的 PUA 對照剛好映到
 * 「台」字，必須先還原出這個「台」，「台→臺」才追得到它、統一轉成「臺」；反過來
 * 若「台→臺」排在前面，這種情況會讓 PUA 還原出的「台」字漏轉，殘留「台」而跟
 * 界線檔的「臺」對不上。目前收錄的 6 個 PUA 碼位（那/曹/塭/磘/檨/廍）都不是「台」，
 * 所以調整順序前不會現形成 bug，但這是結構性的順序相依，不是「目前資料剛好不會
 * 出錯」就可以放著不管——這裡把它排在正確、對未來新碼位也成立的順序。
 */
export function normalizeAreaName(name: string): string {
  return (name ?? '')
    .replace(/[\s　]/g, '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(PUA_PATTERN, (c) => PUA_CHAR_MAP[c] ?? c)
    .replace(/\[([^[\]])\]/g, '$1')
    .replace(/台/g, '臺');
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
 * 鍵碰撞一律**拋錯並列出撞在一起的代碼**，不讓後寫入者靜默勝出——碰撞會讓兩個
 * 行政區的資料互相覆蓋（某村的村里長掛到另一村頭上），正是本站最忌諱的失敗模式。
 *
 * 曾經這裡只是「回傳 Map，大小若小於輸入即代表碰撞」，而碰撞只在測試裡以
 * `size === areas.length` 斷言。那個防線擋不住實際發生過的事故：產出端另外把鍵
 * 展開過一次才建表，測試驗的是展開前的鍵，於是展開後才發生的碰撞一路通關，
 * 連江縣 21 個村的村里長全部被覆蓋掉而沒有任何錯誤或警告。防護必須在建表的
 * 函式本身，不能只在測試裡。
 */
export function buildKeyIndex(areas: AreaNode[]): Map<string, string> {
  const byCode = new Map(areas.map((a) => [a.code, a]));
  const index = new Map<string, string>();
  const collisions: string[] = [];
  for (const a of areas) {
    const p = namePath(a, byCode);
    const key = areaKey(p[0], p[1], p[2]);
    const prev = index.get(key);
    if (prev !== undefined) collisions.push(`${key} → ${prev}、${a.code}`);
    index.set(key, a.code);
  }
  if (collisions.length) {
    throw new Error(`行政區名稱鍵碰撞 ${collisions.length} 筆，會讓兩區的資料互相覆蓋：${collisions.join('；')}`);
  }
  return index;
}

/** 中選會代碼 → 名稱鍵。與 buildKeyIndex 互為反向；代碼重複同樣拋錯。 */
export function buildCodeIndex(areas: AreaNode[]): Map<string, string> {
  const byCode = new Map(areas.map((a) => [a.code, a]));
  const index = new Map<string, string>();
  const collisions: string[] = [];
  for (const a of areas) {
    const p = namePath(a, byCode);
    const key = areaKey(p[0], p[1], p[2]);
    const prev = index.get(a.code);
    if (prev !== undefined && prev !== key) collisions.push(`${a.code} → ${prev}、${key}`);
    index.set(a.code, key);
  }
  if (collisions.length) {
    throw new Error(`同一個中選會代碼對到不同名稱鍵 ${collisions.length} 筆：${collisions.join('；')}`);
  }
  return index;
}

/**
 * 界線檔確實沒有對應多邊形的已知例外，逐筆列名並附理由——不可改成「比例低於
 * X% 就通過」，那會讓新出現的對應失敗被沉默吃掉。與 test/areaMatch.test.ts
 * 的全量對應測試共用同一份清單，兩邊的容忍範圍必須一致。
 *
 * 以下 3 筆是中選會與界線檔用了不同的正常字元（都不是私用區碼位、也不是界線
 * 檔的方括號記法），經 VILLCODE 逐碼比對確認兩邊在同一行政區代碼下的名稱僅
 * 差在這一個字，但兩個字各自都是合法漢字，無法用確定性規則判斷何者為官方
 * 正字，故列為已知例外而非猜測合併：
 *   新北市/瑞芳區/濓新里、新北市/瑞芳區/濓洞里
 *     界線檔為「濂新里」「濂洞里」（濂 U+6FC2 vs 濓 U+6FD3，皆為正常漢字）
 *   雲林縣/水林鄉/瓊埔村
 *     界線檔為「[欍]埔村」（拿掉方括號後為「欍埔村」，欍 U+6B0D 與中選會的
 *     瓊 U+74CA 是完全不同的字，不是方括號記法差異）
 */
export const KNOWN_MISSING_BOUNDARY_KEYS: ReadonlySet<string> = new Set([
  '新北市/瑞芳區/濓新里',
  '新北市/瑞芳區/濓洞里',
  '雲林縣/水林鄉/瓊埔村',
]);
