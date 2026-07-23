// 監察院政治獻金公開查閱平臺 (https://ardata.cy.gov.tw) 整批下載 CSV 的解析與彙總。
// 下載端點與實際欄名見 scraper/fixtures/ardata-notes.md（Task 1 偵察）。
// 欄位格式依 data.gov.tw dataset 129494（政治獻金會計報告書）之公開欄位；
// 解析為 header-driven，欄序改變不影響，欄名變體加進 HEADER_ALIASES。

export interface DonationRow {
  account: string;      // 擬參選人/政黨（專戶名＝姓名）
  electionName: string; // 選舉名稱
  reportSeq: string;    // 申報序次(年度)
  category: string;     // 收支科目
  counterparty: string; // 捐贈者/支出對象
  income: number;       // 收入金額（元）
  expense: number;      // 支出金額（元）
  area?: string;        // 下載檔案所屬地區（縣市或 山地/平地原住民 等），非 CSV 欄位，由呼叫端附加
}

export interface TopDonor { donorName: string; donorType: string; amount: number; rank: number; }

export interface AccountSummary {
  name: string; electionName: string; reportSeq: string; area?: string;
  totalIncome: number; totalExpense: number;
  incomeByType: Record<string, number>;
  expenseByType: Record<string, number>;
  topDonors: TopDonor[];
}

// 欄名 → 內部鍵。左邊列出目前已知變體；遇到新變體加在這裡。
const HEADER_ALIASES: Record<string, keyof DonationRow> = {
  '擬參選人／政黨': 'account', '擬參選人/政黨': 'account', '擬參選人': 'account',
  '選舉名稱': 'electionName',
  '申報序號／年度': 'reportSeq', '申報序號/年度': 'reportSeq', '申報序號': 'reportSeq',
  '收支科目': 'category',
  '捐贈者／支出對象': 'counterparty', '捐贈者/支出對象': 'counterparty',
  '收入金額': 'income', '支出金額': 'expense',
};

// 實際資料的引號常不成對（如遮罩電話 `"+ "*****"`），不能用「見到 " 就切換模式」的天真
// 作法 — 那會在下一個不成對的 " 出現前，把後面整段（可能數千列）都吞進同一欄位。
// 規則改為：" 只在欄位開頭才視為「開引號」；引號內的 " 只有在後面緊接逗號/換行/EOF 時
// 才視為「關引號」，否則是字面 "；不在欄位開頭出現的 " 一律是字面字元。
//
// 這仍不夠：實際資料裡也有「支出用途」等自由文字欄位，內容本身以 " 開頭（當作引號/吋
// 符號用，非 CSV 引號語意），但整欄之後再也找不到配對的關閉引號（例：某列的支出用途
// 開頭是 "NO.雄獅奇異筆...，直到 273 列後才出現下一個 "）。若仍無條件開引號模式，會把
// 中間所有列的換行都當成欄位內容吞掉——欄數剛好還是會對上 header（因為只有一個欄位被
// 撐大），列數驗證抓不到，是比遮罩電話更隱蔽的吞列（曾在此發現 洪健益 支出被吞成 0）。
// 因此加一個「同列內是否找得到合法關閉引號」的前瞻：找不到就不當作開引號（該 " 視為
// 字面字元，欄位照未加引號規則處理），避免引號狀態跨越真正的裸換行列邊界。此資料集本來
// 就沒有合法的「跨列加引號」欄位（唯一的裸換行案例是未加引號的，見 parseArdataCsv）。
function closesOnSameLine(text: string, from: number): boolean {
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      const next = text[i + 1];
      if (next === undefined || next === ',' || next === '\n' || next === '\r') return true;
      continue; // 字面 "，繼續往後找
    }
    if (ch === '\n' || ch === '\r') return false; // 撞到裸換行仍未關閉 → 這個 " 不算開引號
  }
  return true; // 到 EOF 都沒撞到換行，直接關在檔尾也算合法
}

/** RFC4180 風格 CSV 拆列，但引號規則對真實資料的不成對引號較寬容（見上）。 */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false, fieldStart = true;
  const pushField = () => { row.push(field); field = ''; fieldStart = true; };
  const pushRow = () => {
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === undefined || next === ',' || next === '\n' || next === '\r') inQuotes = false;
        else field += '"'; // 引號內的 " 但後面不是分隔字元 → 字面 "，不關閉引號
      } else field += ch;
      continue;
    }
    if (fieldStart && ch === '"' && closesOnSameLine(text, i + 1)) { inQuotes = true; fieldStart = false; continue; }
    if (ch === ',') { pushField(); continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushField();
      pushRow();
      continue;
    }
    field += ch;
    fieldStart = false;
  }
  pushField();
  pushRow();
  return rows;
}

