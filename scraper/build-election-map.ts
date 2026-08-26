// 合併中選會選舉結果與行政區界線，輸出分層地圖資料。
//
// 為什麼分層：全國 7,756 個村里若一次送給瀏覽器，檔案數十 MB。改成點到哪載到哪，
// 單一畫面的多邊形數是全國 22、縣市層 5–39、鄉鎮市區層平均 21。
//
// 為什麼輸出到 public/ 而非 src/：這些檔案要在執行期被 fetch。src/ 底下的檔案只在
// 建置期可用，放錯會 404。站上既有的 public/data/donors.json 即此慣例。
//
//   pnpm run build:election-map
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import {
  parseElbase, parseElcand, parseElpaty, winnersByArea, countyCodeOf, townCodeOf,
  INDEPENDENT_PARTY_CODE, type Candidate, type AreaNode,
} from './lib/cecVoteData';
import { parseByElection, parseByElectionDir } from './lib/cecByElection';
import { buildCodeIndex } from './lib/areaMatch';
import { seatBreakdown, toTermRecords, termLimited } from './lib/electionRules';
import type { MapArea, MapLayer, Officeholder } from '../src/lib/mapTypes';

const CEC = 'scraper/out-roster/cec';
const R22 = `${CEC}/voteData/2022-111年地方公職人員選舉`;
const R18 = `${CEC}/voteData/2018-107年地方公職人員選舉`;
const OUT = 'public/data/map';
const UPCOMING = 2026;

const read = (p: string) => readFileSync(p, 'utf8');

// 2022 的類別代碼。C1/T1/T2/T3 之下再分 city/ 與 prv/，其餘直接在類別目錄下。
const CAT_2022 = [
  { code: 'C1', office: 'countyChief', subs: ['city', 'prv'] },
  { code: 'T1', office: 'councilSeat', subs: ['city', 'prv'] },
  { code: 'T2', office: 'councilSeat', subs: ['city', 'prv'] },
  { code: 'T3', office: 'councilSeat', subs: ['city', 'prv'] },
  { code: 'D1', office: 'townChief', subs: [''] },
  { code: 'D2', office: 'townChief', subs: [''] },
  { code: 'R1', office: 'townRepSeat', subs: [''] },
  { code: 'R2', office: 'townRepSeat', subs: [''] },
  { code: 'R3', office: 'townRepSeat', subs: [''] },
  { code: 'V1', office: 'villageChief', subs: [''] },
] as const;

type Office = typeof CAT_2022[number]['office'];

function loadWinners(): Map<Office, Candidate[]> {
  const m = new Map<Office, Candidate[]>();
  for (const c of CAT_2022) {
    const cands = c.subs.flatMap((s) => parseElcand(read([R22, c.code, s, 'elcand.csv'].filter(Boolean).join('/'))));
    const won = [...winnersByArea(cands).values()].flat();
    m.set(c.office, [...(m.get(c.office) ?? []), ...won]);
  }
  return m;
}

// 2018 只需縣市長，且目錄名是中文而非代碼（見任務書 Global Constraints）
function load2018Chiefs(): Candidate[] {
  return ['直轄市市長', '縣市市長']
    .flatMap((d) => parseElcand(read(`${R18}/${d}/elcand.csv`)))
    .filter((c) => c.elected);
}

// 站上既有人物的 slug：用「姓名＋縣市」比對，對不到就是 null（本站尚無此人背景資料）
function loadSlugs(officials: any[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of officials) {
    if (o.officeType !== 'mayor_magistrate' && o.officeType !== 'councilor') continue;
    const county = String(o.district ?? '').match(/^(.+?[縣市])/)?.[1] ?? '';
    if (county) m.set(`${o.name}/${county}`, o.slug);
  }
  return m;
}

