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

/** RFC4180 風格 CSV 拆列（支援雙引號包裹、引號內逗號與換行、"" 跳脫）。 */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

// 實際資料的金額是小數字串（如 "162000.00"），可能含千分位。digit-strip 會把小數點
// 後兩位併進整數（162000.00 → 16200000），所以必須走浮點解析再四捨五入取整數元。
const toAmount = (s: string): number => {
  const n = Number.parseFloat(String(s ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export function parseArdataCsv(text: string): DonationRow[] {
  const table = splitCsv(text.replace(/^﻿/, ''));
  if (table.length === 0) return [];
  const header = table[0].map((h) => h.trim());
  const idx = new Map<keyof DonationRow, number>();
  header.forEach((h, i) => { const k = HEADER_ALIASES[h]; if (k && !idx.has(k)) idx.set(k, i); });
  const missing = (['account', 'electionName', 'category', 'counterparty', 'income', 'expense'] as const)
    .filter((k) => !idx.has(k));
  if (missing.length) throw new Error(`ardata CSV 缺必要欄位: ${missing.join(',')}（header: ${header.join('|')}）`);
  const cell = (r: string[], k: keyof DonationRow) => (idx.has(k) ? (r[idx.get(k)!] ?? '').trim() : '');
  return table.slice(1).map((r) => ({
    account: cell(r, 'account'),
    electionName: cell(r, 'electionName'),
    reportSeq: cell(r, 'reportSeq'),
    category: cell(r, 'category'),
    counterparty: cell(r, 'counterparty'),
    income: toAmount(cell(r, 'income')),
    expense: toAmount(cell(r, 'expense')),
  })).filter((r) => r.account !== '');
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
