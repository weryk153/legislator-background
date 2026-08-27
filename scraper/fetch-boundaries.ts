// 界線檔轉換：SHP → 簡化後的 TopoJSON，並補上與中選會對應用的複合鍵。
//
// 原始 SHP 來自內政部國土測繪中心（見 scraper/boundaries/meta.json 記錄的下載網址與版本），
// 縣市界、鄉鎮市區界取現行版（114年版，這兩層自 2022 年起未曾調整），村里界則刻意取
// 民國 111 年 11 月版的「村里界歷史圖資」——村里界逐年變動，若用現行版會讓部分村里
// 對不上 2022 年選舉的行政區。詳細版本選擇理由見 task-7-report.md。
//
// 產物進版控：界線檔一年才變一次，每次建置都重跑既慢又需要外部下載，故只有
// scraper/boundaries/*.topo.json 與 meta.json 進版控，scraper/boundaries/src/ 下的
// 原始 SHP 不進版控（見 .gitignore）。
//
//   pnpm run build:boundaries
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { areaKey } from './lib/areaMatch';

const OUT = 'scraper/boundaries';
mkdirSync(OUT, { recursive: true });

// 欄位名稱已用 `pnpm exec mapshaper <檔> -info` 對實際下載的檔案確認過，
// 三層都是 COUNTYNAME/TOWNNAME/VILLNAME，與內政部慣用命名一致。codeField 是該層的
// 官方行政區代碼欄位，用來在名稱為空時組出不會碰撞的鍵（見下方 UNASSIGNED_MARKER）。
//
// 村里層額外併入 sanhe/Village_Sanhe.shp：主檔（1111118）完全沒有屏東縣瑪家鄉三和村
// （與鄰近排灣族保留地界址長期未定，內政部另外補測），內政部把它做成獨立的單筆
// 圖層隨現行版村里界一起發布，供各版本村里界檔案套用。詳見 meta.json 與 task-7-report.md。
const LAYERS = [
  { level: 'county', src: [`${OUT}/src/county/COUNTY_MOI_1140318.shp`], fields: ['COUNTYNAME'], codeField: 'COUNTYCODE' },
  { level: 'town', src: [`${OUT}/src/town/TOWN_MOI_1140318.shp`], fields: ['COUNTYNAME', 'TOWNNAME'], codeField: 'TOWNCODE' },
  {
    level: 'village',
    src: [`${OUT}/src/village/VILLAGE_MOI_1111118.shp`, `${OUT}/src/sanhe/Village_Sanhe.shp`],
    fields: ['COUNTYNAME', 'TOWNNAME', 'VILLNAME'],
    codeField: 'VILLCODE',
  },
] as const;

// 界線檔裡有一批「未編定村里」的多邊形（VILLNAME 為空，NOTE 欄標記「未編定村里」或
// 「高雄市旗津區代管」等），分布在連江縣各鄉、基隆中正區、新北貢寮/萬里/石門、
// 澎湖湖西鄉、金門烈嶼鄉等 46 個鄉鎮，共 206 筆——這些是真實的土地（例如未編定
// 村里的海岸公有地、代管飛地），不是資料錯誤，不可丟棄。但 areaKey 會濾掉空字串，
// 若直接用 areaKey(county, town, '') 組鍵，會收斂成兩段的「縣市/鄉鎮市區」，同一
// 鄉鎮內這些多邊形的鍵會互相重複——本任務的全量對應測試比對不到這個問題（中選會
// 的村里鍵一律是三段，不會撞到兩段鍵），但下游任務若把 key 當成多邊形識別碼，重複
// 鍵會讓這些多邊形互相覆蓋。故名稱為空時改用該多邊形自己的官方代碼（VILLCODE 等，
// 逐筆唯一，已驗證 206 筆 VILLCODE 彼此不重複）組出專屬鍵，並加上明確前綴標示這不
// 是正常的行政區村里，供下游任務辨識、不要誤當成一般村里處理。
const UNASSIGNED_MARKER = '未編定';

for (const layer of LAYERS) {
  const tmp = `${OUT}/${layer.level}.raw.json`;
  // keep-shapes：保證再小的離島也不會在簡化中消失。消失的島等於地圖上少一塊可點擊的行政區。
  // combine-files -merge-layers：村里層有兩個來源檔時，先合併成單一圖層再簡化；
  // 只有一個來源檔的縣市、鄉鎮市區層等同直接處理該檔，不受影響。
  const mergeArgs = layer.src.length > 1 ? ['combine-files', '-merge-layers', 'force'] : [];
  execFileSync('pnpm', ['exec', 'mapshaper', ...layer.src, ...mergeArgs,
    '-simplify', '10%', 'keep-shapes',
    '-o', 'format=topojson', tmp], { stdio: 'inherit' });

  const topo = JSON.parse(readFileSync(tmp, 'utf8'));
  for (const obj of Object.values(topo.objects) as any[]) {
    for (const geo of obj.geometries) {
      const p = geo.properties ?? {};
      const parts = layer.fields.map((f) => String(p[f] ?? ''));
      const name = parts[parts.length - 1];
      const code = String(p[layer.codeField] ?? '');
      geo.properties = name
        ? { key: areaKey(parts[0], parts[1], parts[2]), name }
        : {
            key: `${areaKey(parts[0], parts[1])}/${UNASSIGNED_MARKER}:${code}`,
            name: String(p.NOTE ?? UNASSIGNED_MARKER) || UNASSIGNED_MARKER,
          };
    }
  }
  writeFileSync(`${OUT}/${layer.level}.topo.json`, JSON.stringify(topo));
  const n = (Object.values(topo.objects) as any[]).reduce((s, o) => s + o.geometries.length, 0);
  console.log(`${layer.level}：${n} 個多邊形`);
}
