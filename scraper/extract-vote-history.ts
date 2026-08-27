// 從 votedata.zip 解出 2018 年地方公職人員選舉資料。
//
// 為什麼要另寫腳本而不用 unzip：zip 內的檔名以 Big5 編碼儲存，unzip 解出來會是亂碼
// 目錄名，後續程式對不到路徑。
//
// 為什麼要 2018：連任限制的判定條件是「2018 與 2022 連續兩屆當選」，只有 2022 算不出來。
//
//   pnpm run extract:vote-history
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import AdmZip from 'adm-zip';

const ZIP = 'scraper/out-roster/votedata.zip';
const OUT = 'scraper/out-roster/cec/voteData';
const WANT = '2018-107年地方公職人員選舉';

/** zip 內檔名為 Big5；使用 TextDecoder 將原始 Buffer 直接轉碼還原。 */
function decodeName(raw: Buffer): string {
  return new TextDecoder('big5').decode(raw);
}

const zip = new AdmZip(ZIP);
const outAbsolute = resolve(OUT);
let n = 0;
for (const entry of zip.getEntries()) {
  const name = decodeName(entry.rawEntryName);
  if (!name.includes(WANT) || entry.isDirectory) continue;
  // 只取 WANT 之後的相對路徑，丟掉 zip 內層層的 votedata/votedata/voteData 前綴
  const rel = name.slice(name.indexOf(WANT));
  const dest = join(OUT, rel);
  // 從壓縮檔取出的檔名是外部輸入，即使來源可信，仍需驗證解壓路徑不會逃逸出預期目錄
  const destAbsolute = resolve(dest);
  if (!destAbsolute.startsWith(outAbsolute + '/') && destAbsolute !== outAbsolute) {
    throw new Error(`路徑逃逸檢查失敗：entry "${name}" 解壓目標 "${destAbsolute}" 位於 "${outAbsolute}" 外`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, entry.getData());
  n++;
}
console.log(`解出 ${n} 個檔案到 ${join(OUT, WANT)}`);
