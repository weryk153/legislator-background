import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { ShareCardData } from './shareCardData';
import { renderCardSvg, wrapCardText } from './renderShareCard';
import QRCode from 'qrcode';

// 與網站一致的純白紙面、墨黑文字及朱紅；人物身分、背景、申報各成一層。
const colors = { ink: '#000000', muted: '#555555', accent: '#b3271e', paper: '#ffffff' };
const font = 'Noto Serif TC,Civic Rare Glyphs bmp,Civic Rare Glyphs ext,Civic Share Fallback,Civic Portrait Fallback,Civic Share Latin';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (x: number, y: number, size: number, s: string, color = colors.ink, bold = false) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${color}" font-weight="${bold ? 900 : 400}">${esc(s)}</text>`;

function fit(s: string, width: number, maxSize: number, minSize: number, count: number) {
  let size = maxSize;
  let lines = wrapCardText(s, width / size);
  while (lines.length > count && size > minSize) { size--; lines = wrapCardText(s, width / size); }
  return { size, lines };
}

function wrapReadable(value: string, maxUnits: number): string[] {
  const tokens = value.match(/\d{4}(?:[-/]\d{2}){1,2}|[\p{Script=Latin}\p{M}'’.-]+|\s+|./gu) ?? [];
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line && wrapCardText(line + token, maxUnits).length > 1) {
      const opening = line.match(/[（(「『]\s*$/)?.[0] ?? '';
      const completed = (opening ? line.slice(0, -opening.length) : line).trim();
      if (completed) lines.push(completed);
      line = opening;
    }
    const pieces = wrapCardText(line + token, maxUnits);
    if (pieces.length > 1) { lines.push(...pieces.slice(0, -1)); line = pieces.at(-1)!; }
    else line += token;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function fitName(name: string) {
  const units = [...name].reduce((sum, c) => sum + (/[\u0000-\u00ff]/.test(c) ? .7 : 1), 0);
  const maxSize = units <= 5.5 ? 110 : 72;
  const tokens = name.match(/[\p{Script=Latin}\p{M}'’.-]+|\s+|./gu) ?? [];
  for (let size = maxSize; size >= 28; size--) {
    const lines: string[] = [];
    let line = '';
    for (const token of tokens) {
      if (line && wrapCardText(line + token, 620 / size).length > 1) { lines.push(line.trim()); line = ''; }
      line += token;
    }
    if (line.trim()) lines.push(line.trim());
    if (lines.length <= 2 && lines.every(s => wrapCardText(s, 620 / size).length === 1)) {
      if (lines.length === 2 && !/[A-Za-z\s]/.test(name)) {
        const chars = [...name], middle = Math.floor(chars.length / 2);
        const balanced = [chars.slice(0, middle).join(''), chars.slice(middle).join('')];
        if (balanced.every(s => wrapCardText(s, 620 / size).length === 1)) return { size, lines: balanced };
      }
      return { size, lines };
    }
  }
  const result = fit(name, 620, 72, 28, 3);
  if (result.lines.length > 3) throw new Error(`圖卡姓名超過版面：${name}`);
  return result;
}

function portrait(card: ShareCardData, top: number, height: number): string {
  let content = '';
  if (card.photoUrl?.startsWith('/photos/')) {
    const root = resolve('public');
    const path = resolve(root, `.${card.photoUrl}`);
    if (path.startsWith(root + sep) && existsSync(path)) {
      const mime = /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg';
      content = `<image x="736" y="${top}" width="280" height="${height}" preserveAspectRatio="xMidYMid meet" href="data:${mime};base64,${readFileSync(path).toString('base64')}"/>`;
    }
  }
  if (!content) content = `<rect x="736" y="${top}" width="280" height="${height}" fill="#f4f4f4"/>
    ${text(820, top + height / 2 + 20, 108, [...card.heading][0], '#c6c6c6', true)}
    ${text(810, top + height - 35, 22, '照片尚未收錄', colors.muted)}`;
  return content + `<path d="M736 ${top + 28}v-28h28 M988 ${top + height}h28v-28" fill="none" stroke="#000" stroke-width="3"/>`;
}

/** 下載用人物卡；選舉年份不推定任期，申報摘錄不計算總資產。 */
export function portraitCardSvg(card: ShareCardData): string {
  if (card.kind !== 'person' || !card.url) throw new Error(`非人物圖卡：${card.id}`);
  const name = fitName(card.heading);
  const role = fit(card.subtitle, 620, 29, 20, 3);
  const detail = fit(card.detail, 620, 25, 18, 2);
  if (role.lines.length > 3 || detail.lines.length > 2) throw new Error(`圖卡身分超過版面：${card.id}`);
  const heroTop = 116, nameTop = 171;
  const roleTop = nameTop + name.lines.length * (name.size + 10) + 48;
  const detailTop = roleTop + Math.max(0, role.lines.length - 1) * 34 + 36;
  const heroBottom = Math.max(heroTop + 330, detailTop + Math.max(0, detail.lines.length - 1) * 28 + 26);
  const bodyTop = heroBottom + 38;
  const hasFinance = Boolean(card.assets || card.donations);
  const sources = new Set<string>();

  function backgroundSection(x: number, label: string, rows: { text: string; source: string }[]) {
    const budget = hasFinance ? 340 : 470;
    let size = 28;
    let values = rows.slice(0, 6);
    const measure = () => values.reduce((sum, r) => sum + wrapReadable(r.text, 418 / size).length * (size + 9) + 18, 0);
    while (size > 23 && measure() > budget) size--;
    while (values.length > 1 && measure() > budget - 30) values = values.slice(0, -1);
    let y = bodyTop + 83;
    let content = `<rect x="${x}" y="${bodyTop + 6}" width="5" height="23" fill="${colors.accent}"/>
      ${text(x + 17, bodyTop + 28, 26, label, colors.ink, true)}
      <line x1="${x}" y1="${bodyTop + 45}" x2="${x + 438}" y2="${bodyTop + 45}" stroke="#ccc"/>`;
    if (!values.length) content += text(x, y, 25, '尚未收錄', colors.muted);
    for (const value of values) {
      let lines = wrapReadable(value.text, 418 / size);
      if (lines.length * (size + 9) > budget - 30) lines = ['完整記載見人物頁'];
      sources.add(value.source);
      content += `<rect x="${x}" y="${y - 12}" width="5" height="5" fill="#000"/>`
        + lines.map((line, i) => text(x + 19, y + i * (size + 9), size, line)).join('');
      y += lines.length * (size + 9) + 18;
    }
    if (rows.length > values.length) {
      content += text(x, y, 17, `另有 ${rows.length - values.length} 筆，詳見人物頁`, colors.muted);
      y += 28;
    }
    return { content, bottom: Math.max(bodyTop + 105, y - 20) };
  }
  const edu = card.profileEducation ?? card.education ?? [];
  const education = backgroundSection(64, `學歷${edu[0]?.year ? `・${edu[0].year} 年資料` : ''}`, edu);
  const career = backgroundSection(560, '經歷', card.profileCareers ?? card.careers ?? []);
  const contentBottom = Math.max(education.bottom, career.bottom);
  const years = card.electionYears ?? [];
  const shownYears = years.slice(-7);
  const timelineTop = contentBottom + 37;
  const step = shownYears.length > 1 ? 860 / (shownYears.length - 1) : 0;
  const timeline = years.length ? `
    ${text(64, timelineTop + 25, 26, '當選年份', colors.ink, true)}
    ${text(264, timelineTop + 22, 16, `${years.length > 7 ? '最近七筆；' : ''}中選會候選人資料・依本站收錄年份`, colors.muted)}
    <line x1="104" y1="${timelineTop + 53}" x2="${104 + (shownYears.length - 1) * step}" y2="${timelineTop + 53}" stroke="#bbb" stroke-width="2"/>
    ${shownYears.map((year, i) => `<circle cx="${104 + i * step}" cy="${timelineTop + 53}" r="5" fill="#000"/>
      ${text(68 + i * step, timelineTop + 95, 30, String(year), colors.ink, true)}`).join('')}` : '';
  if (years.length) sources.add('中選會候選人資料');

  const financeTop = (years.length ? timelineTop + 95 : contentBottom) + 37;
  let financial = '', financeBottom = financeTop;
  if (hasFinance) {
    const dual = Boolean(card.assets && card.donations);
    const panelWidth = dual ? 416 : 904;
    const d = card.donations;
    const election = d?.election.replace(/^(\d{2,3})年/, (_, year) => `${Number(year) + 1911}年`) ?? '';
    const electionFit = fit(election, panelWidth, 21, 16, 2);
    if (electionFit.lines.length > 2) throw new Error(`選舉名稱超過版面：${card.id}`);
    const extra = Math.max(0, electionFit.lines.length - 1) * 24;
    const metricTop = financeTop + 107 + extra;
    const report = d ? fit(`${d.report}・監察院收支資料彙總`, panelWidth, 16, 13, 2) : null;
    if (report && report.lines.length > 2) throw new Error(`申報名稱超過版面：${card.id}`);
    const panelHeight = (d ? 270 + Math.max(0, (report?.lines.length ?? 1) - 1) * 19 : dual ? 260 : 180) + extra;
    const metric = (x: number, y: number, width: number, label: string, value: string) =>
      text(x, y, 18, label, '#ccc')
      + text(x, y + 38, Math.min(36, (width - 14) / (value.length * .7)), value, '#fff', true);
    financial += `<rect x="64" y="${financeTop}" width="952" height="${panelHeight}" fill="#171717"/>`;
    if (dual) financial += `<line x1="540" y1="${financeTop + 26}" x2="540" y2="${financeTop + panelHeight - 25}" stroke="#555"/>`;
    if (card.assets) {
      const asset = card.assets;
      sources.add(asset.source);
      const columns = dual ? 2 : 4;
      financial += text(88, financeTop + 42, 27, '財產申報', '#fff', true)
        + text(88, financeTop + 73, 21, `${asset.year} 年`, '#ccc')
        + asset.values.map((v, i) => metric(88 + (i % columns) * panelWidth / columns, metricTop + Math.floor(i / columns) * 88, panelWidth / columns, v.label, v.value)).join('');
    }
    if (d) {
      sources.add(d.source);
      const x = card.assets ? 576 : 88;
      financial += text(x, financeTop + 42, 27, '政治獻金', '#fff', true)
        + electionFit.lines.map((s, i) => text(x, financeTop + 73 + i * 24, electionFit.size, s, '#ccc')).join('')
        + metric(x, metricTop, panelWidth / 2, '收入總額（元）', new Intl.NumberFormat('zh-TW').format(d.income))
        + metric(x + panelWidth / 2, metricTop, panelWidth / 2, '支出總額（元）', new Intl.NumberFormat('zh-TW').format(d.expense));
      if (d.income > 0 && d.individual !== undefined && d.corporate !== undefined && d.individual >= 0 && d.corporate >= 0 && d.individual + d.corporate <= d.income) {
        const individual = d.individual / d.income, corporate = d.corporate / d.income;
        financial += `<rect x="${x}" y="${metricTop + 70}" width="${panelWidth}" height="12" fill="#555"/>
          <rect x="${x}" y="${metricTop + 70}" width="${panelWidth * individual}" height="12" fill="#fff"/>
          <rect x="${x + panelWidth * individual}" y="${metricTop + 70}" width="${panelWidth * corporate}" height="12" fill="#aaa"/>`
          + text(x, metricTop + 110, 16, `個人 ${(individual * 100).toFixed(1)}%　企業 ${(corporate * 100).toFixed(1)}%　其餘 ${((1 - individual - corporate) * 100).toFixed(1)}%`, '#ccc');
      }
      financial += report!.lines.map((s, i) => text(x, metricTop + 143 + i * 19, report!.size, s, '#ccc')).join('');
    }
    financeBottom = financeTop + panelHeight;
    if (card.assets) {
      financial += text(64, financeBottom + 26, 15, '財產為公報自動解析摘錄，非總資產；申報範圍與金額請核對原文。', colors.muted);
      financeBottom += 32;
    }
  }
  const footerTop = (hasFinance ? financeBottom : years.length ? timelineTop + 95 : contentBottom) + 38;
  const cardHeight = Math.ceil(footerTop + 202);
  const source = fit(`來源：${[...sources].filter(Boolean).join('；') || '人物頁所列公開資料'}`, 748, 16, 13, 3);
  if (source.lines.length > 3) source.lines = ['來源標題較長，完整出處見人物頁'];
  const credit = card.photoCredit ? fit(`照片：${card.photoCredit}`, 748, 14, 11, 2) : null;
  if (credit && credit.lines.length > 2) throw new Error(`照片署名超過版面：${card.id}`);
  const qr = QRCode.create(card.url, { errorCorrectionLevel: 'M' }).modules;
  const scale = Math.max(1, Math.floor(158 / (qr.size + 8)));
  const side = (qr.size + 8) * scale;
  const left = 858 + Math.floor((158 - side) / 2), top = footerTop + 9 + Math.floor((158 - side) / 2);
  let pixels = '';
  for (let row = 0; row < qr.size; row++) for (let col = 0; col < qr.size; col++) {
    if (qr.get(row, col)) pixels += `M${left + (col + 4) * scale},${top + (row + 4) * scale}h${scale}v${scale}h-${scale}z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${cardHeight}" viewBox="0 0 1080 ${cardHeight}">
    <rect width="1080" height="${cardHeight}" fill="${colors.paper}"/>
    ${text(64, 53, 26, '政治人物背景資料庫', colors.ink, true)}
    ${text(800, 50, 18, `更新 ${card.date}`, colors.muted)}
    <line x1="64" y1="79" x2="1016" y2="79" stroke="#000" stroke-width="3"/>
    <rect x="64" y="119" width="6" height="21" fill="${colors.accent}"/>
    ${text(83, 137, 20, card.note.startsWith('已非現任') ? '歷史資料' : '人物檔案', colors.accent, true)}
    ${name.lines.map((s, i) => text(64, nameTop + name.size + i * (name.size + 10), name.size, s, colors.ink, true)).join('')}
    ${role.lines.map((s, i) => text(64, roleTop + i * 34, role.size, s)).join('')}
    ${detail.lines.map((s, i) => text(64, detailTop + i * 28, detail.size, s, colors.muted)).join('')}
    ${portrait(card, heroTop, heroBottom - heroTop)}
    ${education.content}${career.content}
    ${timeline}${financial}
    <line x1="64" y1="${footerTop}" x2="1016" y2="${footerTop}" stroke="#ccc"/>
    ${source.lines.map((s, i) => text(64, footerTop + 30 + i * 20, source.size, s, colors.muted)).join('')}
    ${credit ? credit.lines.map((s, i) => text(64, footerTop + 99 + i * 16, credit.size, s, colors.muted)).join('') : ''}
    ${text(64, footerTop + 161, 18, new URL(card.url).hostname, colors.muted)}
    <rect x="858" y="${footerTop + 9}" width="158" height="158" fill="#fff"/><path d="${pixels}" fill="#000"/>
    ${text(877, footerTop + 184, 16, '完整資料與來源', colors.muted)}
  </svg>`;
}

export function renderPortraitCard(card: ShareCardData): Buffer {
  return renderCardSvg(portraitCardSvg(card), ['NotoSerifTC-Black.ttf', 'CivicPortraitFallback.otf']);
}
