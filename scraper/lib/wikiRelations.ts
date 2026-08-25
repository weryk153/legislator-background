// wikitext → 關係候選（純字串處理，無 I/O）。供 wiki-discover-relations.ts 產候選 JSON；
// 輸出只是「給人審的線索」，不是關係本身——欄位語意、方向、是否超譯全由人工審定決定。
// 見 spec §7.1。

export interface InfoboxRelation {
  field: string;           // 正規化後的欄位名（小寫、去空白），如 spouse / 配偶 / parents
  name: string;            // 清理後的人名（去括號附註）
  wikilinkTitle?: string;  // 值內第一個 [[連結]] 的標題，有的話
  raw: string;             // 該值的原始 wikitext（切分後）
}

// 關係欄位白名單（含中英文；比對時小寫、去空白）
const RELATION_FIELDS = new Set([
  'spouse', 'partner', 'parents', 'father', 'mother', 'children', 'relatives', 'relations', 'family',
  '配偶', '伴侶', '父母', '父親', '母親', '子女', '兒女', '親屬', '親戚', '家族', '家人',
]);

// -{}- 語言轉換標記：取 zh-tw（或 zh/hant/hk/mo），否則去掉前導旗標。與 wiki.ts wikitextToSummary 同規則。
function resolveLangConv(s: string): string {
  return s.replace(/-\{([^{}]*)\}-/g, (_m, body: string) => {
    const tw = body.match(/zh(?:-(?:tw|hant|hk|mo))?\s*:\s*([^;]*)/);
    if (tw) return tw[1].trim();
    return body.replace(/^[A-Za-z-]+\|/, '').trim();
  });
}

function stripTemplates(s: string): string {
  let prev: string;
  do { prev = s; s = s.replace(/\{\{[^{}]*\}\}/g, ''); } while (s !== prev);
  return s;
}

export function cleanWikitextInline(s: string): string {
  let t = s ?? '';
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '');
  t = resolveLangConv(t);
  t = stripTemplates(t);
  t = t.replace(/\[\[(?:File|Image|檔案|文件|分类|分類|Category):[^\]]*\]\]/gi, '');
  let prev: string;
  do { prev = t; t = t.replace(/\[\[(?:[^|\]]*\|)?([^\[\]]+)\]\]/g, '$1'); } while (t !== prev);
  t = t.replace(/'''?/g, '');
  t = t.replace(/<[^>]+>/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

// 依 depth-0 的分隔字元切分：{{ }} 與 [[ ]] 內的分隔字元不算。
export function splitTopLevel(body: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if (two === '}}' || two === ']]') { depth--; cur += two; i++; continue; }
    if (depth === 0 && body[i] === sep) { out.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  out.push(cur);
  return out;
}

// 最外層 {{Infobox …}}／{{…信息框／資訊框}} 模板原文（含大括號）。用大括號配對而非 regex，因為值內有巢狀模板。
export function findInfobox(wikitext: string): string | null {
  const re = /\{\{\s*(?:Infobox\b|[^{}|\n]*(?:信息框|資訊框|资讯框))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wikitext)) !== null) {
    let depth = 0;
    for (let i = m.index; i < wikitext.length; i++) {
      if (wikitext.startsWith('{{', i)) { depth++; i++; continue; }
      if (wikitext.startsWith('}}', i)) { depth--; i++; if (depth === 0) return wikitext.slice(m.index, i + 1); }
    }
  }
  return null;
}

// 一個欄位值 → 多個項目：{{ubl|…}}／{{plainlist|…}}／{{unbulleted list|…}} 展開、<br> 與換行、* 條列。
function splitValueItems(value: string): string[] {
  const items: string[] = [];
  const listRe = /\{\{\s*(?:ubl|unbulleted list|plainlist|flatlist|hlist)\s*\|([\s\S]*?)\}\}/gi;
  let rest = value;
  let m: RegExpExecArray | null;
  while ((m = listRe.exec(value)) !== null) {
    for (const it of splitTopLevel(m[1], '|')) items.push(it);
    rest = rest.replace(m[0], '');
  }
  for (const piece of rest.split(/<br\s*\/?>|\n|^\*+/gim)) items.push(piece);
  return items.map((s) => s.replace(/^\s*[*#]+\s*/, '').trim()).filter(Boolean);
}

const firstWikilink = (s: string): string | undefined => {
  const m = s.match(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/);
  return m ? m[1].trim() : undefined;
};

// 人名：清理後去掉尾端／中段的括號附註；純數字或帶「子」「女」計數者（2子1女）不是人名。
function toName(item: string): string {
  const cleaned = cleanWikitextInline(item).replace(/[（(][^（）()]*[)）]/g, '').trim();
  if (!cleaned || /^\d+子\d*女?$|^\d+女$|^[\d\s]+$/.test(cleaned)) return '';
  return cleaned;
}

export function parseInfoboxRelations(wikitext: string): InfoboxRelation[] {
  const box = findInfobox(wikitext);
  if (!box) return [];
  const body = box.slice(2, -2); // 去掉最外層 {{ }}
  const out: InfoboxRelation[] = [];
  for (const part of splitTopLevel(body, '|').slice(1)) { // [0] 是模板名
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const field = part.slice(0, eq).trim().toLowerCase().replace(/\s+/g, '');
    if (!RELATION_FIELDS.has(field)) continue;
    for (const item of splitValueItems(part.slice(eq + 1).trim())) {
      const name = toName(item);
      if (!name) continue;
      const link = firstWikilink(item);
      out.push({ field, name, ...(link ? { wikilinkTitle: link } : {}), raw: item });
    }
  }
  return out;
}