// 補選與重行選舉的覆蓋。「現況」不等於「2022 當選名單」：嘉義市長延後重行選舉，
// 另有四場議員缺額補選。不套用這些修正，嘉義市會是空白，四個議員選區會顯示已離職者。
function applyByElections(
  winners: Map<Office, Candidate[]>,
  areas: AreaNode[],
  parties: Map<string, string>,
  officials: any[],
): string[] {
  const notes: string[] = [];
  const countyByName = new Map(areas.filter((a) => a.level === 'county').map((a) => [a.name, a.code]));
  const partyCodeByName = new Map([...parties.entries()].map(([code, name]) => [name, code]));

  const dirs = [
    `${CEC}/2022年_嘉義市長重行選舉`,
    ...readdirSync(`${CEC}/鄉鎮市長及議員補選(2023年後)`)
      .map((d) => `${CEC}/鄉鎮市長及議員補選(2023年後)/${d}`),
  ];

  for (const dir of dirs) {
    const name = basename(dir);
    const target = parseByElectionDir(name);
    const win = parseByElection(read(`${dir}/cand.csv`), read(`${dir}/prof.csv`));
    if (!target || !win) { notes.push(`無法解析補選：${name}`); continue; }
    const countyCode = countyByName.get(target.countyName);
    if (!countyCode) { notes.push(`補選的縣市對不到行政區樹：${name}`); continue; }

    // 補選檔的政黨是名稱不是代號；「無」即無黨籍
    const partyCode = win.partyName === '無'
      ? INDEPENDENT_PARTY_CODE
      : partyCodeByName.get(win.partyName) ?? INDEPENDENT_PARTY_CODE;

    const s = countyCode.split('-');
    const areaCode = target.districtNo == null
      ? countyCode
      : [s[0], s[1], String(target.districtNo).padStart(2, '0'), '000', '0000'].join('-');

    const c: Candidate = {
      areaCode, number: 0, name: win.name, partyCode,
      sex: '1', birthDate: '', age: 0, education: '',
      incumbent: false, elected: true,
    };

    const list = winners.get(target.office) ?? [];
    if (target.office === 'countyChief') {
      // 首長為單一席次：同縣市的既有紀錄整筆換掉
      winners.set('countyChief', [...list.filter((w) => countyCodeOf(w.areaCode) !== countyCode), c]);
      notes.push(`套用重行選舉：${target.countyName}縣市長 → ${win.name}`);
      continue;
    }

    // 議員缺額補選：先移除已離職者、再附加補選當選者。原始補選資料本身無從得知
    // 是哪一位離職，故以「該選區 2022 當選者中，姓名不在 officials.json 該選區
    // 現任議員名單者」推導離職者。若這樣篩出的人數不是恰好 1 位，代表無法唯一
    // 判定，寧可不刪（席次多算 1 席），也不要誤刪一位仍在任的議員——退回單純
    // 附加，並印出警告供人工確認。
    if (list.some((w) => w.areaCode === areaCode && w.name === win.name)) {
      notes.push(`補選當選者已在名單中，略過附加：${target.countyName}第${target.districtNo}選舉區 → ${win.name}`);
      continue;
    }
    const districtStr = `${target.countyName}第${String(target.districtNo).padStart(2, '0')}選舉區`;
    const currentNames = new Set(
      officials
        .filter((o) => o.officeType === 'councilor' && o.isIncumbent && o.district === districtStr)
        .map((o) => o.name),
    );
    const here = list.filter((w) => w.areaCode === areaCode);
    const departed = here.filter((w) => !currentNames.has(w.name));

    if (departed.length === 1) {
      winners.set(target.office, [...list.filter((w) => w !== departed[0]), c]);
      notes.push(`套用缺額補選：${target.countyName}第${target.districtNo}選舉區 → 移除已離職的 ${departed[0].name}，新增 ${win.name}`);
    } else {
      winners.set(target.office, [...list, c]);
      notes.push(`⚠ 缺額補選 ${target.countyName}第${target.districtNo}選舉區：無法唯一判定離職者`
        + `（候選 ${departed.length} 位：${departed.map((d) => d.name).join('、') || '無'}），退回單純附加 → ${win.name}`
        + '（該選區席次可能多計 1 席，請人工確認）');
    }
  }
  return notes;
}

