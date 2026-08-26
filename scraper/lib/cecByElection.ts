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
  districtNo: number | null;
  office: 'countyChief' | 'councilSeat';
}

/**
 * 由目錄名解析選區。這批資料沒有行政區代碼，目錄名是唯一線索。
 * 認不出的回 null——由呼叫端列報，不可默默略過，否則新增的補選會被無聲吃掉。
 */
export function parseByElectionDir(dirName: string): ByElectionTarget | null {
  const county = dirName.match(/([一-鿿]{2,3}[縣市])/)?.[1];
  if (!county) return null;
  if (/市長|縣長/.test(dirName)) return { countyName: county, districtNo: null, office: 'countyChief' };
  const no = dirName.match(/第\s*(\d+)\s*選舉區/)?.[1];
  if (/議員/.test(dirName) && no) {
    return { countyName: county, districtNo: Number(no), office: 'councilSeat' };
  }
  return null;
}
