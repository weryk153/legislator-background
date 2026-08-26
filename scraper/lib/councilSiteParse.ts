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

/** 經歷段落的起始標記。彰化把經歷放在「簡介」裡，故一併視為起點。 */
const START = /^(經\s*歷|簡\s*介|簡\s*歷)[：:]?\s*$/;
/** 「學歷」段落：出現在經歷之前時要跳過，出現在經歷之後則視為段落結束。 */
const EDUCATION = /^(學\s*歷)[：:]?\s*$/;
/** 段落結束標記：其他欄位標題或頁尾導覽。 */
const STOP = /^(政\s*見|聯絡方式|電\s*話|傳\s*真|服務處|信箱|E-?mail|問政|質詢|提案|網站錯誤回報|回上頁|回上一頁|到上面|網站導覽|相關連結|隱私權|資訊安全|展開|Copy)/i;
/** 條列編號：阿拉伯數字、中文數字、圓點、破折號。 */
const BULLET = /^\s*(?:[0-9]{1,2}\s*[.、．)）]|[一二三四五六七八九十]{1,3}\s*[、.．)）]|[•·‧●▪－\-*]\s*)/;

/**
 * 從議會個人頁的 innerText 抽出經歷條列。
 * 找不到可辨識的經歷段落時回空陣列——寧可漏抓，不要把整頁雜訊當成職務。
 */
export function parseCareerBlock(pageText: string): string[] {
  const lines = (pageText ?? '').split('\n').map((l) => l.replace(/[ \t　]+/g, ' ').trim());
  const out: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    if (!line) continue;
    if (START.test(line)) { inBlock = true; out.length = 0; continue; }
    if (!inBlock) continue;
    // 學歷段落在經歷之後出現 → 該段結束（臺南是學歷在前，那時 inBlock 尚未開啟）
    if (EDUCATION.test(line) || STOP.test(line)) break;

    const t = line.replace(BULLET, '').replace(/[。，、；;]+$/, '').trim();
    // 過短（單字）、過長（整段敘述）、純數字或純年份的行都不是一筆職務
    if (t.length < 3 || t.length > 60) continue;
    if (/^[\d\s年月日．.]+$/.test(t)) continue;
    if (!/[一-鿿]/.test(t)) continue;
    out.push(t);
  }
  return out;
}