const areas = parseElbase(read(`${R22}/V1/elbase.csv`));
const byCode = new Map(areas.map((a) => [a.code, a]));
const codeIndex = buildCodeIndex(areas);
const parties = parseElpaty(read(`${R22}/V1/elpaty.csv`));
const winners = loadWinners();
const officials = JSON.parse(read('src/data/officials.json')) as any[];
for (const n of applyByElections(winners, areas, parties, officials)) console.log(' ', n);
const slugs = loadSlugs(officials);
const history = [
  ...toTermRecords(2018, load2018Chiefs()),
  ...toTermRecords(2022, winners.get('countyChief') ?? []),
];

const countyNameOf = (code: string) => byCode.get(countyCodeOf(code))?.name ?? '';

function holder(c: Candidate | undefined, withTermLimit: boolean): Officeholder | null {
  if (!c) return null;
  const county = countyNameOf(c.areaCode);
  const o: Officeholder = {
    name: c.name,
    partyCode: c.partyCode,
    partyName: parties.get(c.partyCode) ?? `未知政黨（代號 ${c.partyCode}）`,
    slug: slugs.get(`${c.name}/${county}`) ?? null,
  };
  if (withTermLimit) {
    const r = termLimited(c, history, countyCodeOf(c.areaCode), UPCOMING);
    o.termLimited = r.limited;
    o.termLimitReason = r.reason;
  }
  return o;
}

/** 依「上溯後的區代碼」把當選者分組。議員的選區不是行政區，須先上溯才能按縣市彙整。 */
function groupBy(cands: Candidate[], up: (code: string) => string): Map<string, Candidate[]> {
  const m = new Map<string, Candidate[]>();
  for (const c of cands) {
    const k = up(c.areaCode);
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return m;
}

const chiefByCounty = new Map((winners.get('countyChief') ?? []).map((c) => [countyCodeOf(c.areaCode), c]));
const chiefByTown = new Map((winners.get('townChief') ?? []).map((c) => [townCodeOf(c.areaCode), c]));
const chiefByVillage = new Map((winners.get('villageChief') ?? []).map((c) => [c.areaCode, c]));
const councilByCounty = groupBy(winners.get('councilSeat') ?? [], countyCodeOf);
const repByTown = groupBy(winners.get('townRepSeat') ?? [], townCodeOf);

// 三層界線檔預先讀入一次，避免每個縣市/鄉鎮市區檔都重新讀取整份全國多邊形集合
// （鄉鎮市區層要跑 368 次，每次都重讀 2.6MB 的村里界線檔會很浪費）。
const boundaryTopo: Record<'county' | 'town' | 'village', any> = {
  county: JSON.parse(read('scraper/boundaries/county.topo.json')),
  town: JSON.parse(read('scraper/boundaries/town.topo.json')),
  village: JSON.parse(read('scraper/boundaries/village.topo.json')),
};

// 界線檔裡所有村里層多邊形的鍵，含「縣市/鄉鎮市區/未編定:代碼」這種真實有地、
// 但未劃入任何行政村的土地（206 筆，分布在連江縣各鄉、基隆中正區等 47 個鄉鎮）。
const allVillageKeys: string[] = (Object.values(boundaryTopo.village.objects) as any[])
  .flatMap((o) => o.geometries.map((g: any) => g.properties.key as string));

/**
 * 展開含頓號的複合鍵。連江縣（馬祖）人口稀少，中選會把數個行政村合併成一個
 * 選舉單位，名稱以頓號相連（如「復興村、福沃村」），但界線檔仍按行政村逐村
 * 畫界——一個選舉單位天生對應多塊共用同一位村里長的多邊形，這是事實而非例外。
 * 若直接用原始複合鍵比對，這些多邊形會被 subsetTopology 全數濾掉，連江縣的
 * 村里層地圖會出現大片空洞。做法與 test/areaMatch.test.ts 的全量對應測試一致：
 * 拆開頓號、逐段展開成多個鍵再比對。
 */
function expandKeys(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    const segs = key.split('/');
    const names = segs[segs.length - 1].split('、');
    for (const name of names) out.add([...segs.slice(0, -1), name].join('/'));
  }
  return out;
}

