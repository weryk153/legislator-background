// 中選會得票數（elctks.csv）與選舉人數／投票率（elprof.csv）的解析。純字串處理，
// 無 I/O。cecVoteData.ts 已處理「誰當選」（elbase／elcand／elpaty）；這裡處理
// 「贏了幾票、投票率多少」——兩份格式各自獨立演進、拋錯範圍也不同，故不合併進
// 同一個檔案，但共用 cecVoteData.ts 的 splitCsvFields（CSV 雙格式的剝引號邏輯，
// 見該檔案首註解）。
//
// 中選會每個選舉類別目錄下都備妥現成的分層彙總，不必自己從投開票所往上加總：
// elctks.csv／elprof.csv 的「投開票所別」欄為 `0000` 即為彙總列，依「鄉鎮市區別」
// 「村里別」是否為空碼可再細分是縣市／鄉鎮市區／村里彙總——但這兩個函式不主動
// 判斷是哪一層，只負責「留下彙總列、算出五段 areaCode」，層級由呼叫端依自己需要
// 的 areaCode 對照既有的行政區樹（parseElbase）決定，不在這裡重複判斷一次。

import { splitCsvFields } from './cecVoteData';

const INT_RE = /^\d+$/;

/**
 * 百分比取到小數第二位。
 *
 * 中選會在 elctks 的得票率與 elprof 的投票率都給到小數第二位（如 42.66、67.20）。
 * 少數區的百分比必須由本站自行計算——2022 嘉義市長是重行選舉，資料在另一個目錄、
 * 格式不同，沒有現成的百分比欄位可讀。若不取位，算出來的會是 63.82271113811518
 * 這種完整浮點數，與其他 21 個縣市的兩位小數混在同一份輸出裡，讀原始資料的人會
 * 以為兩者的精度或來源不同。顯示端雖然都會 toFixed(2)，但資料本身該一致。
 */
