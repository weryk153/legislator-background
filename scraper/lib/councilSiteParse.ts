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
//
// 「議員」前綴只加在「經歷」上（基隆的標題是「議員經歷」），不可放寬成 (?:議員)? 通吃：
// 金門的頁面標題是「議員簡歷」，那是整頁的名稱而非段落起點，一旦當成起點，其後的
// 「本屆縣議員／第一選區…」會被收成第一筆，接著的「學 歷」子標題就被判成「經歷之後的
// 學歷段落」而提早結束——真正的經歷一筆都收不到。
const START = /^(?:議員\s*經\s*歷|學\s*經\s*歷|經\s*歷|簡\s*介|簡\s*歷)[：:]?\s*$/;
// 基本資料欄位的標題（基隆「議員資訊」）：它排在經歷段落之前，若被誤當起點，
// 抽到的會是選區、政黨、連絡電話與電子郵件——比抓不到更糟。明確排除。
const INFO_HEADING = /^議員\s*(資\s*訊)[：:]?\s*$|^(基本資料|個人資料|聯絡資訊)[：:]?\s*$/;
// 基本資料的欄位行（「選區：…」「連絡電話：…」）一律不是職務。
// 冒號或空白分隔皆有（「政黨：中國國民黨」與「政黨 中國國民黨」）。
const INFO_FIELD = /^(選\s*區|政\s*黨|黨\s*籍|服務處|服務地址|連\s*絡\s*電話|聯\s*絡\s*電話|電\s*話|傳\s*真號碼|傳\s*真|電子郵件|信\s*箱|網站連結|通訊處|通訊地址|出\s*生|生\s*日|性\s*別|出生地)\s*([：:]|\s)/;
// 頁面工具列與分享按鈕，不是職務。
const PAGE_TOOL = /^(友善列印|回上一頁|回上頁|列印|分享|字級|Facebook|Google|Twitter|Plurk|LINE)/i;
/** 「學歷」子標題／段落。在「學經歷」大標之下時只是子標題，不是段落結束。 */
const EDUCATION = /^(學\s*歷)[：:]?\s*$/;
/** 「經歷」子標題：出現時恢復收錄（見 collectFromHeading）。 */
const CAREER_SUBHEAD = /^(經\s*歷)[：:]?\s*$/;
// 標籤與內容同一行的寫法：「經歷:某某、某某」（嘉義市）、「簡經歷 1. 某某」（連江）。
// 這類行必須把標籤剝掉、取後半當內容，否則整行會被當成一筆職務（含「經歷:」前綴）。
const CAREER_INLINE = /^(?:簡\s*經\s*歷|學\s*經\s*歷|經\s*歷)\s*[：:]?\s*(?=\S)/;
/** 同行的學歷標籤：「學歷:某某」「學歷 某某」——整行都是學歷，跳過。 */
const EDUCATION_INLINE = /^(?:學\s*歷)\s*[：:]?\s*\S/;
/** 段落結束標記：其他欄位標題或頁尾導覽。 */
const STOP = /^(:::|[^，、]{0,4}議會$|政\s*見|本屆問政|市政論壇|問政影音|服務績效|聯絡方式|電\s*話|傳\s*真|服務處|信箱|E-?mail|問政|質詢|提案|網站錯誤回報|回上頁|回上一頁|到上面|網站導覽|相關連結|隱私權|資訊安全|展開|Copy)/i;
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

/**
 * 以標題（經歷／學經歷／簡介…）為起點擷取。
 *
 * 「學經歷」大標之下常再分「學 歷：」「經 歷：」兩個子標題（新竹縣、高雄）。若把子標題
 * 「學 歷：」當成段落結束，整段經歷會被跳過，後面的「政見」反而成為起點——抽到的就會是
 * 政見不是經歷。故遇到學歷子標題時改為「暫停收錄」，遇到經歷子標題再恢復。
 */