// 實際資料的金額是小數字串（如 "162000.00"），可能含千分位。digit-strip 會把小數點
// 後兩位併進整數（162000.00 → 16200000），所以必須走浮點解析再四捨五入取整數元。
const toAmount = (s: string): number => {
  const n = Number.parseFloat(String(s ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export function parseArdataCsv(text: string): DonationRow[] {
  const table = splitCsv(text.replace(/^\uFEFF/, ''));
  if (table.length === 0) return [];
  const header = table[0].map((h) => h.trim());
  const idx = new Map<keyof DonationRow, number>();
  header.forEach((h, i) => { const k = HEADER_ALIASES[h]; if (k && !idx.has(k)) idx.set(k, i); });
  const missing = (['account', 'electionName', 'category', 'counterparty', 'income', 'expense'] as const)
    .filter((k) => !idx.has(k));
  if (missing.length) throw new Error(`ardata CSV 缺必要欄位: ${missing.join(',')}（header: ${header.join('|')}）`);
  const cell = (r: string[], k: keyof DonationRow) => (idx.has(k) ? (r[idx.get(k)!] ?? '').trim() : '');

  // 列形驗證：欄數與 header 不符的列（通常是未加引號欄位裡混進的裸換行，把一列拆成
  // 好幾個殘段）一律跳過，不強行對位塞值——否則統編/日期等字串會錯位跑進金額欄。
  // 跳過筆數若異常多，代表拆列本身壞了（如引號硬化失效），寧可整檔失敗也不要吞資料。
  const dataRows = table.slice(1);
  const rows: DonationRow[] = [];
  let skipped = 0;
  for (const r of dataRows) {
    if (r.length !== header.length) { skipped++; continue; }
    rows.push({
      account: cell(r, 'account'),
      electionName: cell(r, 'electionName'),
      reportSeq: cell(r, 'reportSeq'),
      category: cell(r, 'category'),
      counterparty: cell(r, 'counterparty'),
      income: toAmount(cell(r, 'income')),
      expense: toAmount(cell(r, 'expense')),
    });
  }
  const threshold = Math.max(20, Math.ceil(dataRows.length * 0.01));
  if (skipped > threshold) {
    throw new Error(
      `ardata CSV 列形不符跳過 ${skipped} 列（門檻 ${threshold}，總資料列 ${dataRows.length}）— 疑似拆列失敗，中止解析`,
    );
  }
  return rows.filter((r) => r.account !== '');
}

// 收支科目 → 捐贈者類別（大額捐贈者表用）。匿名/其他不進捐贈者表。
const DONOR_TYPE_BY_CATEGORY: Record<string, string> = {
  '個人捐贈收入': '個人',
  '營利事業捐贈收入': '營利事業',
  '政黨捐贈收入': '政黨',
  '人民團體捐贈收入': '人民團體',
};

export function aggregateAccounts(rows: DonationRow[], topIndividuals = 20): AccountSummary[] {
  const byAccount = new Map<string, DonationRow[]>();
  for (const r of rows) {
    // area 併入分組鍵：一個專戶只會出現在單一地區的檔案裡，此鍵不會拆散同一專戶。
    const key = `${r.account}|${r.electionName}|${r.reportSeq}|${r.area ?? ''}`;
    (byAccount.get(key) ?? byAccount.set(key, []).get(key)!).push(r);
  }
  const out: AccountSummary[] = [];
  for (const group of byAccount.values()) {
    const s: AccountSummary = {
      name: group[0].account, electionName: group[0].electionName, reportSeq: group[0].reportSeq,
      area: group[0].area,
      totalIncome: 0, totalExpense: 0, incomeByType: {}, expenseByType: {}, topDonors: [],
    };
    const donorAmounts = new Map<string, { donorName: string; donorType: string; amount: number }>();
    for (const r of group) {
      s.totalIncome += r.income;
      s.totalExpense += r.expense;
      if (r.income > 0) s.incomeByType[r.category] = (s.incomeByType[r.category] ?? 0) + r.income;
      if (r.expense > 0) s.expenseByType[r.category] = (s.expenseByType[r.category] ?? 0) + r.expense;
      const donorType = DONOR_TYPE_BY_CATEGORY[r.category];
      if (donorType && r.income > 0 && r.counterparty) {
        const k = `${donorType}|${r.counterparty}`;
        const d = donorAmounts.get(k) ?? { donorName: r.counterparty, donorType, amount: 0 };
        d.amount += r.income;
        donorAmounts.set(k, d);
      }
    }
    const donors = [...donorAmounts.values()].sort((a, b) => b.amount - a.amount);
    const individuals = donors.filter((d) => d.donorType === '個人').slice(0, topIndividuals);
    const kept = new Set(individuals);
    s.topDonors = donors
      .filter((d) => d.donorType !== '個人' || kept.has(d))
      .map((d, i) => ({ ...d, rank: i + 1 }));
    out.push(s);
  }
  return out;
}