export function toCecPercent(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * elctks.csv 一列（彙總列）。
 *
 * 原始欄位：省市別,縣市別,選區別,鄉鎮市區別,村里別,投開票所別,號次,得票數,得票率,當落註記
 */
export interface ElctksRow {
  areaCode: string;
  number: number;
  votes: number;
  share: number;
  elected: boolean;
}

/**
 * 解析 elctks.csv，只留彙總列（投開票所別為 `0000`）。
 *
 * 得票數為整數、得票率為百分比數字，兩者都不可用 parseInt／Number 靜默吞掉
 * 異常值——遇到無法解析的欄位一律拋錯，比照 cecVoteData.ts 既有的 parseElcand／
 * parseElbase 作法：資料格式一旦有異動，靜默吞掉就是悄悄漏一筆得票，直到有人
 * 發現數字對不上才回頭追查，那時已經太晚。
 *
 * 當選註記只認 `''`／`'*'`／`'?'` 三種值：elctks.csv 實測（2022 年 C1／D1／D2／V1
 * 共十萬餘列彙總列）沒有出現 `!`（婦女保障名額，只見於 elcand.csv 的當選人
 * 清單，且僅適用複數席次的議員／代表選舉，本檔案只用於單一席次的首長類選舉，
 * 不會有婦女保障名額）。`?`（得票相同待抽籤，實測僅見於 V1 村里長，42 列彙總
 * 列、對應 8 個村里 2 人一組）視為未當選——是否當選、待抽籤與否，一律以
 * cecVoteData.ts 的 parseElcand／winnersByArea／pendingDrawByArea 為準，這裡的
 * `elected` 只是輔助欄位，不是判定來源。遇到第四種未知註記一律拋錯，不猜測。
 */
export function parseElctks(csv: string): ElctksRow[] {
  const out: ElctksRow[] = [];
  const lines = (csv ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue; // 純空白行，非資料錯誤
    const f = splitCsvFields(line).map((s) => s.trim());
    const preview = () => (line.length > 80 ? `${line.slice(0, 80)}…` : line);
    if (f.length < 10) {
      throw new Error(`elctks.csv 第 ${i + 1} 列欄位不足（${f.length} 欄，至少需 10 欄）：${preview()}`);
    }
    if (f[5] !== '0000') continue; // 個別投開票所，不是彙總列

    const mark = f[9];
    if (mark !== '' && mark !== '*' && mark !== '?') {
      throw new Error(
        `elctks.csv 第 ${i + 1} 列的當落註記「${mark}」不是已知的三種值（''／*／?），`
        + `不猜測：${preview()}`,
      );
    }
    if (!INT_RE.test(f[6])) {
      throw new Error(`elctks.csv 第 ${i + 1} 列的號次「${f[6]}」不是合法整數：${preview()}`);
    }
    if (!INT_RE.test(f[7])) {
      throw new Error(
        `elctks.csv 第 ${i + 1} 列的得票數「${f[7]}」不是合法整數，不可用 parseInt 靜默吞掉：${preview()}`,
      );
    }
    const share = Number(f[8]);
    if (f[8] === '' || !Number.isFinite(share)) {
      throw new Error(`elctks.csv 第 ${i + 1} 列的得票率「${f[8]}」不是合法數字：${preview()}`);
    }

    out.push({
      areaCode: f.slice(0, 5).join('-'),
      number: Number(f[6]),
      votes: Number(f[7]),
      share,
      elected: mark === '*',
    });
  }
  return out;
}

/**
 * elprof.csv 一列（彙總列）。
 *
 * 原始欄位（共 20 欄，0 起算）：0–5 五段代碼＋投開票所別、6 有效票數、7 無效票數、
 * 8 投票數（＝6+7）、9 選舉人數、10 人口數、11–16 候選人數相關、17 選舉人數/人口數(%)、
 * 18 投票率(%)（投票數/選舉人數）、19 其他。本函式只取 6、7、8、9、18 這五欄。
 */
export interface ElprofRow {
  areaCode: string;
  validVotes: number;
  invalidVotes: number;
  castVotes: number;
  electorate: number;
  turnout: number;
}

/**
 * 解析 elprof.csv，只留彙總列（投開票所別為 `0000`）。
 *
 * 有效票／無效票／投票數／選舉人數皆為整數，投票率為百分比數字，一律嚴格解析、
 * 無法解析就拋錯（理由同 parseElctks）。
 */
export function parseElprof(csv: string): ElprofRow[] {
  const out: ElprofRow[] = [];
  const lines = (csv ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue; // 純空白行，非資料錯誤
    const f = splitCsvFields(line).map((s) => s.trim());
    const preview = () => (line.length > 80 ? `${line.slice(0, 80)}…` : line);
    if (f.length < 19) {
      throw new Error(`elprof.csv 第 ${i + 1} 列欄位不足（${f.length} 欄，至少需 19 欄）：${preview()}`);
    }
    if (f[5] !== '0000') continue; // 個別投開票所，不是彙總列

    const intField = (idx: number, label: string): number => {
      if (!INT_RE.test(f[idx])) {
        throw new Error(
          `elprof.csv 第 ${i + 1} 列的${label}「${f[idx]}」不是合法整數，不可用 parseInt 靜默吞掉：${preview()}`,
        );
      }
      return Number(f[idx]);
    };
    const validVotes = intField(6, '有效票數');
    const invalidVotes = intField(7, '無效票數');
    const castVotes = intField(8, '投票數');
    const electorate = intField(9, '選舉人數');
    const turnout = Number(f[18]);
    if (f[18] === '' || !Number.isFinite(turnout)) {
      throw new Error(`elprof.csv 第 ${i + 1} 列的投票率「${f[18]}」不是合法數字：${preview()}`);
    }

    out.push({
      areaCode: f.slice(0, 5).join('-'),
      validVotes,
      invalidVotes,
      castVotes,
      electorate,
      turnout,
    });
  }
  return out;
}
