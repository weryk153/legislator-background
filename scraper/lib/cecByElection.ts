// 補選與重行選舉的當選者推導。純字串處理，無 I/O。
//
// 這批資料的格式與主選舉（elcand.csv）完全不同：有 BOM、有標頭列、政黨欄是名稱而非
// 代號，而且**沒有當選註記**。當選者只能由 prof.csv 的各投開票所分號次得票加總後取
// 最高票——單一票所的領先不代表當選，必須跨所加總。

export interface ByElectionWinner {
  name: string;
  partyName: string;
  votes: number;
  totalVotes: number;
}

/** 去掉 UTF-8 BOM。留著會讓第一個欄位名變成「﻿號次」而對不到標頭。 */
const stripBom = (s: string): string => s.replace(/^﻿/, '');

/** 解析 CSV 列，支援雙引號包裹的欄位（可能包含逗號）。 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 跳脫的雙引號（兩個連續的雙引號代表一個）
        current += '"';
        i++;
      } else {
        // 進出引號狀態
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // 逗號是分隔符（只在引號外）
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

function rows(csv: string): string[][] {
  return stripBom(csv ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseCSVLine);
}

export function parseByElection(candCsv: string, profCsv: string): ByElectionWinner | null {
  const cr = rows(candCsv);
  const pr = rows(profCsv);
  if (cr.length < 2 || pr.length < 2) return null;

  // 候選人：號次 → 姓名、政黨名稱
  const cands = new Map<string, { name: string; partyName: string }>();
  for (const r of cr.slice(1)) {
    if (r.length < 3 || !r[0].trim()) continue;
    cands.set(r[0].trim(), { name: r[1].trim(), partyName: r[2].trim() });
  }
  if (!cands.size) return null;

  // 得票：標頭中「號次N」欄的位置
  const head = pr[0].map((h) => h.trim());
  const cols = new Map<string, number>();
  for (const [no] of cands) {
    const i = head.indexOf(`號次${no}`);
    if (i >= 0) cols.set(no, i);
  }
  if (!cols.size) return null;

  const total = new Map<string, number>();
  for (const r of pr.slice(1)) {
    for (const [no, i] of cols) {
      const v = Number((r[i] ?? '0').replace(/,/g, '').trim() || '0');
      total.set(no, (total.get(no) ?? 0) + (Number.isFinite(v) ? v : 0));
    }
  }

  const sum = [...total.values()].reduce((a, b) => a + b, 0);
  if (sum === 0) return null;
  const [winNo, votes] = [...total.entries()].sort((a, b) => b[1] - a[1])[0];
  const c = cands.get(winNo)!;
  return { name: c.name, partyName: c.partyName, votes, totalVotes: sum };
}

export interface ByElectionTarget {
  countyName: string;
  /** 鄉鎮市長補選才有值；縣市長與議員為 null。 */
  townName: string | null;
  /** 議員補選才有值。 */
  districtNo: number | null;
  office: 'countyChief' | 'townChief' | 'councilSeat';
}

/**
 * 由目錄名解析選區。這批資料沒有行政區代碼，目錄名是唯一線索。
 * 認不出的回 null——由呼叫端列報，不可默默略過，否則新增的補選會被無聲吃掉。
 *
 * 「市長」三個字不足以判定為縣市長：**縣轄市的首長職稱正是「市長」**。曾經這裡
 * 寫成 `/市長|縣長/.test(dirName)`，於是「苗栗縣頭份市市長補選」會被判成苗栗
 * 縣長、把真正的縣長整筆覆蓋掉——而且是無聲的。目前四個目錄剛好都是議員補選
 * 所以還沒爆，但這是下次資料更新第一個會踩到的雷。
 *
 * 故改成結構化比對：**「長」字前面必須緊接著縣市名本身**（如「嘉義市」＋「長」）
 * 才算縣市長；縣市名之後另有鄉鎮市名再接「長」的，走鄉鎮市長分支。兩者皆不符
 * 就回 null 讓呼叫端列報，不猜。
 */
export function parseByElectionDir(dirName: string): ByElectionTarget | null {
  const county = dirName.match(/([一-鿿]{2,3}[縣市])/)?.[1];
  if (!county) return null;

  // 縣市長：縣市名本身直接接「長」，如「嘉義市長」「苗栗縣長」
  if (dirName.includes(`${county}長`)) {
    return { countyName: county, townName: null, districtNo: null, office: 'countyChief' };
  }

  // 議員：條件最具體（同時要有「議員」與「第N選舉區」），先判，避免地名裡的字誤觸下面的分支
  const no = dirName.match(/第\s*(\d+)\s*選舉區/)?.[1];
  if (/議員/.test(dirName) && no) {
    return { countyName: county, townName: null, districtNo: Number(no), office: 'councilSeat' };
  }

  // 鄉鎮市長：縣市名之後另有一個鄉／鎮／縣轄市名，再接「長」。
  // 名稱部分用**惰性**量詞：「魚池鄉鄉長」若用貪婪量詞會抓成「魚池鄉鄉」，
  // 「頭份市市長」會抓成「頭份市市」——惰性才會停在正確的「魚池鄉」「頭份市」。
  const rest = dirName.slice(dirName.indexOf(county) + county.length);
  const town = rest.match(/([一-鿿]{1,3}?[鄉鎮市])[鄉鎮市]?長/)?.[1];
  if (town) {
    return { countyName: county, townName: town, districtNo: null, office: 'townChief' };
  }

  return null;
}
