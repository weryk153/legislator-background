// 議會個人頁的純文字 → 經歷條列。純字串處理，無 I/O。
//
// 22 個議會的 HTML 結構各不相同（見 scraper/fixtures/council-photo-notes.md），但把個人頁
// 轉成 innerText 之後，經歷段落的形態只有幾種，差別在「段落怎麼開頭」與「每筆怎麼編號」：
//   屏東：「經歷：」後每行一筆，無編號
//   臺南：「學歷」「經歷」兩段並列，只取後者
//   桃園：「經歷」後用「1. 2. 3.」編號
//   彰化：**標題不叫經歷**，內容放在「簡介」分頁，用「一、二、三、」編號、句號結尾
// 因此不為每個議會寫一支解析器，而是辨認這幾種形態——新增議會多半不必改程式。
//
// 抽出的是「候選」，仍須人工審定：這裡只做結構性清理，不判斷內容真偽或歸屬。

// 經歷段落的起始標記。三種變體：
//   「經歷」——多數議會
//   「學經歷」——屏東把學歷與經歷併成一段（其中的學歷條目由下游 categorizeCareer 濾掉）
//   「簡介」「簡歷」——彰化把經歷放在「簡介」分頁
// 必須整行完全相符：彰化個人頁的左側選單有「議會簡介」，寬鬆比對會把整份導覽選單當成經歷。
const START = /^(學\s*經\s*歷|經\s*歷|簡\s*介|簡\s*歷)[：:]?\s*$/;
/** 「學歷」段落：出現在經歷之前時要跳過，出現在經歷之後則視為段落結束。 */
const EDUCATION = /^(學\s*歷)[：:]?\s*$/;
/** 段落結束標記：其他欄位標題或頁尾導覽。 */
const STOP = /^(政\s*見|本屆問政|聯絡方式|電\s*話|傳\s*真|服務處|信箱|E-?mail|問政|質詢|提案|網站錯誤回報|回上頁|回上一頁|到上面|網站導覽|相關連結|隱私權|資訊安全|展開|Copy)/i;
/** 條列編號：阿拉伯數字、中文數字、圓點、破折號。 */
const BULLET = /^\s*(?:[0-9]{1,2}\s*[.、．)）]|[一二三四五六七八九十]{1,3}\s*[、.．)）]|[•·‧●▪－\-*]\s*)/;

/**
 * 從議會個人頁的 innerText 抽出經歷條列。
 * 找不到可辨識的經歷段落時回空陣列——寧可漏抓，不要把整頁雜訊當成職務。
 */
export function parseCareerBlock(pageText: string): string[] {
  const lines = (pageText ?? '').split('\n').map((l) => l.replace(/[ \t　]+/g, ' ').trim()).filter(Boolean);
  const byHeading = collectFromHeading(lines);
  if (byHeading.length) return byHeading;
  // 彰化沒有經歷標題（「簡介／政見／政績」只是分頁標籤），經歷緊接在基本欄位與學歷之後，
  // 只能以「連續的編號條列」本身當錨點。
  return collectFromBulletRun(lines);
}

/** 以標題（經歷／學經歷／簡介…）為起點擷取。 */
function collectFromHeading(lines: string[]): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    if (START.test(line)) { inBlock = true; out.length = 0; continue; }
    if (!inBlock) continue;
    if (EDUCATION.test(line) || STOP.test(line)) break;
    const t = normalise(line);
    if (t) out.push(t);
  }
  return out;
}

/** 以「連續 2 筆以上的編號條列」為錨點擷取，用於沒有標題的頁面。 */
function collectFromBulletRun(lines: string[]): string[] {
  let best: string[] = [];
  let run: string[] = [];
  for (const line of lines) {
    if (STOP.test(line)) { if (run.length > best.length) best = run; run = []; continue; }
    if (!BULLET.test(line)) {
      if (run.length > best.length) best = run;
      run = [];
      continue;
    }
    const t = normalise(line);
    if (t) run.push(t);
  }
  if (run.length > best.length) best = run;
  return best.length >= 2 ? best : [];
}

/** 去編號與尾標點，濾掉過短、過長、純數字與無中文的行。 */
function normalise(line: string): string | null {
  const t = line.replace(BULLET, '').replace(/[。，、；;]+$/, '').trim();
  if (t.length < 3 || t.length > 60) return null;
  if (/^[\d\s年月日．.]+$/.test(t)) return null;
  if (!/[一-鿿]/.test(t)) return null;
  return t;
}
