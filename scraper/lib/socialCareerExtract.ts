// wikitext → 社會團體／財團法人職位候選。純字串處理，無 I/O。
//
// 輸出是「給人審的候選」，不是定稿——身分歸屬、語意完整與否仍須人工判斷。但抽取本身
// 有兩條硬規則，因為它們防的是會把錯誤資料掛到人身上的失誤：
//
//   1. **只取條列與 infobox 欄位，不取散文。** 散文裡的「○○協會理事長某某某表示……」
//      講的是別人，不是條目主角——蔣月惠條目裡的「屏東縣環境保護聯盟理事長葉奉達」
//      就是這樣被誤收過。條列與 infobox 欄位才是條目對主角本人的陳述。
//   2. **只收 categorizeCareer 判為 social 者。** 公職與黨職在檔案頁是另外兩組，
//      由該分類函式統一認定，此處不另立標準。
import { cleanWikitextInline } from './wikiRelations';
import { categorizeCareer } from '../../src/lib/careerCategory';

// 職稱字樣。「委員」須排除「委員會」——後者是組織名不是職稱，「土城區體育會柔道角力
// 摔角委員會」這種只有組織沒有職務的條列不該被當成一筆職務。
const ROLE = /董事長|理事長|理事|監事|董事|主任委員|主委|會長|總幹事|執行長|顧問|創辦|榮譽|長老|委員(?!會)/;
// infobox 欄位前綴：past / office1 / order2 … 之類，抽取時會連同欄位名一起被讀進來。
const FIELD_PREFIX = /^(?:past|office\d*|order\d*|title\d*|position\d*)\s*=\s*\*?\s*/i;
// 職務分隔符。頓號後若緊接屆次（「第6、7屆」的「7屆」）則不算分隔，見 extractSocialPositions。
const SEPARATOR = /[、，,](?![\d〇零一二三四五六七八九十]+\s*[屆任期])\s*(?=\S{2,})|｜/;

/** 一行 wikitext 是否為條列或 infobox 欄位（相對於散文）。 */
function isDeclarative(line: string): boolean {
  return /^\s*[*|]/.test(line);
}

export function extractSocialPositions(wikitext: string): string[] {
  const out = new Set<string>();
  for (const line of (wikitext ?? '').split('\n')) {
    if (!isDeclarative(line) || !ROLE.test(line)) continue;
    // 頓號／逗號分隔的多筆職務拆開；全形直線是 infobox 內的另一種分隔。
    // 例外：屆次列舉（「第6、7屆家長會長」）裡的頓號不是職務分隔——在那裡切開會得到
    // 「觀音國小第6」（無職稱、丟棄）與「7屆家長會長」（沒有機構名的碎片），後者會被
    // 當成一筆職務寫進資料庫。故頓號後緊接「數字＋屆／任／期」時不切。
    for (const piece of cleanWikitextInline(line).split(SEPARATOR)) {
      const t = piece
        .trim()
        .replace(/^[*|]\s*/, '')
        .replace(FIELD_PREFIX, '')
        .replace(/^曾擔任/, '')
        .replace(/[。，、]+$/, '')
        .trim();
      if (t.length < 4 || t.length > 46) continue;
      if (!ROLE.test(t)) continue;
      if (categorizeCareer(t) !== 'social') continue;
      out.add(t);
    }
  }
  return [...out];
}