function collectFromHeading(lines: string[]): string[] {
  const out: string[] = [];
  let inBlock = false;
  let paused = false;   // 位於「學 歷：」子段落內
  for (const line of lines) {
    if (INFO_HEADING.test(line)) { inBlock = false; continue; }
    if (START.test(line)) { inBlock = true; paused = false; out.length = 0; continue; }
    if (!inBlock && CAREER_INLINE.test(line)) {
      inBlock = true; paused = false; out.length = 0;
      for (const t of splitInline(line.replace(CAREER_INLINE, ''))) out.push(t);
      continue;
    }
    if (!inBlock) continue;
    if (CAREER_SUBHEAD.test(line)) { paused = false; continue; }
    // 標籤與內容同一行：剝掉標籤，其餘照常處理（可能還帶頓號分隔的多筆）
    if (CAREER_INLINE.test(line)) {
      paused = false;
      for (const t of splitInline(line.replace(CAREER_INLINE, ''))) out.push(t);
      continue;
    }
    if (EDUCATION_INLINE.test(line)) { paused = true; continue; }
    if (EDUCATION.test(line)) {
      // 已收到內容才代表這是「經歷之後」的學歷段落 → 結束；否則只是子標題 → 暫停
      if (out.length) break;
      paused = true;
      continue;
    }
    if (STOP.test(line)) break;
    if (paused) continue;
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

/** 新聞標題：以民國日期開頭（如「114/9/16 …」）。議長頁常在經歷後接新聞列表，
 *  而同一則新聞會出現在多位議員頁上——收進來等於把別人的活動記到本人頭上。 */
const NEWS_HEADLINE = /^\d{2,3}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}/;

/** 去編號與尾標點，濾掉過短、過長、純數字、無中文與新聞標題的行。 */
function normalise(line: string): string | null {
  const t = line.replace(BULLET, '').replace(/[。，、；;]+$/, '').trim();
  if (INFO_FIELD.test(t) || PAGE_TOOL.test(t)) return null;
  // 「洪允典議長」這種「姓名＋職稱」的標題行不是職務
  if (/^[一-鿿]{2,4}(議長|副議長|議員)$/.test(t)) return null;
  if (t.length < 3 || t.length > 60) return null;
  if (/^[\d\s年月日．.]+$/.test(t)) return null;
  if (!/[一-鿿]/.test(t)) return null;
  if (NEWS_HEADLINE.test(t)) return null;
  return t;
}

/** 一頁多人時的切段結果。單人頁的 name 為空字串。 */
export interface PersonBlock { name: string; text: string; }

/**
 * 把「一頁塞多位議員」的議會頁按人拆開。
 *
 * 南投縣議會的個人頁其實是「選區頁」——同一選區的議員連續排列在同一份 HTML 裡，
 * 網址只用 `#姓名` 錨點區分。若不拆開，後面那位的經歷會被算到前一位頭上。
 * 以「姓名：」欄位（下一行即為姓名）為分界；找不到該欄位就當單人頁整份回傳。
 */
export function splitByPerson(pageText: string): PersonBlock[] {
  const lines = (pageText ?? '').split('\n');
  const marks: { at: number; name: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*姓\s*名\s*[：:]\s*$/.test(lines[i])) continue;
    const name = (lines[i + 1] ?? '').trim();
    if (name && name.length <= 20) marks.push({ at: i, name });
  }
  if (!marks.length) return [{ name: '', text: pageText ?? '' }];
  return marks.map((m, k) => ({
    name: m.name,
    text: lines.slice(m.at, marks[k + 1]?.at ?? lines.length).join('\n'),
  }));
}

/** 同行內容可能以頓號分隔多筆（嘉義市），逐一正規化。 */
function splitInline(rest: string): string[] {
  const out: string[] = [];
  for (const piece of rest.split(/[、，,]/)) {
    const t = normalise(piece);
    if (t) out.push(t);
  }
  return out;
}

/** 經歷段落的起始位置（含全形空格的寫法，如「學 經 歷」）。找不到回 -1。 */
function careerSectionIndex(text: string): number {
  const m = /(學\s*經\s*歷|簡\s*經\s*歷|經\s*歷|簡\s*歷)/.exec(text);
  return m ? m.index : -1;
}

/**
 * 判斷議會個人頁是「誰的頁」。回傳名冊姓名，判不出來回 null。
 *
 * 不能整頁掃描：高雄、臺南、桃園的側欄會列出全體議員，整頁比對會多重命中而全部作廢。
 * 也不能固定取前 N 字：花蓮的導覽列很長，姓名落在其後。
 * 正解是「經歷段落之前的文字」——那是這一頁的標題區；該區內若仍多重命中，
 * 取最靠近經歷段落者（標題通常緊接其前）。
 */
export function findOwnerName(pageText: string, rosterNames: string[]): string | null {
  const cut = careerSectionIndex(pageText);
  const raw = cut > 0 ? pageText.slice(0, cut) : pageText.slice(0, 700);
  // 花蓮「魏議員 嘉賢」、嘉義市「張副議長榮藏」把職稱塞在姓與名之間（見議會結構筆記），
  // 直接比對名冊姓名會完全落空。先移除職稱字樣與空白，讓「魏嘉賢」能配上。
  const head = raw.replace(/(副議長|議長|議員|代表)/g, '').replace(/[ \t　]+/g, '');
  const hits = rosterNames.filter((n) => head.includes(n));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return hits.reduce((a, b) => (head.lastIndexOf(b) > head.lastIndexOf(a) ? b : a));
  // 標題區找不到：金門把姓名放在分享按鈕之後、經歷段落之前的另一區塊，
  // 且該區塊可能落在 careerSectionIndex 命中的「議員簡歷」導覽字樣之後。改掃全頁，
  // 但只在「唯一命中」時採用——多重命中代表撞到側欄名單，寧可判不出也不要掛錯人。
  const whole = pageText.replace(/(副議長|議長|議員|代表)/g, '').replace(/[ \t　]+/g, '');
  const all = rosterNames.filter((n) => whole.includes(n));
  return all.length === 1 ? all[0] : null;
}
