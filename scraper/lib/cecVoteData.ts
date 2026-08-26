// 中選會投開票資料的解析。純字串處理，無 I/O。
//
// CSV 為 UTF-8、無標頭列。五段代碼是「省市別, 縣市別, 選區別, 鄉鎮市區別, 村里別」，
// 各段位數固定（2,3,2,3,4），前導零有意義，一律以字串保留。

export type AreaLevel = 'county' | 'town' | 'village';

export interface AreaNode {
  code: string;
  level: AreaLevel;
  name: string;
  parent: string | null;
}

const seg = (code: string): string[] => code.split('-');

/** 上溯到所屬縣市的代碼。選區別、鄉鎮市區別、村里別一律歸零。 */
export function countyCodeOf(areaCode: string): string {
  const s = seg(areaCode);
  return [s[0], s[1], '00', '000', '0000'].join('-');
}

/** 上溯到所屬鄉鎮市區的代碼。村里別歸零。 */
export function townCodeOf(areaCode: string): string {
  const s = seg(areaCode);
  return [s[0], s[1], s[2], s[3], '0000'].join('-');
}

/**
 * 解析 elbase.csv 為行政區樹。
 *
 * 層級不能只看「縣市別」欄位：直轄市在中選會代碼裡是用**省市別**表示的
 * （63 臺北、64 高雄、65 新北、66 臺中、67 臺南、68 桃園），其縣市別固定為 000，
 * 與「全國」列的 000 撞在一起。故以「鄉鎮市區別／村里別是否為空碼」判斷層級，
 * 並單獨排除省市別為 00 的全國列。
 *
 * 有內容卻欄位不足或名稱為空的列一律拋錯，不做靜默跳過：行政區樹少一列，
 * 地圖上就少一塊行政區。若不拋錯，2026 年的資料格式一旦有異動（例如多了
 * 標頭列、欄位數不同），會安靜地漏掉行政區而沒有人發現，直到地圖上發現
 * 憑空缺一塊才回頭追查——那時已經太晚。純空白行（含檔尾換行留下的空列）
 * 則是正常現象，予以略過。
 */
export function parseElbase(csv: string): AreaNode[] {
  const out: AreaNode[] = [];
  const lines = (csv ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue; // 純空白行，非資料錯誤
    const f = line.split(',').map((s) => s.trim());
    if (f.length < 6 || !f[5]) {
      const preview = line.length > 80 ? `${line.slice(0, 80)}…` : line;
      throw new Error(`elbase.csv 第 ${i + 1} 列格式不良（欄位不足或名稱為空）：${preview}`);
    }
    const [prv, city, dist, town, village] = f;
    if (prv === '00') continue; // 全國
    const code = f.slice(0, 5).join('-');
    if (village !== '0000') {
      out.push({ code, level: 'village', name: f[5], parent: [prv, city, dist, town, '0000'].join('-') });
    } else if (town !== '000') {
      out.push({ code, level: 'town', name: f[5], parent: [prv, city, dist, '000', '0000'].join('-') });
    } else {
      out.push({ code, level: 'county', name: f[5], parent: null });
    }
  }
  return out;
}