/**
 * 走訪 TopoJSON 幾何的 arcs 索引結構（Polygon 是二維、MultiPolygon 是三維，
 * 但葉節點永遠是數字），不分型別、遞迴處理到底。
 */
function walkArcIndices(node: unknown, visit: (i: number) => void): void {
  if (Array.isArray(node)) { for (const x of node) walkArcIndices(x, visit); return; }
  if (typeof node === 'number') visit(node);
}
function mapArcIndices(node: unknown, remap: (i: number) => number): unknown {
  if (Array.isArray(node)) return node.map((x) => mapArcIndices(x, remap));
  if (typeof node === 'number') return remap(node);
  return node;
}

/**
 * 從整層 TopoJSON 抽出指定 key 集合的子集，避免每個縣市檔都挾帶全國的幾何。
 *
 * 只過濾 geometries 不夠：TopoJSON 的座標其實存在共用的 arcs 陣列裡，geometries
 * 只是存 arcs 的索引（負數代表方向反轉，需以 ~i 還原）。若不連 arcs 一併裁切，
 * 每個縣市/鄉鎮市區檔仍會挾帶全國（或全縣市）的座標資料——實測下每個鄉鎮市區
 * 檔會膨脹到 1.5MB 以上，遠超 200KB 上限。故在濾掉幾何後，另外走訪剩餘幾何
 * 實際引用到的 arc 索引，只保留這些 arc、並依新順序重新編號、把 geometries
 * 的索引改寫成對應到新陣列的位置。arc 本身是各自獨立、自帶絕對起點的 delta
 * 編碼（TopoJSON 規格），重新排序、抽取子集不影響座標還原，不需調整 transform。
 */
function subsetTopology(level: 'county' | 'town' | 'village', keys: Set<string>): unknown {
  const topo = boundaryTopo[level];
  const expanded = expandKeys(keys);
  const objects: Record<string, any> = {};
  const keptGeometries: any[] = [];
  for (const [name, obj] of Object.entries(topo.objects) as [string, any][]) {
    // 淺拷貝每個保留下來的幾何物件，稍後會就地改寫 .arcs 的索引——不可直接
    // 共用 boundaryTopo 快取裡的物件，否則會汙染下一次呼叫（例如另一個鄉鎮）
    // 讀到的原始資料。
    const geometries = obj.geometries
      .filter((g: any) => expanded.has(g.properties.key))
      .map((g: any) => ({ ...g }));
    objects[name] = { ...obj, geometries };
    keptGeometries.push(...geometries);
  }

  const referenced = new Set<number>();
  for (const g of keptGeometries) walkArcIndices(g.arcs, (i) => referenced.add(i < 0 ? ~i : i));
  const sorted = [...referenced].sort((a, b) => a - b);
  const oldToNew = new Map(sorted.map((oldIdx, newIdx) => [oldIdx, newIdx]));
  const arcs = sorted.map((i) => topo.arcs[i]);
  for (const g of keptGeometries) {
    g.arcs = mapArcIndices(g.arcs, (i) => {
      const newAbs = oldToNew.get(i < 0 ? ~i : i)!;
      return i < 0 ? ~newAbs : newAbs;
    });
  }

  return { ...topo, arcs, objects };
}

function buildArea(a: AreaNode, chief: Candidate | undefined, seatWinners: Candidate[], childFile: string | null): MapArea {
  return {
    code: a.code,
    key: codeIndex.get(a.code) ?? a.code,
    name: a.name,
    chief: holder(chief, a.level === 'county'),
    seats: seatWinners.length ? seatBreakdown(seatWinners, parties) : [],
    childFile,
  };
}

