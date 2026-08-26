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

export type AreaLevel = 'county' | 'town' | 'village';

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
function splitCsvFields(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const raw = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  if (raw.map((v) => `"${v}"`).join(',') !== line) {
    const preview = line.length > 80 ? `${line.slice(0, 80)}…` : line;
    throw new Error(`CSV 列含引號但不符合已知的 Excel 匯出格式（無法還原比對）：${preview}`);
  }
  return raw.map((v) => v.replace(/^'/, ''));
}

/** 上溯到所屬縣市的代碼。選區別、鄉鎮市區別、村里別一律歸零。 */
export function countyCodeOf(areaCode: string): string {
  const s = seg(areaCode);
  return [s[0], s[1], '00', '000', '0000'].join('-');
}

/** 上溯到所屬鄉鎮市區的代碼。村里別歸零。 */
export function townCodeOf(areaCode: string): string {
  const s = seg(areaCode);
  return [s[0], s[1], s[2], s[3], '0000'].join('-');
}

/**
 * 解析 elbase.csv 為行政區樹。
 *
 * 層級不能只看「縣市別」欄位：直轄市在中選會代碼裡是用**省市別**表示的
 * （63 臺北、64 高雄、65 新北、66 臺中、67 臺南、68 桃園），其縣市別固定為 000，
 * 與「全國」列的 000 撞在一起。故以「鄉鎮市區別／村里別是否為空碼」判斷層級，
 * 並單獨排除省市別為 00 的全國列。
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
    if (village !== '0000') {
      out.push({ code, level: 'village', name: f[5], parent: [prv, city, dist, town, '0000'].join('-') });
    } else if (town !== '000') {
      out.push({ code, level: 'town', name: f[5], parent: [prv, city, dist, '000', '0000'].join('-') });
    } else {
      out.push({ code, level: 'county', name: f[5], parent: null });
    }
  }
  return out;
}

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
  elected: boolean;
}

/** 無黨籍。中選會以固定代號 999 表示「無黨籍及未經政黨推薦」。 */
export const INDEPENDENT_PARTY_CODE = '999';

/**
 * 解析 elcand.csv。
 *
 * 欄位：省市別, 縣市別, 選區別, 鄉鎮市區別, 村里別, 號次, 姓名, 政黨代號, 性別,
 *       出生日期, 年齡, 出生地, 學歷, 是否現任(Y/N), 當選註記(*), 副手註記
 *
 * 當選註記在原始檔中是「空白包夾的星號」（`,*, `），直接比對 '*' 會全部漏掉。
 * 政黨代號一律以字串保留：轉成數字會讓 999 這類代號失去「這是代碼不是數量」的語意。
 *
 * 2018 年（含）以前的匯出檔是 Excel 引號格式，見檔首說明；本函式已透過
 * splitCsvFields 自動剝除引號，呼叫端不需另外處理。
 */
export function parseElcand(csv: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of (csv ?? '').split('\n')) {
    if (line.trim() === '') continue; // 純空白行，非資料錯誤
    const f = splitCsvFields(line);
    if (f.length < 15) continue;
    const t = (i: number) => (f[i] ?? '').trim();
    if (!t(6)) continue;
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
      elected: t(14) === '*',
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
