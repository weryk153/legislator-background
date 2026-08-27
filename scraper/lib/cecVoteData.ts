// 中選會投開票資料的解析。純字串處理，無 I/O。
//
// CSV 為 UTF-8、無標頭列。五段代碼是「省市別, 縣市別, 選區別, 鄉鎮市區別, 村里別」，
// 各段位數固定（2,3,2,3,4），前導零有意義，一律以字串保留。
//
// 中選會不同年份的匯出格式並不一致：2022 年起是無引號、純逗號分隔（如
// `10,005,00,000,0000,...`）；2018 年（含）以前是 Excel 匯出格式，每欄以雙引號
// 包住，代碼類欄位再加前導單引號強制以文字讀入（如 `"'10","'005",...`，用來避免
// Excel 把 `005` 讀成 `5`）。以下每個 parse 函式都會自動吃這兩種格式——呼叫端不必
// 知道也不必記得先轉換：曾經把這個轉換寫成呼叫端要自行套用的獨立函式，結果就是
// 不知情的呼叫端直接把 2018 引號格式餵進來，當選註記 `,*, ` 在引號格式下實際字串
// 是 `,"*",`，判斷式恆為假，導致「當選者整批消失」——不是報錯，是安靜地拿到空結果，
// 因此再往下推導的所有數字都悄悄錯掉。故收斂到解析層本身處理，一次修正、處處受益。

/**
 * 行政區樹的層級。
 *
 * `electoralUnit` 不是行政區，是**選舉單位**：連江縣（馬祖）人口稀少，中選會把數個
 * 行政村合併成一個「鄉鎮市民代表」的選舉區，村里別欄用 `0A01`／`0A02`… 這種非四位
 * 數字的代碼、名稱以頓號相連（如「復興村、福沃村」）。這些列**混在 V1（村里長）的
 * elbase.csv 裡**，但 V1/elcand.csv 裡它們一位候選人都沒有——每個單村各自選出自己
 * 的村長（同一份 elbase 裡 0002 復興村、0003 福沃村 都在，且各有村長）。真身在
 * R1（鄉鎮市民代表）的 elbase：同一批名稱、同一批 0A0x 代碼，選區別是 01 而非 00。
 *
 * 故它們必須與村里明確區分開來，不得混入村里層——否則會多出一批 `chief: null` 的
 * 幽靈村里，讓地圖上出現「查無村里長資料」的假缺口。
 */
export type AreaLevel = 'county' | 'town' | 'village' | 'electoralUnit';

export interface AreaNode {
  code: string;
  level: AreaLevel;
  name: string;
  parent: string | null;
}

const seg = (code: string): string[] => code.split('-');

/**
 * 把一列 CSV 切成欄位陣列，同時支援上述兩種已知格式。
 *
 * 只做「剝除欄位外層雙引號與代碼欄的前導單引號」這件事，不是完整的 RFC 4180
 * 解析器——不處理跳脫的引號、欄位內嵌逗號或換行等情形，這是刻意的最小範圍
 * （中選會的欄位內容不會出現這些情形，硬要支援只會讓解析邏輯變複雜而沒有實益）。
 *
 * 含引號的列會先驗證「剝除引號後重新包回雙引號、逗號接回，能還原成原始列」——
 * 這保證了只吃得下前述兩種已知格式；一旦資料格式再變一次（例如出現跳脫引號），
 * 會直接拋錯讓人第一時間發現，而不是安靜地解析出錯誤的欄位值。
 */
