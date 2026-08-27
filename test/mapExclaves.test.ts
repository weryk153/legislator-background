// 全量驗證 src/lib/mapExclaves.ts 的濾除邏輯：TW_ENVELOPE 只看每個環（ring）的
// 第一個座標點決定要不要濾除，效率換來的代價是——若某個環的座標序列剛好跨越
// 範圍矩形的邊界（一部分在內、一部分在外），會被整環誤判。
//
// 這批界線檔（public/data/map/ 底下全部 391 個檔案）目前沒有這種跨界的環，但這純粹
// 是這批資料剛好如此，不是這個矩形保證如此。界線檔換版後若打破這個假設，地圖會在
// 沒有任何錯誤訊息、沒有建置失敗的情況下悄悄少畫一塊——這正是本站最需要防範的
// 靜默失敗。故逐檔逐環全量掃描，斷言兩件事：
//   1. 「只看第一點」與「全環都要在範圍內」兩種判定完全一致（不一致的環數為 0）；
//   2. 範圍外的環清單，逐筆比對一份明列的已知清單（比照 scraper/lib/areaMatch.ts
//      的 KNOWN_MISSING_BOUNDARY_KEYS 模式），而不是用數量門檻——這樣任何新出現的
//      範圍外案例（不論是真的新外島、還是矩形判斷被打破而誤濾了本島的一塊）都會讓
//      這筆比對失敗、測試變紅，而不是被「筆數差不多」蒙混過去。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { feature } from 'topojson-client';
import { inEnvelope, type LonLat } from '../src/lib/mapExclaves';

const MAP_DIR = 'public/data/map';

function listMapFiles(): string[] {
  const files = [join(MAP_DIR, 'national.json')];
  for (const sub of ['county', 'town'] as const) {
    for (const f of readdirSync(join(MAP_DIR, sub))) {
      files.push(join(MAP_DIR, sub, f));
    }
  }
  return files.sort();
}

interface RingRef { file: string; key: string; partIdx: number; ringIdx: number; ring: LonLat[] }

// 遍歷一個檔案裡所有 TopoJSON objects、所有 feature 的所有多邊形部件與環。
// Polygon 視為只有一個部件（part0），與 MultiPolygon 用同一套索引方式，
// 對齊 src/lib/mapExclaves.ts 的 clipFarExclaves 實際處理的兩種型別。
function ringsOf(file: string): RingRef[] {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const topo = data.topology;
  const refs: RingRef[] = [];
  for (const objName of Object.keys(topo.objects)) {
    const fc = feature(topo, topo.objects[objName]) as any;
    const feats = fc.type === 'FeatureCollection' ? fc.features : [fc];
    for (const f of feats) {
      const geom = f.geometry;
      if (!geom) continue;
      const key = f.properties.key as string;
      const parts: LonLat[][][] =
        geom.type === 'Polygon' ? [geom.coordinates]
          : geom.type === 'MultiPolygon' ? geom.coordinates
            : [];
      parts.forEach((part, partIdx) => {
        part.forEach((ring: LonLat[], ringIdx: number) => {
          refs.push({ file, key, partIdx, ringIdx, ring });
        });
      });
    }
  }
  return refs;
}

function ringId(r: RingRef): string {
  return `${r.file}::${r.key}::part${r.partIdx}.ring${r.ringIdx}`;
}