mkdirSync(`${OUT}/county`, { recursive: true });
mkdirSync(`${OUT}/town`, { recursive: true });

// 全國層
const counties = areas.filter((a) => a.level === 'county');
const national: MapLayer = {
  level: 'national',
  parentName: '全國',
  topology: subsetTopology('county', new Set(counties.map((a) => codeIndex.get(a.code) ?? a.code))),
  areas: counties.map((a) => buildArea(a, chiefByCounty.get(a.code), councilByCounty.get(a.code) ?? [], `county/${a.code}.json`)),
};
writeFileSync(`${OUT}/national.json`, JSON.stringify(national));

// 縣市層：該縣市轄下的鄉鎮市區
for (const c of counties) {
  const towns = areas.filter((a) => a.level === 'town' && countyCodeOf(a.code) === c.code);
  const layer: MapLayer = {
    level: 'county',
    parentName: c.name,
    topology: subsetTopology('town', new Set(towns.map((a) => codeIndex.get(a.code) ?? a.code))),
    areas: towns.map((a) => buildArea(a, chiefByTown.get(a.code), repByTown.get(a.code) ?? [], `town/${a.code}.json`)),
  };
  writeFileSync(`${OUT}/county/${c.code}.json`, JSON.stringify(layer));
}

// 鄉鎮市區層：該鄉鎮市區轄下的村里。村里為最底層，childFile 為 null。
let unassignedTotal = 0;
for (const t of areas.filter((a) => a.level === 'town')) {
  const villages = areas.filter((a) => a.level === 'village' && townCodeOf(a.code) === t.code);
  const villageAreas = villages.map((a) => buildArea(a, chiefByVillage.get(a.code), [], null));

  // 未編定村里：不在中選會的行政區樹裡，故不能用 buildArea（沒有 AreaNode 可用）。
  // 若略過，這些鄉鎮的村里層地圖會出現沒有任何說明的破洞；改輸出成中性、不可
  // 點擊的區塊（chief 為 null、seats 為空、childFile 為 null）——本站規格要求
  // 「資料深度必須看得出來」，有標示的空白區優於無說明的破洞。
  const townKey = codeIndex.get(t.code) ?? t.name;
  const unassignedPrefix = `${townKey}/未編定:`;
  const unassignedKeys = allVillageKeys.filter((k) => k.startsWith(unassignedPrefix));
  const unassignedAreas: MapArea[] = unassignedKeys.map((key) => ({
    code: key.slice(unassignedPrefix.length),
    key,
    name: '未編定村里',
    chief: null,
    seats: [],
    childFile: null,
  }));
  unassignedTotal += unassignedAreas.length;

  const keys = new Set([...villages.map((a) => codeIndex.get(a.code) ?? a.code), ...unassignedKeys]);
  const layer: MapLayer = {
    level: 'town',
    parentName: t.name,
    topology: subsetTopology('village', keys),
    areas: [...villageAreas, ...unassignedAreas],
  };
  writeFileSync(`${OUT}/town/${t.code}.json`, JSON.stringify(layer));
}

writeFileSync(`${OUT}/meta.json`, JSON.stringify({
  electionYear: 2022,
  electionName: '111年地方公職人員選舉',
  upcomingElection: '2026-11-28',
  boundaries: JSON.parse(read('scraper/boundaries/meta.json')),
  generatedAt: new Date().toISOString().slice(0, 10),
}, null, 2));

console.log(`輸出：全國 1 檔、縣市 ${counties.length} 檔、鄉鎮市區 ${areas.filter((a) => a.level === 'town').length} 檔`);
console.log(`鄉鎮市區層另含 ${unassignedTotal} 筆未編定村里區塊（無行政區代碼，不可點擊）`);
