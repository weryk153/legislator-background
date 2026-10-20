import QRCode from 'qrcode';
import { renderCardSvg, wrapCardText } from './renderShareCard';
import type { DistrictPageData } from './districtPageData';
import { districtAreaSummary } from './districtPage';
import { isCouncilReelect, orderCandidates, partyLabel } from './candidateStats';
import { STAGE_LABEL } from './candidateTypes';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { DistrictCardProfile } from './districtCardProfiles';

const font = 'Noto Serif TC,Civic Rare Glyphs bmp,Civic Rare Glyphs ext,Civic Share Fallback,Civic Portrait Fallback,Civic Share Latin';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (x: number, y: number, size: number, body: string, bold = false, color = '#000') =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${bold ? 900 : 400}" fill="${color}">${esc(body)}</text>`;
const fit = (body: string, width: number, max: number, min: number, lines: number) => {
  let size = max, rows = wrapCardText(body, width / size);
  while (rows.length > lines && size > min) { size--; rows = wrapCardText(body, width / size); }
  if (rows.length > lines) throw new Error(`選區卡文字無法完整顯示：${body}`);
  return { size, rows };
};

function fitName(body: string, width: number) {
  if (!/[A-Za-z]/.test(body)) return fit(body, width, 38, 18, 4);
  // 羅馬字姓名以完整詞換行，避免 Haisul、Islituan 被拆成兩段。
  const tokens = body.match(/[\p{Script=Latin}\p{M}'’.-]+|\s+|./gu) ?? [];
  for (let size = 38; size >= 18; size--) {
    const rows: string[] = [];
    let line = '';
    for (const token of tokens) {
      if (line && wrapCardText(line + token, width / size).length > 1) {
        rows.push(line.trim()); line = '';
      }
      line += token;
    }
    if (line.trim()) rows.push(line.trim());
    if (rows.length <= 4 && rows.every(row => wrapCardText(row, width / size).length === 1)) return { size, rows };
  }
  return fit(body, width, 38, 18, 4);
}

function photoData(url?: string): string | undefined {
  if (!url?.startsWith('/photos/')) return;
  const root = resolve('public');
  const path = resolve(root, `.${url}`);
  if (!path.startsWith(root + sep) || !existsSync(path)) return;
  const mime = /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

/** 名單完整列出，順序與選區頁一致；登記階段不編造號次或應選席次。 */
export function districtCardSvg(page: DistrictPageData, profiles: ReadonlyMap<string, DistrictCardProfile>): string {
  const candidates = orderCandidates(page.district.candidates);
  const numbered = candidates.length > 0 && candidates.every(c => c.number !== null);
  const heading = fit(page.district.label, 720, 82, 35, 2);
  const qualified = page.district.label.match(/^(.+?)(（.+）)$/);
  if (qualified) { heading.rows = [qualified[1], qualified[2]]; heading.size = 82; }
  const titleBottom = heading.rows.length === 1 ? 237 : 283;
  let scope = wrapCardText(districtAreaSummary(page.area), 968 / 21);
  if (scope.length > 3) scope = [page.area.source ? '2026 公告範圍較長，完整鄉里清單見選區頁' : '行政區參考較長，完整對照見選區頁'];
  const scopeTop = titleBottom + 40;
  const partyTop = scopeTop + scope.length * 28 + 26;
  const parties = new Map<string, number>();
  for (const c of candidates) {
    const party = partyLabel(c);
    parties.set(party, (parties.get(party) ?? 0) + 1);
  }
  // 比例以全區名單為分母；摘要與人物都保留名冊出現順序。
  const partyRows = [...parties].map(([label, count]) => ({
    label, count, heading: fit(`${label} ${count} 人`, 230, 20, 12, 1),
  }));
  const partyLines = Math.ceil(partyRows.length / 4);
  const partyRowHeight = Math.max(1, ...partyRows.map(p => p.heading.rows.length)) * 24 + 25;
  const listTop = partyTop + 27 + partyLines * partyRowHeight + 22;
  const columns = candidates.length <= 9 ? 3 : 4;
  const gap = 16, colWidth = (968 - gap * (columns - 1)) / columns;
  const photoHeight = columns === 4 ? 190 : 230;
  let y = listTop + 64;
  let roster = '';
  const credits: string[] = [];
  for (let start = 0; start < candidates.length; start += columns) {
    const row = candidates.slice(start, start + columns).map(c => {
      const profile = c.slug ? profiles.get(c.slug) : undefined;
      const photo = photoData(profile?.photoUrl);
      if (photo && profile?.photoCredit) credits.push(profile.photoCredit);
      const records = (profile?.service ?? []).flatMap(s => [
        { label: true, body: s.label },
        ...(s.label === '議員當選'
          ? s.value.split('、').reduce<string[]>((rows, year, index) => {
            if (index % 3 === 0) rows.push(year);
            else rows[rows.length - 1] += `、${year}`;
            return rows;
          }, [])
          : wrapCardText(s.value, colWidth / 20)
        ).map(body => ({ label: false, body })),
      ]);
      return {
        c, photo, name: fitName(c.name, colWidth - 24),
        party: fit(`${numbered ? `${c.number} 號・` : ''}${partyLabel(c)}`, colWidth, 21, 17, 3),
        records,
      };
    });
    const nameHeight = Math.max(...row.map(r => r.name.rows.length * (r.name.size + 4))) + 15;
    const partyHeight = Math.max(...row.map(r => r.party.rows.length * 26));
    const recordHeight = Math.max(52, ...row.map(r => r.records.length * 26));
    const nameY = y + photoHeight;
    const recordY = nameY + nameHeight + partyHeight + 33;
    const rowBottom = recordY + recordHeight + 18;
    roster += row.map(({ c, photo, name, party, records }, i) => {
      const x = 56 + i * (colWidth + gap);
      return `<g data-candidate-name="${esc(c.name)}">
        <rect x="${x}" y="${y}" width="${colWidth}" height="${photoHeight}" fill="#e9e6df"/>
        ${photo ? `<image x="${x}" y="${y}" width="${colWidth}" height="${photoHeight}" preserveAspectRatio="xMidYMid meet" href="${photo}"/>`
          : text(x + (colWidth - 104) / 2, y + photoHeight / 2 + 30, 104, [...c.name][0], true, '#cbc6bc')
            + text(x + (colWidth - 108) / 2, y + photoHeight - 23, 18, '照片尚未收錄', false, '#6b665e')}
        ${isCouncilReelect(c) ? `<rect x="${x + colWidth - 51}" y="${y + 9}" width="43" height="25" fill="#171717"/>${text(x + colWidth - 45, y + 27, 16, '現任', false, '#fff')}` : ''}
        <rect x="${x}" y="${nameY}" width="${colWidth}" height="${nameHeight}" fill="#171717"/>
        ${name.rows.map((s, n) => text(x + 12, nameY + name.size + 5 + n * (name.size + 4), name.size, s, true, '#fff')).join('')}
        ${party.rows.map((s, n) => text(x, nameY + nameHeight + 29 + n * 26, party.size, s, false, '#333')).join('')}
        <line x1="${x}" y1="${recordY - 10}" x2="${x + 26}" y2="${recordY - 10}" stroke="#b3271e" stroke-width="2"/>
        ${records.length ? records.map((r, n) => text(x, recordY + 15 + n * 26, r.label ? 16 : 20, r.body, false, r.label ? '#777' : '#333')).join('')
          : text(x, recordY + 18, 17, '任職資料待補', false, '#777')}
        <line x1="${x}" y1="${rowBottom}" x2="${x + colWidth}" y2="${rowBottom}" stroke="#ccc7bd"/>
      </g>`;
    }).join('');
    y = rowBottom + 26;
  }
  const footerTop = y + 5;
  const creditRows = [...new Set(credits)].flatMap(s => wrapCardText(s, 968 / 14));
  const height = Math.ceil(footerTop + 219 + (creditRows.length ? 27 + creditRows.length * 21 : 0));
  const origin = (process.env.SITE_URL || 'https://legislator-background.pages.dev').replace(/\/$/, '');
  const url = origin + page.path;
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
  const scale = Math.floor(158 / (qr.size + 8));
  const qrLeft = 858 + Math.floor((158 - (qr.size + 8) * scale) / 2);
  const qrTop = footerTop + 13 + Math.floor((158 - (qr.size + 8) * scale) / 2);
  let pixels = '';
  for (let row = 0; row < qr.size; row++) for (let col = 0; col < qr.size; col++) {
    if (qr.get(row, col)) pixels += `M${qrLeft + (col + 4) * scale},${qrTop + (row + 4) * scale}h${scale}v${scale}h-${scale}z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}">
    <rect width="1080" height="${height}" fill="#faf9f5"/>
    ${text(56, 52, 26, '政治人物背景資料庫', true)}
    ${text(849, 50, 19, '2026 議員選舉', false, '#555')}
    <line x1="56" y1="77" x2="1024" y2="77" stroke="#171717" stroke-width="4"/>
    <rect x="56" y="111" width="8" height="125" fill="#b3271e"/>
    ${text(85, 151, 40, page.county.name, true)}
    ${heading.rows.map((s, i) => text(80, 237 + i * 46, qualified && i === 1 ? 30 : heading.size, s, true)).join('')}
    <rect x="840" y="111" width="184" height="144" fill="#b3271e"/>
    ${text(867, 204, 83, String(candidates.length).padStart(2, '0'), true, '#fff')}
    ${text(890, 237, 19, page.council.source.stage === 'registration' ? '登記人數' : '名單人數', false, '#fff')}
    ${scope.map((s, i) => text(56, scopeTop + i * 28, 21, s, false, '#555')).join('')}
    ${text(56, partyTop, 17, '政黨分布（占本區名單比例）', false, '#777')}
    ${partyRows.map((p, i) => {
      const x = 56 + (i % 4) * 246;
      const py = partyTop + 32 + Math.floor(i / 4) * partyRowHeight;
      const barY = py + (Math.max(...partyRows.map(p => p.heading.rows.length)) - 1) * 24 + 12;
      return `${p.heading.rows.map((s, n) => text(x, py + n * 24, p.heading.size, s)).join('')}
        <rect x="${x}" y="${barY}" width="230" height="5" fill="#e1ded6"/>
        <rect data-party-count="${p.count}" x="${x}" y="${barY}" width="${230 * p.count / candidates.length}" height="5" fill="#171717"/>`;
    }).join('')}
    <rect x="56" y="${listTop}" width="968" height="43" fill="#171717"/>
    ${text(71, listTop + 31, 26, '本區名單', true, '#fff')}
    ${text(648, listTop + 28, 17, numbered ? '依正式號次，由左至右閱讀' : '依名冊順序，由左至右閱讀；非號次', false, '#fff')}
    ${roster}
    <line x1="56" y1="${footerTop}" x2="1024" y2="${footerTop}" stroke="#000" stroke-width="2"/>
    ${text(56, footerTop + 32, 19, STAGE_LABEL[page.council.source.stage], true, '#b3271e')}
    ${text(56, footerTop + 62, 17, `製表 ${page.council.source.tableDate}・2026 應選席次尚待本站核對`, false, '#555')}
    ${text(56, footerTop + 92, 17, '當選年份依本站收錄，不代表完整任期或連續在任', false, '#555')}
    ${text(56, footerTop + 122, 17, '來源：中選會、議會網站等；照片與任職出處見人物頁', false, '#555')}
    ${text(56, footerTop + 183, 18, new URL(url).hostname, false, '#555')}
    ${text(880, footerTop + 188, 16, '完整選區資料', false, '#555')}
    ${creditRows.map((s, i) => text(56, footerTop + 237 + i * 21, 14, s, false, '#555')).join('')}
    <path d="${pixels}" fill="#000"/>
  </svg>`;
}

export function renderDistrictCard(page: DistrictPageData, profiles: ReadonlyMap<string, DistrictCardProfile>): Buffer {
  return renderCardSvg(districtCardSvg(page, profiles), ['NotoSerifTC-Black.ttf', 'CivicPortraitFallback.otf']);
}
