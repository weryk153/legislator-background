// 中選會〈候選人登記名冊〉PDF 解析。
//
// 為什麼不用 pdftotext -layout：原住民姓名（「蘇錦雄 Paylang‧Caya」）與長政黨名
// （「天宙和平統一家庭黨」）在 PDF 裡折成兩三行，而且是以登記日期那一列為中心
// 上下展開——逐行正則會把上一行的半個姓名當成獨立一列或乾脆漏掉（試做時 1,583 列
// 只抓到 1,577 列）。改用 -bbox 取每個字詞的座標：以表頭字詞的 x 中心切欄，以
// 「登記日期」字詞為列錨點，每個字詞歸給 y 中心最近的錨點。
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RegistrationRow {
  district: string;
  registeredOn: string;   // ISO，如 2026-09-02
  name: string;
  party: string;
  note: string;
  number: number | null;  // 號次；登記名冊階段沒有這欄
}

interface Word { x0: number; y0: number; x1: number; y1: number; text: string }

const DATE_RE = /^(\d{3})\/(\d{2})\/(\d{2})$/;
type Col = 'number' | 'district' | 'date' | 'name' | 'party' | 'note';
const HEADER: Record<string, Col> = {
  號次: 'number', 選舉區: 'district', 登記日期: 'date', 姓名: 'name', 推薦之政黨: 'party', 備註: 'note',
};

const unescape = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function pagesOf(html: string): Word[][] {
  return html.split(/<page\b/).slice(1).map((p) =>
    [...p.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: unescape(m[5]) })));
}

const cx = (w: Word) => (w.x0 + w.x1) / 2;
const cy = (w: Word) => (w.y0 + w.y1) / 2;

function rocToIso(s: string): string {
  const m = s.match(DATE_RE)!;
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
}

function parsePage(words: Word[], pageNo: number): RegistrationRow[] {
  const nameHead = words.find((w) => w.text === '姓名');
  if (!nameHead) return [];
  const headers = words
    .filter((w) => HEADER[w.text] && Math.abs(w.y0 - nameHead.y0) < 2)
    .sort((a, b) => cx(a) - cx(b));
  // 相鄰表頭 x 中心的中點即欄界
  const bounds = headers.map((h, i) => ({
    col: HEADER[h.text],
    lo: i === 0 ? -Infinity : (cx(headers[i - 1]) + cx(h)) / 2,
    hi: i === headers.length - 1 ? Infinity : (cx(h) + cx(headers[i + 1])) / 2,
  }));
  const colOf = (w: Word): Col => bounds.find((b) => cx(w) >= b.lo && cx(w) < b.hi)!.col;

  const headBottom = Math.max(...headers.map((h) => h.y1));
  const body = words.filter((w) => w.y0 > headBottom && !w.text.startsWith('製表日期'));
  const anchors = body.filter((w) => DATE_RE.test(w.text) && colOf(w) === 'date').sort((a, b) => cy(a) - cy(b));

  const cells = anchors.map(() => new Map<Col, Word[]>());
  for (const w of body) {
    if (anchors.length === 0) break;
    let best = 0;
    for (let i = 1; i < anchors.length; i++) {
      if (Math.abs(cy(anchors[i]) - cy(w)) < Math.abs(cy(anchors[best]) - cy(w))) best = i;
    }
    const c = colOf(w);
    (cells[best].get(c) ?? cells[best].set(c, []).get(c)!).push(w);
  }

  const text = (m: Map<Col, Word[]>, c: Col) =>
    (m.get(c) ?? []).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).map((w) => w.text).join('');

  return anchors.map((a, i) => {
    const m = cells[i];
    const row: RegistrationRow = {
      district: text(m, 'district'),
      registeredOn: rocToIso(a.text),
      name: text(m, 'name'),
      party: text(m, 'party'),
      note: text(m, 'note'),
      number: m.has('number') ? Number(text(m, 'number')) : null,
    };
    for (const k of ['district', 'name', 'party'] as const) {
      if (!row[k]) throw new Error(`第 ${pageNo} 頁 ${a.text} 那一列缺「${k === 'name' ? '姓名' : k === 'party' ? '推薦之政黨' : '選舉區'}」`);
    }
    if (row.number !== null && !Number.isInteger(row.number)) {
      throw new Error(`第 ${pageNo} 頁 ${a.text} 那一列號次不是整數：${text(m, 'number')}`);
    }
    return row;
  });
}

/**
 * 解析整份名冊。完整性斷言：每列恰有一個登記日期，故全檔日期字詞數即應有列數；
 * 解析出的列數不符就拋錯，不得靜默漏人。
 */
export function parseRegistrationBbox(html: string): RegistrationRow[] {
  const pages = pagesOf(html);
  const rows = pages.flatMap((ws, i) => parsePage(ws, i + 1));
  const expected = pages.flat().filter((w) => DATE_RE.test(w.text)).length;
  if (rows.length !== expected) {
    throw new Error(`名冊解析列數 ${rows.length} 與登記日期字詞數 ${expected} 不符——有列被漏抓或重複`);
  }
  return rows;
}

const PDFTOTEXT = () => execSync('brew --prefix').toString().trim() + '/bin/pdftotext';

export function pdfToBbox(pdfPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cand-bbox-'));
  try {
    const out = join(dir, 'out.html');
    execFileSync(PDFTOTEXT(), ['-bbox', pdfPath, out]);
    return readFileSync(out, 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
