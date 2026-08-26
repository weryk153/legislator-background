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
// 三層都是 COUNTYNAME/TOWNNAME/VILLNAME，與內政部慣用命名一致。
//
// 村里層額外併入 sanhe/Village_Sanhe.shp：主檔（1111118）完全沒有屏東縣瑪家鄉三和村
// （與鄰近排灣族保留地界址長期未定，內政部另外補測），內政部把它做成獨立的單筆
// 圖層隨現行版村里界一起發布，供各版本村里界檔案套用。詳見 meta.json 與 task-7-report.md。
const LAYERS = [
  { level: 'county', src: [`${OUT}/src/county/COUNTY_MOI_1140318.shp`], fields: ['COUNTYNAME'] },
  { level: 'town', src: [`${OUT}/src/town/TOWN_MOI_1140318.shp`], fields: ['COUNTYNAME', 'TOWNNAME'] },
  {
    level: 'village',
    src: [`${OUT}/src/village/VILLAGE_MOI_1111118.shp`, `${OUT}/src/sanhe/Village_Sanhe.shp`],
    fields: ['COUNTYNAME', 'TOWNNAME', 'VILLNAME'],
  },
] as const;

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
      geo.properties = {
        key: areaKey(parts[0], parts[1], parts[2]),
        name: parts[parts.length - 1],
      };
    }
  }
  writeFileSync(`${OUT}/${layer.level}.topo.json`, JSON.stringify(topo));
  const n = (Object.values(topo.objects) as any[]).reduce((s, o) => s + o.geometries.length, 0);
  console.log(`${layer.level}：${n} 個多邊形`);
}
