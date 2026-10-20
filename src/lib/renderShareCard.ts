import { Resvg } from '@resvg/resvg-js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ShareCardData } from './shareCardData';
import QRCode from 'qrcode';

const FONT = 'Noto Serif TC,Civic Rare Glyphs bmp,Civic Rare Glyphs ext,Civic Share Fallback,Civic Share Latin';
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const units = (text: string) => [...text].reduce((n, c) => n + (/[\u0000-\u00ff]/.test(c) ? 0.7 : 1), 0);

/** 姓名不截斷；以偏保守字寬折行，兼顧原住民羅馬拼音與長姓名。 */
export function wrapCardText(text: string, maxUnits: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const c of text) {
    if (line && units(line + c) > maxUnits) { lines.push(line); line = ''; }
    line += c;
  }
  if (line) lines.push(line);
  return lines;
}

const text = (x: number, y: number, size: number, body: string, fill = '#1b1a17') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}">${esc(body)}</text>`;

export function shareCardSvg(card: ShareCardData): string {
  if (card.kind === 'person' && card.url) return personSummarySvg(card);
  let size = card.kind === 'person' ? 88 : 64;
  let headings = wrapCardText(card.heading, 1040 / size);
  if (headings.length > 1) { size = Math.min(size, 72); headings = wrapCardText(card.heading, 1040 / size); }
  while (headings.length > 2 && size > 28) { size -= 2; headings = wrapCardText(card.heading, 1040 / size); }
  if (headings.length > 2) throw new Error(`圖卡姓名超過版面：${card.id}`);
  if (headings.length === 2) {
    const balanced = wrapCardText(card.heading, Math.min(1040 / size, Math.ceil(units(card.heading) / 2)));
    if (balanced.length === 2) headings = balanced;
  }
  const subtitles = wrapCardText(card.subtitle, 1040 / 32);
  // 範圍全文仍在選區頁，圖卡最多兩行並明示省略，姓名與身分不省略。
  const details = wrapCardText(card.detail, 1040 / 26);
  const detailLines = details.slice(0, 2);
  if (details.length > 2) detailLines[1] += '…';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#faf9f6"/>
    ${text(80, 76, 26, '政治人物背景資料庫', '#595650')}
    <rect x="80" y="101" width="1040" height="3" fill="#b3271e"/>
    ${text(80, 148, 23, card.kind === 'person' ? '人物資料・公開來源' : '我的選區・候選人名單', '#b3271e')}
    ${headings.map((line, i) => text(80, 244 + i * (size + 12), size, line)).join('')}
    ${subtitles.map((line, i) => text(80, 380 + i * 42, 32, line)).join('')}
    ${detailLines.map((line, i) => text(80, 466 + i * 34, 26, line, '#595650')).join('')}
    <line x1="80" y1="532" x2="1120" y2="532" stroke="#aaa59d"/>
    ${text(80, 571, 23, `${card.note}・${card.kind === 'district' ? '製表' : '資料更新'} ${card.date}`, '#595650')}
    ${text(80, 607, 18, '非官方網站・名單與紀錄狀態請見頁面原始來源', '#595650')}
  </svg>`;
}

function personSummarySvg(card: ShareCardData): string {
  let size = 56;
  let names = wrapCardText(card.heading, 870 / size);
  while (names.length > 2 && size > 28) { size -= 2; names = wrapCardText(card.heading, 870 / size); }
  if (names.length > 2) throw new Error(`圖卡姓名超過版面：${card.id}`);
  if (names.length === 2) {
    const balanced = wrapCardText(card.heading, Math.min(870 / size, Math.ceil(units(card.heading) / 2)));
    if (balanced.length === 2) names = balanced;
  }
  const role = wrapCardText(`${card.subtitle}・${card.detail}`, 870 / 24);
  if (role.length > 2) throw new Error(`圖卡身分超過版面：${card.id}`);
  const edu = card.education ?? [];
  const careers = card.careers ?? [];
  const section = (x: number, label: string, rows: { text: string; source: string }[]) => {
    let y = 352;
    const content = (rows.length ? rows : [{ text: '本站尚未收錄可核對資料', source: '' }]).map(row => {
      let lines = wrapCardText(row.text, 510 / 24);
      // 不截斷學位、肄業或歷年任職等限定語，過長記載交由完整來源呈現。
      if (lines.length > 3) lines = ['記載較長，請掃碼查看完整內容'];
      const result = lines.map(line => text(x, y += 28, 24, line)).join('');
      y += 10;
      return result;
    }).join('');
    const sources = [...new Set(rows.map(r => r.source).filter(Boolean))].join('；');
    const sourceLines = wrapCardText(sources ? `來源：${sources}` : '未收錄不代表沒有相關學經歷', 510 / 15);
    if (sourceLines.length > 2) sourceLines.splice(1, sourceLines.length - 1, `${sourceLines[1]}…`);
    return `${text(x, 330, 23, label, '#b3271e')}${content}${sourceLines.map((line, i) => text(x, 563 + i * 19, 15, line, '#595650')).join('')}`;
  };
  const qr = QRCode.create(card.url!, { errorCorrectionLevel: 'M' }).modules;
  const scale = Math.floor(168 / (qr.size + 8));
  const left = 972 + Math.floor((168 - (qr.size + 8) * scale) / 2);
  let pixels = '';
  for (let row = 0; row < qr.size; row++) for (let col = 0; col < qr.size; col++) {
    if (qr.get(row, col)) pixels += `M${left + (col + 4) * scale},${88 + (row + 4) * scale}h${scale}v${scale}h-${scale}z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#faf9f6"/>
    ${text(60, 40, 21, '政治人物背景資料庫｜人物背景摘要', '#595650')}
    ${text(885, 40, 18, `資料更新 ${card.date}`, '#595650')}
    <rect x="60" y="61" width="1080" height="3" fill="#b3271e"/>
    ${names.map((line, i) => text(60, names.length === 1 ? 156 : 125 + i * 60, size, line)).join('')}
    ${role.map((line, i) => text(60, 228 + i * 30, 24, line)).join('')}
    <rect x="972" y="88" width="168" height="168" fill="#fff"/>
    <path d="${pixels}" fill="#000"/>
    ${text(966, 278, 15, '掃碼看完整資料與出處', '#595650')}
    <line x1="60" y1="299" x2="1140" y2="299" stroke="#aaa59d"/>
    <line x1="600" y1="316" x2="600" y2="538" stroke="#ddd9d1"/>
    ${section(60, `學歷摘錄${edu[0]?.year ? `・${edu[0].year} 年資料` : ''}`, edu)}
    ${section(630, '經歷摘錄', careers)}
    ${text(60, 612, 16, `${card.note.startsWith('已非現任') ? '已非現任；' : ''}非完整履歷或最高學歷判定；原文、歷年資料與更新狀態請見來源。`, '#595650')}
  </svg>`;
}

export function renderShareCard(card: ShareCardData): Buffer {
  return renderCardSvg(shareCardSvg(card));
}

export function renderCardSvg(svg: string, extraFonts: string[] = []): Buffer {
  const fonts = ['NotoSerifTC-Regular.ttf', 'civic-rare-bmp.ttf', 'civic-rare-ext.ttf', 'CivicShareFallback.otf', 'CivicShareLatin.ttf', ...extraFonts]
    .map(file => join(process.cwd(), 'src/assets/fonts', file));
  const hash = createHash('sha256').update(svg).update(fontSignature(fonts)).digest('hex');
  // Cloudflare Pages preserves node_modules/.astro when build caching is enabled.
  const dir = join(process.cwd(), 'node_modules/.astro/share-card-cache');
  const file = join(dir, `${hash}.png`);
  if (existsSync(file)) return readFileSync(file);
  const png = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: fonts,
      defaultFontFamily: 'Noto Serif TC',
    },
  }).render().asPng();
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, png);
  return png;
}

const signatures = new Map<string, string>();
function fontSignature(files: string[]): string {
  const key = files.join('\n');
  let signature = signatures.get(key);
  if (!signature) {
    const hash = createHash('sha256').update('resvg-2.6.2');
    for (const file of files) hash.update(readFileSync(file));
    signature = hash.digest('hex');
    signatures.set(key, signature);
  }
  return signature;
}