// 匯出供 cecVotes.ts（elctks.csv／elprof.csv 的解析）共用——兩份檔案是同一套
// 中選會匯出格式，不重複實作同一段剝引號邏輯。
export function splitCsvFields(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const raw = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  if (raw.map((v) => `"${v}"`).join(',') !== line) {
    const preview = line.length > 80 ? `${line.slice(0, 80)}…` : line;
    throw new Error(`CSV 列含引號但不符合已知的 Excel 匯出格式（無法還原比對）：${preview}`);
  }
  return raw.map((v) => v.replace(/^'/, ''));
}

// 五段代碼裡只有「省市別／縣市別／鄉鎮市區別／村里別」這四段構成行政區的隸屬階層；
// **選區別（第 3 段）不是行政區階層的一環**，它是同一個行政區內部再切分出的選舉區
// 編號。故以下兩個上溯函式都把選區別歸零——兩者對這個欄位必須有同一套假設。
//
// 曾經 townCodeOf 保留選區別而 countyCodeOf 歸零，兩者假設相反，後果是：鄉鎮市民
// 代表的選區別是 01–05（代表會是複數席，每個鄉鎮市內再分選舉區），而行政區樹的
// 鄉鎮市區節點選區別固定是 00，保留選區別就永遠對不上——368 個鄉鎮市區沒有一個
// 顯示得出代表會席次，而且不會有任何錯誤或警告。村里長與鄉鎮市長的選區別本來就是
// 00，所以那兩層看起來正常，問題只在代表會那一層現形。

/** 上溯到所屬縣市的代碼。選區別、鄉鎮市區別、村里別一律歸零。 */
export function countyCodeOf(areaCode: string): string {
  const s = seg(areaCode);
  return [s[0], s[1], '00', '000', '0000'].join('-');
}

/** 上溯到所屬鄉鎮市區的代碼。選區別與村里別歸零（見上方說明）。 */
export function townCodeOf(areaCode: string): string {
  const s = seg(areaCode);
  return [s[0], s[1], '00', s[3], '0000'].join('-');
}

/** 村里別欄位的合法形態。四位數字＝行政村里；`0A` 加兩位數字＝合併選舉單位（見 AreaLevel）。 */
const VILLAGE_SEG = /^\d{4}$/;
const ELECTORAL_UNIT_SEG = /^0A\d{2}$/;

/**
 * 解析 elbase.csv 為行政區樹。
 *
 * 層級不能只看「縣市別」欄位：直轄市在中選會代碼裡是用**省市別**表示的
 * （63 臺北、64 高雄、65 新北、66 臺中、67 臺南、68 桃園），其縣市別固定為 000，
 * 與「全國」列的 000 撞在一起。故以「鄉鎮市區別／村里別是否為空碼」判斷層級，
 * 並單獨排除省市別為 00 的全國列。
 *
 * 村里別欄位不是四位數字的列**不是村里**：目前已知只有 `0A01`／`0A02`… 這一種
 * 形態，是連江縣數村合選的鄉鎮市民代表選舉區（見 AreaLevel 的說明），標成
 * `electoralUnit` 而不混入村里層。**遇到第三種未知形態一律拋錯**——猜測一個
 * 沒見過的代碼形態屬於哪一層，等於在地圖上憑空發明或抹掉一塊行政區。
 *
 * 有內容卻欄位不足或名稱為空的列一律拋錯，不做靜默跳過：行政區樹少一列，
 * 地圖上就少一塊行政區。若不拋錯，2026 年的資料格式一旦有異動（例如多了
 * 標頭列、欄位數不同），會安靜地漏掉行政區而沒有人發現，直到地圖上發現
 * 憑空缺一塊才回頭追查——那時已經太晚。純空白行（含檔尾換行留下的空列）
 * 則是正常現象，予以略過。
 */
export function parseElbase(csv: string): AreaNode[] {
  const out: AreaNode[] = [];
  const lines = (csv ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue; // 純空白行，非資料錯誤
    const f = splitCsvFields(line).map((s) => s.trim());
    if (f.length < 6 || !f[5]) {
      const preview = line.length > 80 ? `${line.slice(0, 80)}…` : line;
      throw new Error(`elbase.csv 第 ${i + 1} 列格式不良（欄位不足或名稱為空）：${preview}`);
    }
    const [prv, city, dist, town, village] = f;
    if (prv === '00') continue; // 全國
    const code = f.slice(0, 5).join('-');
    const townCode = [prv, city, dist, town, '0000'].join('-');
    if (ELECTORAL_UNIT_SEG.test(village)) {
      out.push({ code, level: 'electoralUnit', name: f[5], parent: townCode });
    } else if (!VILLAGE_SEG.test(village)) {
      const preview = line.length > 80 ? `${line.slice(0, 80)}…` : line;
      throw new Error(
        `elbase.csv 第 ${i + 1} 列的村里別「${village}」不是已知的代碼形態`
        + `（四位數字＝村里、0A 加兩位數字＝合併選舉單位），無法歸類，不猜測：${preview}`,
      );
    } else if (village !== '0000') {
      out.push({ code, level: 'village', name: f[5], parent: townCode });
    } else if (town !== '000') {
      out.push({ code, level: 'town', name: f[5], parent: [prv, city, dist, '000', '0000'].join('-') });
    } else {
      out.push({ code, level: 'county', name: f[5], parent: null });
    }
  }
  return out;
}

/**
 * 當選註記（elcand.csv 第 15 欄）。**四種值全部要明確枚舉**，不可只認 `*`。
 *
 * 2022 年全十類 elcand.csv 的實測分布（共 19,747 筆）：
 *
 * ```
 * ''   8,716 筆   未當選
 * '*' 10,992 筆   當選（一般得票當選）
 * '!'     21 筆   婦女保障名額當選——這 21 筆的性別欄全部是 2（女性），無一例外
 * '?'     18 筆   得票相同、待抽籤決定（8 個村里各 2 人、1 個鄉鎮市民代表選區 2 人）
 * ```
 *
 * 曾經 `elected` 直接寫成 `t(14) === '*'`，`!` 與 `?` 都被當成落選。後果是本站
 * 自相矛盾：`!` 的 21 位當中有 4 位（金門唐麗輝、新竹縣吳菊花、苗栗蕭詠萱、
 * 臺南沈家鳳）在本站上有檔案頁、標記為現任議員，地圖上這四個縣市卻各少一席。
 *
 * `?` 不可當成落選：兩人得票相同、依公職人員選舉罷免法第 71 條當場抽籤決定，
 * 席位確實存在、只是這份檔案沒記結果。故獨立成 `pendingDraw`，由呼叫端明確
 * 呈現為「待抽籤」，與「本站沒有資料」區分開來。
 *
 * 遇到第五種未知註記一律拋錯——靜默當成落選正是上面那個災難的成因。
 */
export type ElectedMark = '' | '*' | '!' | '?';

/** 當選方式。`vote` 為一般得票當選、`quota` 為婦女保障名額當選（註記 `!`）。 */
export type ElectedBy = 'vote' | 'quota';

export interface Candidate {
  areaCode: string;
  number: number;
  name: string;
  partyCode: string;
  sex: '1' | '2';
  birthDate: string;
  age: number;
  education: string;
  incumbent: boolean;
  /** 原始當選註記，保留供稽核與除錯用。 */
  electedMark: ElectedMark;
  /** 是否當選。`*` 與 `!` 皆為當選；`?`（待抽籤）不算，見 pendingDraw。 */
  elected: boolean;
  /** 當選方式；未當選者為 null。介面須把 `quota` 標示為婦女保障名額。 */
  electedBy: ElectedBy | null;
  /** 得票相同、待抽籤決定。既不是當選也不是落選，是「這份檔案沒記結果」。 */
  pendingDraw: boolean;
}

/** 無黨籍。中選會以固定代號 999 表示「無黨籍及未經政黨推薦」。 */
export const INDEPENDENT_PARTY_CODE = '999';

/**
 * 代碼表查無政黨名稱時使用的明確代號。
 *
 * 不可用 `?? INDEPENDENT_PARTY_CODE` 這種寫法把對不到的政黨當成無黨籍——那不是
 * 預設值，是猜測，而且會把有黨籍的人謊報成無黨籍。寧可顯示「未知政黨」讓人看見
 * 對應失敗，也不要靜默改寫一個人的黨籍。
 */
export const UNKNOWN_PARTY_CODE = 'UNKNOWN';

/**
 * 解析 elcand.csv。
 *
 * 欄位：省市別, 縣市別, 選區別, 鄉鎮市區別, 村里別, 號次, 姓名, 政黨代號, 性別,
 *       出生日期, 年齡, 出生地, 學歷, 是否現任(Y/N), 當選註記(*), 副手註記
 *
 * 當選註記在原始檔中是「空白包夾的星號」（`,*, `），直接比對 '*' 會全部漏掉。
 * 四種註記值的完整語意見 ElectedMark。政黨代號一律以字串保留：轉成數字會讓 999
 * 這類代號失去「這是代碼不是數量」的語意。
 *
 * 欄位不足或姓名為空的列**拋錯**，不靜默略過（原本是 `continue`，與同檔
 * parseElbase 的拋錯策略相反）：2026 年的欄位數一旦有異動，靜默略過的行為是
 * 「當選人整批安靜消失」，正是檔首註解花了十幾行警告的那個災難。
 *
 * 2018 年（含）以前的匯出檔是 Excel 引號格式，見檔首說明；本函式已透過
 * splitCsvFields 自動剝除引號，呼叫端不需另外處理。
 */
export function parseElcand(csv: string): Candidate[] {
  const out: Candidate[] = [];
  const lines = (csv ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue; // 純空白行，非資料錯誤
    const f = splitCsvFields(line);
    const preview = () => (line.length > 80 ? `${line.slice(0, 80)}…` : line);
    if (f.length < 15) {
      throw new Error(`elcand.csv 第 ${i + 1} 列欄位不足（${f.length} 欄，至少需 15 欄）：${preview()}`);
    }
    const t = (i2: number) => (f[i2] ?? '').trim();
    if (!t(6)) throw new Error(`elcand.csv 第 ${i + 1} 列的姓名欄為空：${preview()}`);
    const mark = t(14);
    if (mark !== '' && mark !== '*' && mark !== '!' && mark !== '?') {
      throw new Error(
        `elcand.csv 第 ${i + 1} 列的當選註記「${mark}」不是已知的四種值`
        + `（''／*／!／?），不猜測、不靜默當成落選：${preview()}`,
      );
    }
    out.push({
      areaCode: f.slice(0, 5).map((s) => s.trim()).join('-'),
      number: Number(t(5)),
      name: t(6),
      partyCode: t(7),
      sex: t(8) === '2' ? '2' : '1',
      birthDate: t(9),
      age: Number(t(10)),
      education: t(12),
      incumbent: t(13) === 'Y',
      electedMark: mark,
      elected: mark === '*' || mark === '!',
      electedBy: mark === '*' ? 'vote' : mark === '!' ? 'quota' : null,
      pendingDraw: mark === '?',
    });
  }
  return out;
}

/** 解析 elpaty.csv：政黨代號 → 政黨名稱。 */
export function parseElpaty(csv: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of (csv ?? '').split('\n')) {
    if (line.trim() === '') continue; // 純空白行，非資料錯誤
    const f = splitCsvFields(line).map((s) => s.trim());
    if (f.length < 2 || !f[0] || !f[1]) continue;
    m.set(f[0], f[1]);
  }
  return m;
}

/**
 * 依區彙整當選者。
 *
 * 首長與村里長每區一席，議員與代表每區數席，故值為陣列而非單一候選人。
 * 沒有當選者的區不建立條目——結果的鍵即「有人當選的區」。
 */
export function winnersByArea(cands: Candidate[]): Map<string, Candidate[]> {
  const m = new Map<string, Candidate[]>();
  for (const c of cands) {
    if (!c.elected) continue;
    m.set(c.areaCode, [...(m.get(c.areaCode) ?? []), c]);
  }
  return m;
}

/**
 * 依區彙整「得票相同、待抽籤」的候選人（註記 `?`）。
 *
 * 與 winnersByArea 分開回傳，而不是折進當選者裡：這些席位確實存在、也確實在開票
 * 當晚抽籤決定了，只是這份檔案沒記結果。呼叫端必須把它呈現成明確的「待抽籤」，
 * 不可顯示成「查無資料」（誤導成本站漏收），也不可挑一位當成當選者（純猜測）。
 */
export function pendingDrawByArea(cands: Candidate[]): Map<string, Candidate[]> {
  const m = new Map<string, Candidate[]>();
  for (const c of cands) {
    if (!c.pendingDraw) continue;
    m.set(c.areaCode, [...(m.get(c.areaCode) ?? []), c]);
  }
  return m;
}