// 已知落在 TW_ENVELOPE 範圍外的環，逐筆列名並附理由——見 src/lib/mapExclaves.ts
// 開頭的說明。這份清單本身就是這支測試存在的理由：日後界線檔換版，這裡任何一筆
// 對不上（不論多或少）都要人工複核，不可直接放寬成數量門檻。
//
//   高雄市旗津區依法轄有南海的東沙島、太平島：
//     national.json、county/64-000-00-000-0000.json 各 2 個部件（太平島、東沙島
//     各 1 部件 1 環）；下鑽到旗津區村里層後，兩座島各自獨立成一筆「未編定村里」
//     （town/64-000-00-100-0000.json），各 1 部件 1 環。
//   宜蘭縣頭城鎮大溪里依法轄有東北方的釣魚台列嶼：
//     national.json、county/10-002-00-000-0000.json、town/10-002-00-040-0000.json
//     各 6 個部件（列嶼中的 6 個島礁，各 1 部件 1 環）。
// 合計 2+2+2 + 6+6+6 = 24 個環，與實測全量掃描結果一致。
const KNOWN_OUTSIDE_RINGS: readonly string[] = [
  // 高雄市旗津區：東沙島、太平島
  'public/data/map/national.json::高雄市::part1.ring0',
  'public/data/map/national.json::高雄市::part2.ring0',
  'public/data/map/county/64-000-00-000-0000.json::高雄市/旗津區::part1.ring0',
  'public/data/map/county/64-000-00-000-0000.json::高雄市/旗津區::part2.ring0',
  'public/data/map/town/64-000-00-100-0000.json::高雄市/旗津區/未編定:64000100I01::part0.ring0',
  'public/data/map/town/64-000-00-100-0000.json::高雄市/旗津區/未編定:64000100I02::part0.ring0',
  // 宜蘭縣頭城鎮大溪里：釣魚台列嶼（6 個島礁部件）
  'public/data/map/national.json::宜蘭縣::part2.ring0',
  'public/data/map/national.json::宜蘭縣::part3.ring0',
  'public/data/map/national.json::宜蘭縣::part4.ring0',
  'public/data/map/national.json::宜蘭縣::part5.ring0',
  'public/data/map/national.json::宜蘭縣::part6.ring0',
  'public/data/map/national.json::宜蘭縣::part7.ring0',
  'public/data/map/county/10-002-00-000-0000.json::宜蘭縣/頭城鎮::part2.ring0',
  'public/data/map/county/10-002-00-000-0000.json::宜蘭縣/頭城鎮::part3.ring0',
  'public/data/map/county/10-002-00-000-0000.json::宜蘭縣/頭城鎮::part4.ring0',
  'public/data/map/county/10-002-00-000-0000.json::宜蘭縣/頭城鎮::part5.ring0',
  'public/data/map/county/10-002-00-000-0000.json::宜蘭縣/頭城鎮::part6.ring0',
  'public/data/map/county/10-002-00-000-0000.json::宜蘭縣/頭城鎮::part7.ring0',
  'public/data/map/town/10-002-00-040-0000.json::宜蘭縣/頭城鎮/大溪里::part1.ring0',
  'public/data/map/town/10-002-00-040-0000.json::宜蘭縣/頭城鎮/大溪里::part2.ring0',
  'public/data/map/town/10-002-00-040-0000.json::宜蘭縣/頭城鎮/大溪里::part3.ring0',
  'public/data/map/town/10-002-00-040-0000.json::宜蘭縣/頭城鎮/大溪里::part4.ring0',
  'public/data/map/town/10-002-00-040-0000.json::宜蘭縣/頭城鎮/大溪里::part5.ring0',
  'public/data/map/town/10-002-00-040-0000.json::宜蘭縣/頭城鎮/大溪里::part6.ring0',
].sort();

describe('public/data/map 全量：TW_ENVELOPE 的頭點判定不會誤判跨界的環', () => {
  const files = listMapFiles();
  const allRings = files.flatMap(ringsOf);

  it(`共掃描 ${files.length} 個檔案（1 全國＋22 縣市＋368 鄉鎮市區）`, () => {
    expect(files.length).toBe(391);
  });

  it('每個環的「只看第一點」與「全環都要在範圍內」判定完全一致（無跨界的環）', () => {
    const mismatches = allRings
      .filter((r) => inEnvelope(r.ring[0]) !== r.ring.every(inEnvelope))
      .map(ringId);
    expect(mismatches).toEqual([]);
  });

  it('範圍外的環清單恰好等於已知清單，不多不少', () => {
    const outside = allRings.filter((r) => !inEnvelope(r.ring[0])).map(ringId).sort();
    expect(outside).toEqual([...KNOWN_OUTSIDE_RINGS]);
  });
});
