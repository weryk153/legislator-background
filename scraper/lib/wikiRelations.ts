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

// 移除 HTML 註解與 <ref>…</ref>（含自我閉合）。cleanWikitextInline 與 extractRelationSentences 共用。
function stripCommentsAndRefs(s: string): string {
  let t = s.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<ref[^>]*\/>/g, '');
  return t;
}

// 移除 [[File:…]]／[[Image:…]] 等連結整體（含說明文字內的巢狀連結，如 caption 裡又包一個 [[人名]]）。
// 用中括號配對（同 findInfobox 的技巧）而非「找第一個 ]]」的 regex——說明文字內可能還有巢狀 [[…]]，
// 非貪婪 regex 會在內層 ]] 處提早收尾，把說明文字的下半段（含殘留的 ]]）留在輸出裡。
// cleanWikitextInline 與 extractRelationSentences 共用。
function stripFileLinks(s: string): string {
  const re = /\[\[(?:File|Image|檔案|文件|分类|分類|Category):/gi;
  let out = '';
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index < cursor) continue; // 已被前一個配對吃掉，略過
    let depth = 0;
    let end = -1;
    for (let i = m.index; i < s.length; i++) {
      if (s.startsWith('[[', i)) { depth++; i++; continue; }
      if (s.startsWith(']]', i)) { depth--; i++; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) continue; // 沒有配對的 ]]，不動它，避免誤刪到後面不相關的文字
    out += s.slice(cursor, m.index);
    cursor = end;
    re.lastIndex = end;
  }
  out += s.slice(cursor);
  return out;
}

export function cleanWikitextInline(s: string): string {
  let t = s ?? '';
  t = stripCommentsAndRefs(t);
  t = resolveLangConv(t);
  t = stripTemplates(t);
  t = stripFileLinks(t);
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
// 清單模板的收尾用大括號配對（同 findInfobox 的技巧），而非非貪婪 regex 抓到第一個 }}——
// 因為項目內可能還有巢狀模板（如 {{le|小華|Xiao Hua}}），非貪婪 regex 會在該處提早收尾產生殘缺片段。
function splitValueItems(value: string): string[] {
  const items: string[] = [];
  const startRe = /\{\{\s*(?:ubl|unbulleted list|plainlist|flatlist|hlist)\s*\|/gi;
  let rest = value;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(value)) !== null) {
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let end = -1;
    for (let i = bodyStart; i < value.length; i++) {
      if (value.startsWith('{{', i)) { depth++; i++; continue; }
      if (value.startsWith('}}', i)) { depth--; i++; if (depth === 0) { end = i; break; } continue; }
    }
    if (end < 0) continue; // 沒有配對的 }}，放棄此模板（保留在 rest 內，交由後續 <br>/換行切分）
    const body = value.slice(bodyStart, end - 1);
    for (const it of splitTopLevel(body, '|')) items.push(it);
    rest = rest.replace(value.slice(m.index, end + 1), '');
  }
  for (const piece of rest.split(/<br[^>]*>|\n|^\*+/gim)) items.push(piece);
  return items
    .map((s) => s.replace(/^\s*[*#]+\s*/, '').trim())
    // {{ubl|class=x|[[甲]]|[[乙]]}} 這類 hlist/plainlist 常見的具名參數（class=、style=…）
    // 不是人名，混進來會被 toName() 誤判成人名候選。
    .filter((s) => Boolean(s) && !/^[a-z_-]+\s*=/i.test(s));
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

export interface SentenceCandidate { sentence: string; keywords: string[]; wikilinks: string[] }

// 家族／政治關鍵字（spec §7.1）。只是召回用的粗篩，精確與否由人審。
export const FAMILY_KEYWORDS = /妻|夫|配偶|之子|之女|之兄|之弟|之姊|之妹|長子|次子|長女|次女|女兒|兒子|父親|母親|胞兄|胞弟|胞姊|胞妹|兄長|弟弟|姊姊|妹妹|姪|甥|岳父|女婿|媳/g;
export const POLITICAL_KEYWORDS = /師承|恩師|門生|子弟兵|提拔|拔擢|幕僚|助理|辦公室主任|派系|新潮流|正國會|湧言會|蘇系|英系|支持|力挺|接班/g;

export function extractRelationSentences(wikitext: string): SentenceCandidate[] {
  let t = wikitext ?? '';
  const box = findInfobox(t);
  if (box) t = t.replace(box, '');
  t = stripCommentsAndRefs(t);
  t = resolveLangConv(t);
  t = stripTemplates(t);
  t = stripFileLinks(t);
  t = t.replace(/^[=]+.*[=]+\s*$/gm, ''); // 章節標題
  // 單獨換行（後面不是換行、條列符號、表格列、標題或模板邊界）視為排版折行，併成空白後再斷句，
  // 避免把還沒斷句的敘述文字從中間攔腰截斷（例如關鍵字與其後緊接的連結被拆到不同句子）。
  t = t.replace(/\n(?![\n*#|!={}:])/g, ' ');
  const out: SentenceCandidate[] = [];
  // 用 exported 正規表達式的 source 另建乾淨副本：FAMILY_KEYWORDS／POLITICAL_KEYWORDS 是 g 旗標、
  // 外部若對它們呼叫 .test()／.exec() 會弄髒共用物件的 lastIndex，導致下一次呼叫本函式漏抓。
  const familyRe = new RegExp(FAMILY_KEYWORDS.source, 'g');
  const politicalRe = new RegExp(POLITICAL_KEYWORDS.source, 'g');
  for (const rawSentence of t.split(/[。！？\n]/)) {
    const wikilinks: string[] = [];
    for (const m of rawSentence.matchAll(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g)) wikilinks.push(m[1].trim());
    const sentence = cleanWikitextInline(rawSentence);
    if (!sentence) continue;
    const keywords = [...new Set([...sentence.matchAll(familyRe), ...sentence.matchAll(politicalRe)].map((m) => m[0]))];
    if (!keywords.length) continue;
    out.push({ sentence, keywords, wikilinks });
  }
  return out;
}
