// 2026 選舉頁的分享縮圖（Open Graph，1200×630 PNG）。
//
//   pnpm run build:og-elections
//
// 輸出：
//   public/og/elections-2026.png           /elections 用：標題、總人數、六都各市長候選人
//   public/og/elections-2026-<key>.png     22 個縣市頁用：縣市長候選人姓名、議員選區數與人數
//
// 產物 PNG 要 commit：SVG 轉 PNG 靠本機中文字型（Noto Serif TC／PingFang TC／Heiti TC），
// Cloudflare 的建置環境沒有中文字型，不能在建置時產生——字會變方框。
// 名單換版（public/data/candidates/2026/ 更新）後重跑一次再 commit。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { STAGE_LABEL, chiefTitle, type CountyCandidates, type NationalCandidates } from '../../src/lib/candidateTypes';
import { orderCandidates } from '../../src/lib/candidateStats';
import { countyByCode } from '../../src/lib/countyKeys';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'og');
const W = 1200;
const H = 630;
const X = 80;               // 左右留白
const CONTENT_W = W - X * 2;

// 站上配色（src/styles/tokens.css 淺色主題）：暖白底、墨色字、--accent 細線。
const BG = '#faf9f6';
const FG = '#1b1a17';
const MUTED = '#595650';
const ACCENT = '#b3271e';
const LINE = 'rgba(60, 55, 50, 0.42)';
const FONT = `"Noto Serif TC","PingFang TC","Heiti TC",serif`;

const readJson = <T>(...p: string[]): T => JSON.parse(readFileSync(join(ROOT, 'public', 'data', ...p), 'utf8')) as T;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtInt = (n: number) => n.toLocaleString('en-US');

/** 粗估字寬（以字級為單位）：中日韓全形字 1、半形英數 0.55。只用來斷行，不求精準。 */
const textWidth = (s: string) => [...s].reduce((w, ch) => w + (/[\u0000-ÿ]/.test(ch) ? 0.55 : 1), 0);

/** 把姓名以「、」串接並依寬度斷行，姓名本身不斷開（極長姓名自成一行）。 */
function wrapNames(names: string[], fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const [i, n] of names.entries()) {
    const piece = n + (i < names.length - 1 ? '、' : '');
    if (cur && textWidth(cur + piece) * fontSize > maxWidth) { lines.push(cur); cur = piece; } else cur += piece;
  }
  if (cur) lines.push(cur);
  return lines;
}

const text = (x: number, y: number, size: number, body: string, o: { fill?: string; weight?: number; anchor?: string } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? FG}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(body)}</text>`;

/** 共用框：頂端站名＋accent 細線，底端資料來源。內容由各圖自行填入。 */
function frame(content: string, footer: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>text { font-family: ${FONT}; }</style>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${text(X, 92, 24, '政治人物背景資料庫', { fill: MUTED, weight: 700 })}
  ${text(W - X, 92, 24, '九合一選舉', { fill: MUTED, anchor: 'end' })}
  <rect x="${X}" y="114" width="${CONTENT_W}" height="2" fill="${ACCENT}"/>
  ${content}
  <rect x="${X}" y="${H - 86}" width="${CONTENT_W}" height="1" fill="${LINE}"/>
  ${text(X, H - 48, 22, footer, { fill: MUTED })}
</svg>`;
}

async function render(svg: string, file: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(join(OUT, file));
  console.log(`  ${file}`);
}

async function main(): Promise<void> {
  const national = readJson<NationalCandidates>('candidates', '2026', 'national.json');
  const councilFile = (code: string) => join(ROOT, 'public', 'data', 'candidates', '2026', 'county', `${code}.json`);
  const councils = new Map(national.races
    .filter((r) => existsSync(councilFile(r.countyCode)))
    .map((r) => [r.countyCode, readJson<CountyCandidates>('candidates', '2026', 'county', `${r.countyCode}.json`)]));
  const councilCount = (co: CountyCandidates | undefined) => co?.districts.reduce((n, d) => n + d.candidates.length, 0) ?? 0;
  const footer = `資料：${STAGE_LABEL[national.source.stage]}，製表 ${national.source.tableDate}`;

  mkdirSync(OUT, { recursive: true });
  console.log(`輸出到 ${OUT}`);

  // ── /elections 總圖 ──
  const chiefTotal = national.races.reduce((n, r) => n + r.candidates.length, 0);
  const councilTotal = [...councils.values()].reduce((n, co) => n + councilCount(co), 0);
  const muni = national.races.filter((r) => r.isMunicipality);
  const muniLines = muni.map((r, i) => {
    const y = 344 + i * 36;
    return `${text(X, y, 24, chiefTitle(r.countyName), { weight: 700 })}${text(X + 120, y, 24, orderCandidates(r.candidates).map((c) => c.name).join('、'), { fill: MUTED })}`;
  }).join('\n  ');
  await render(frame(`
  ${text(X, 208, 64, '2026 九合一選舉候選人', { weight: 900 })}
  ${text(X, 268, 32, `縣市長 ${fmtInt(chiefTotal)} 人・議員 ${fmtInt(councilTotal)} 人`, { fill: FG, weight: 700 })}
  ${muniLines}`, footer), 'elections-2026.png');

  // ── 22 縣市圖 ──
  for (const r of national.races) {
    const key = countyByCode(r.countyCode)?.key;
    if (!key) { console.warn(`  略過 ${r.countyName}：不在 countyKeys 對照表`); continue; }
    const co = councils.get(r.countyCode);
    const names = orderCandidates(r.candidates).map((c) => c.name);
    // 姓名字級隨行數縮小，最多約 3 行仍放得下。
    let size = 48;
    let lines = wrapNames(names, size, CONTENT_W);
    while (lines.length > 3 && size > 32) { size -= 4; lines = wrapNames(names, size, CONTENT_W); }
    const lineH = Math.round(size * 1.45);
    const nameSvg = lines.map((l, i) => text(X, 300 + i * lineH, size, l, { weight: 700 })).join('\n  ');
    const councilLine = co ? `${r.countyName}議員 ${co.districts.length} 選區 ${fmtInt(councilCount(co))} 人` : '';
    await render(frame(`
  ${text(X, 212, 64, `2026 ${chiefTitle(r.countyName)}候選人`, { weight: 900 })}
  ${nameSvg}
  ${councilLine ? text(X, H - 124, 30, councilLine, { fill: MUTED, weight: 700 }) : ''}`, footer), `elections-2026-${key}.png`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
