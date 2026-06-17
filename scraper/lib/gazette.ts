import type { AssetCategory, AssetItem } from './types';

// Category keyword order matters: more specific keywords first so a section
// header is classified before a broader keyword can claim it. The 廉政專刊
// declaration form prints each asset section as a header line that carries a
// running total, e.g.:
//   （七）存款（指新臺幣、外幣之存款）
//   （總金額：新臺幣 37,476,896 元）
//   （八）有價證券（總價額：新臺幣 50 元）
// When a section is empty the header is followed by 本欄空白 and the total
// reads "（總金額：新臺幣  元）" (no digits) — which yields amount 0 and is skipped.
const CATEGORY_KEYWORDS: Array<[AssetCategory, string[]]> = [
  ['land', ['土地']],
  ['building', ['建物', '房屋']],
  ['deposit', ['存款']],
  ['cash', ['現金']],
  ['securities', ['有價證券', '股票', '基金', '債券']],
  ['investment', ['事業投資', '投資']],
  ['claim', ['債權']],
  ['debt', ['債務']],
];

// Only treat a line as carrying a section total when it announces one. This
// avoids picking up incidental digits (areas, weights, account numbers) that
// litter the fragmented table text.
const TOTAL_MARKERS = ['總金額', '總價額'];

export function parseGazetteAmount(s: string): number {
  const digits = (s.match(/[\d,]+/g) ?? []).join('').replace(/,/g, '');
  return digits ? Number(digits) : 0;
}

export function parseDeclaration(text: string, name: string): AssetItem[] {
  const idx = text.indexOf(name);
  if (idx === -1) return [];
  // A single declaration spans well over 4 KB once pdftotext fragments the
  // vertical table text, so scan generously from the name onward.
  const block = text.slice(idx, idx + 20000);
  const lines = block.split('\n');
  const items: AssetItem[] = [];
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    let found = false;
    for (let i = 0; i < lines.length && !found; i++) {
      const line = lines[i];
      if (!keywords.some((k) => line.includes(k))) continue;
      // The category's running total prints either inline on the header line or
      // on one of the next couple of lines. Locate the line that carries the
      // total marker (within a small window of the header).
      let totalLine = -1;
      for (let j = i; j < lines.length && j <= i + 2; j++) {
        if (TOTAL_MARKERS.some((m) => lines[j].includes(m))) {
          totalLine = j;
          break;
        }
      }
      // No total announced near this keyword (e.g. land/building list items use
      // per-item 取得價額, not a section total) — keep looking for a later match.
      if (totalLine === -1) continue;
      // Parse the total line; if its digits wrapped onto following lines, extend
      // until we have a number, but stop before the next total marker so a
      // sibling section's amount can never bleed in.
      let scan = lines[totalLine];
      for (let j = totalLine + 1; parseGazetteAmount(scan) === 0 && j < lines.length && j <= totalLine + 3; j++) {
        if (TOTAL_MARKERS.some((m) => lines[j].includes(m))) break;
        scan += ' ' + lines[j];
      }
      const amount = parseGazetteAmount(scan);
      if (amount > 0) {
        items.push({ category, amount, label: line.trim().slice(0, 60) });
      }
      found = true; // first section header carrying a total for this category wins
    }
  }
  return items;
}
