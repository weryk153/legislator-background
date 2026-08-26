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
  parseElbase, parseElcand, parseElpaty, winnersByArea, pendingDrawByArea, countyCodeOf, townCodeOf,
  INDEPENDENT_PARTY_CODE, UNKNOWN_PARTY_CODE, type Candidate, type AreaNode,
} from './lib/cecVoteData';
import { parseByElection, parseByElectionDir } from './lib/cecByElection';
import { buildCodeIndex, normalizeAreaName, KNOWN_MISSING_BOUNDARY_KEYS } from './lib/areaMatch';
import { seatBreakdown, toTermRecords, termLimited } from './lib/electionRules';
import {
  UNASSIGNED_VILLAGE_PREFIX,
  type MapArea, type MapLayer, type Officeholder, type OfficeStatus,
} from '../src/lib/mapTypes';

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

const catFile = (code: string, sub: string, file: string) =>
  [R22, code, sub, file].filter(Boolean).join('/');

function loadWinners(): Map<Office, Candidate[]> {
  const m = new Map<Office, Candidate[]>();
  for (const c of CAT_2022) {
    const cands = c.subs.flatMap((s) => parseElcand(read(catFile(c.code, s, 'elcand.csv'))));
    const won = [...winnersByArea(cands).values()].flat();
    m.set(c.office, [...(m.get(c.office) ?? []), ...won]);
  }
  return m;
}

/**
 * 得票相同、待抽籤的候選人，依「上溯後的區代碼」分組。
 *
 * 中選會註記 `?`（見 cecVoteData.ts 的 ElectedMark）。實測 2022 年共 18 筆：
 * 8 個村里各 2 人（村長 1 席）、澎湖縣 1 個鄉鎮市民代表選舉區 2 人。這些席位
 * 開票當晚就抽籤決定了，只是這份檔案沒記結果——必須明確呈現為「待抽籤」，
 * 不可顯示成「查無資料」。
 */
function loadPendingDraws(): Map<Office, Map<string, Candidate[]>> {
  const m = new Map<Office, Map<string, Candidate[]>>();
  for (const c of CAT_2022) {
    const cands = c.subs.flatMap((s) => parseElcand(read(catFile(c.code, s, 'elcand.csv'))));
    const cur = m.get(c.office) ?? new Map<string, Candidate[]>();
    for (const [area, list] of pendingDrawByArea(cands)) cur.set(area, [...(cur.get(area) ?? []), ...list]);
    m.set(c.office, cur);
  }
  return m;
}

/**
 * 該層級的職務在哪些鄉鎮市區是民選的——由中選會的 elbase 直接推導，不用名稱猜。
 *
 * 直轄市與省轄市的一般區長依地方制度法第 58 條由市長依法任用（官派），沒有選舉、
 * 也沒有區民代表會；但**直轄市山地原住民區**（烏來、復興、和平、茂林、桃源、
 * 那瑪夏共 6 區）依同法第 83 條之 2 是地方自治團體，區長與區民代表都是民選。
 * 故不能用「名稱結尾是不是『區』」判斷——那 6 個區會被誤判成官派。
 *
 * 判準改為「該鄉鎮市區有沒有出現在對應類別的 elbase 裡」：出現＝有這場選舉。
 * 實測 D1＋D2 涵蓋 204 個鄉鎮市區、R1＋R2＋R3 同樣涵蓋 204 個，兩者完全一致，
 * 其餘 164 個全部是一般區。
 */
function townsWithOffice(cats: readonly string[]): Set<string> {
  const s = new Set<string>();
  for (const cat of cats) {
    for (const a of parseElbase(read(`${R22}/${cat}/elbase.csv`))) {
      if (a.level === 'county') continue;
      s.add(townCodeOf(a.code));
    }
  }
  return s;
}

// 2018 只需縣市長，且目錄名是中文而非代碼（見任務書 Global Constraints）
function load2018Chiefs(): Candidate[] {
  return ['直轄市市長', '縣市市長']
    .flatMap((d) => parseElcand(read(`${R18}/${d}/elcand.csv`)))
    .filter((c) => c.elected);
}

/**
 * 站上既有**縣市長**的 slug：用「姓名＋縣市」比對，對不到就是 null（本站尚無此人資料）。
 *
 * **只收 mayor_magistrate**。曾經連 councilor 也一起收，而 `holder()` 對每一層都拿
 * 「姓名/縣市」去查，結果三位村里長被連到同名縣市議員的檔案頁：
 *   嘉義縣義竹鄉頭竹村村長 黃榮利 → 嘉義縣第01選舉區議員 黃榮利
 *   新北市新莊區中原里里長 黃永昌 → 新北市第08選舉區議員 黃永昌
 *   臺南市六甲區水林里里長 李宗霖 → 臺南市第10選舉區議員 李宗霖
 * 站上只有縣市長、縣市議員、立委三種人物的檔案頁，沒有任何村里長或鄉鎮市長；
 * 依地方制度法第 28 條之規定不得兼任，這三組必定是不同人。這正是本站最忌諱的
 * 「把某甲的資料掛到某乙頭上」。
 *
 * 規格 §1.1 提到縣市議員也要能連回檔案頁，但側欄目前只顯示政黨席次彙總、沒有
 * 連到議員個人的入口，故 councilor 那半邊的 slug 從頭到尾沒有合法用途。日後要
 * 做的話**必須用選區代碼＋姓名**對應，不可用縣市＋姓名——縣市＋姓名在議員這一
 * 層本來就會撞（同縣市不同選區的同名議員）。
 *
 * 「姓名＋縣市」在縣市長這一層仍不保證唯一（同一縣市歷任市長同名），故比照
 * areaMatch.ts 的 buildKeyIndex 做法，逐一分組後檢查每個鍵是否只對到一筆，
 * 一旦碰撞就拋錯列名，而不是安靜地讓後者贏。
 */
function loadSlugs(officials: any[]): Map<string, string> {
  const groups = new Map<string, string[]>();
  for (const o of officials) {
    if (o.officeType !== 'mayor_magistrate') continue;
    const county = String(o.district ?? '').match(/^(.+?[縣市])/)?.[1] ?? '';
    if (!county) continue;
    const key = `${o.name}/${county}`;
    groups.set(key, [...(groups.get(key) ?? []), o.slug]);
  }
  const collisions = [...groups.entries()].filter(([, slugs]) => slugs.length > 1);
  if (collisions.length) {
    throw new Error(
      `officials.json 姓名＋縣市鍵碰撞，無法安全對應 slug（常見名寧缺勿錯，寧可拋錯也不要連錯人）：`
      + collisions.map(([k, s]) => `${k} → ${s.join('、')}`).join('；'),
    );
  }
  return new Map([...groups.entries()].map(([k, v]) => [k, v[0]]));
}

/**
 * 補選檔的政黨欄是**名稱**而非代號，須換回 2022 的代碼表。
 *
 * 對不到時回 UNKNOWN_PARTY_CODE 並列報，**不可回無黨籍**：曾經寫成
 * `?? INDEPENDENT_PARTY_CODE`，那個 `??` 右邊不是預設值而是猜測，會把有黨籍的
 * 補選當選者靜默改寫成無黨籍——直接違反「不做模糊猜測」。
 *
 * 比對前先做名稱正規化（臺／台、全半形、空白），沿用 areaMatch 的 normalizeAreaName：
 * 「台灣民眾黨」與「臺灣民眾黨」兩種寫法在官方檔案裡都出現過，不正規化會平白
 * 製造一批對不到。
 */
function resolvePartyCode(
  partyName: string,
  partyCodeByNormalizedName: Map<string, string>,
  notes: string[],
  context: string,
): string {
  if (partyName === '無') return INDEPENDENT_PARTY_CODE;   // 補選檔以「無」表示無黨籍
  const code = partyCodeByNormalizedName.get(normalizeAreaName(partyName));
  if (code) return code;
  notes.push(`⚠ ${context}：政黨「${partyName}」對不到 2022 年的政黨代碼表，`
    + `標為未知政黨（代號 ${UNKNOWN_PARTY_CODE}）而非無黨籍——不猜測黨籍`);
  return UNKNOWN_PARTY_CODE;
}

// 補選與重行選舉的覆蓋。「現況」不等於「2022 當選名單」：嘉義市長延後重行選舉，
// 另有四場議員缺額補選。不套用這些修正，嘉義市會是空白，四個議員選區會顯示已離職者。
/**
 * 補選當選者的出生日期回填（僅縣市長）。
 *
 * 補選／重行選舉的 cand.csv 沒有出生日期欄，而連任限制以「姓名＋出生日期」認人，
 * 缺了它就只能回 unknown。嘉義市長黃敏惠 2018 當選、2022 重行選舉再度當選，
 * 連續兩屆、2026 不得再選，卻因此判不出來。
 *
 * **控制端原本提議「從 2022 年原始 elcand.csv 帶回出生日期」，但那個前提不成立**：
 * 嘉義市（10-020）根本不在 2022 C1 的 elcand/elbase 裡（C1 只有 21 個縣市，這正是
 * C1 當選數為 21 而非 22 的原因），沒有任何 2022 原始列可對。
 *
 * 唯一存在的來源是**上一屆（2018）同縣市同職務**的候選人名單。單靠姓名比對是本站
 * 明文禁止的（規格 §3.2「只有姓名相同者列報待查」），故這裡要求**三項佐證同時成立
 * 且結果唯一**才回填，比照本站判決認人的既有原則（不能只靠轄區，須職務／屆別佐證）：
 *   1. 同一縣市（縣市長是單一席次，不是複數席的議員）
 *   2. 同一職務（縣市長對縣市長）
 *   3. 政黨相同（補選檔有政黨名稱欄，可換算成代碼）
 * 且在該縣市上一屆的候選人中，符合「姓名＋政黨」者**恰好一位**。
 *
 * 任何一項不成立就不回填，讓 termLimited 回 unknown 並列報——寧可顯示「待查」，
 * 也不要用單純同名去斷定是同一個人。回填成功時一律列報，並在頁面的理由字串裡
 * 標明出生日期是回填來的，不讓這個推論隱形。
 */
const BACKFILL_NOTE = '（2022 為重行選舉，當選人出生日期由 2018 年原始檔以「姓名＋政黨＋同縣市同職務唯一相符」回填認定）';

function backfillBirthDate(
  win: { name: string; partyCode: string },
  countyCode: string,
  priorCands: Candidate[],
  notes: string[],
  context: string,
): string {
  const hits = priorCands.filter((c) => c.name === win.name
    && c.partyCode === win.partyCode
    && countyCodeOf(c.areaCode) === countyCode);
  if (hits.length !== 1) {
    notes.push(`⚠ ${context}：補選檔無出生日期，且 2018 年同縣市同職務同政黨的同名者有 ${hits.length} 位，`
      + '無法唯一認定是否同一人 → 連任狀態列為待查（不逕自認定）');
    return '';
  }
  notes.push(`ℹ ${context}：補選檔無出生日期，以「姓名＋政黨＋同縣市同職務唯一相符」`
    + `自 2018 年原始檔回填 ${hits[0].birthDate}，據以判定連任狀態`);
  return hits[0].birthDate;
}

function applyByElections(
  winners: Map<Office, Candidate[]>,
  areas: AreaNode[],
  parties: Map<string, string>,
  officials: any[],
  prior2018Chiefs: Candidate[],
  backfilled: Set<string>,
): string[] {
  const notes: string[] = [];
  const countyByName = new Map(areas.filter((a) => a.level === 'county').map((a) => [a.name, a.code]));
  const partyCodeByName = new Map([...parties.entries()]
    .map(([code, name]) => [normalizeAreaName(name), code]));

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

    const partyCode = resolvePartyCode(win.partyName, partyCodeByName, notes, `補選 ${name}`);

    const s = countyCode.split('-');
    let areaCode = countyCode;
    if (target.office === 'councilSeat') {
      areaCode = [s[0], s[1], String(target.districtNo).padStart(2, '0'), '000', '0000'].join('-');
    } else if (target.office === 'townChief') {
      const town = areas.find((a) => a.level === 'town'
        && countyCodeOf(a.code) === countyCode
        && normalizeAreaName(a.name) === normalizeAreaName(target.townName ?? ''));
      if (!town) { notes.push(`⚠ 補選的鄉鎮市對不到行政區樹：${name}（縣市 ${target.countyName}、鄉鎮市 ${target.townName}）`); continue; }
      areaCode = town.code;
    }

    const c: Candidate = {
      areaCode, number: 0, name: win.name, partyCode,
      sex: '1', birthDate: '', age: 0, education: '',
      incumbent: false, electedMark: '*', elected: true, electedBy: 'vote', pendingDraw: false,
    };

    const list = winners.get(target.office) ?? [];
    if (target.office === 'countyChief') {
      // 首長為單一席次：同縣市的既有紀錄整筆換掉
      c.birthDate = backfillBirthDate(c, countyCode, prior2018Chiefs, notes, `重行選舉 ${target.countyName}縣市長`);
      if (c.birthDate) backfilled.add(countyCode);
      winners.set('countyChief', [...list.filter((w) => countyCodeOf(w.areaCode) !== countyCode), c]);
      notes.push(`套用重行選舉：${target.countyName}縣市長 → ${win.name}`);
      continue;
    }

    if (target.office === 'townChief') {
      // 鄉鎮市長為單一席次：同鄉鎮市的既有紀錄整筆換掉
      winners.set('townChief', [...list.filter((w) => townCodeOf(w.areaCode) !== areaCode), c]);
      notes.push(`套用補選：${target.countyName}${target.townName}長 → ${win.name}`);
      continue;
    }

    // 議員缺額補選：先移除已離職者、再附加補選當選者。原始補選資料本身無從得知
    // 是哪一位離職，須從 officials.json 反推。
    if (list.some((w) => w.areaCode === areaCode && w.name === win.name)) {
      notes.push(`補選當選者已在名單中，略過附加：${target.countyName}第${target.districtNo}選舉區 → ${win.name}`);
      continue;
    }
    const districtStr = `${target.countyName}第${String(target.districtNo).padStart(2, '0')}選舉區`;
    const here = list.filter((w) => w.areaCode === areaCode);
    const hereNames = new Set(here.map((w) => w.name));

    // 訊號一（優先，最可靠）：officials.json 裡明確標記 isIncumbent:false 且
    // 附有 departedReason、姓名又確實出現在該選區 2022 當選名單裡的紀錄——這是
    // 有憑有據的「已離職」，不受名冊追蹤覆蓋率影響。
    //
    // 訊號二（退回用，較弱）：「2022 當選者中，姓名不在 officials.json 該選區
    // 現任名單者」的集合差集。這個訊號本身不可靠——全國 906 位 2022 議員當選者
    // 裡有 26 位在 officials.json 完全查無 councilor 紀錄（多數是轉任立委後
    // 未再標記），「查無紀錄」不等於「這次補選的離職者」。故只在訊號一找不到
    // 時才退回，且額外要求「officials.json 現任名單人數＝該選區 2022 當選人數」
    // 才動手——這個等式成立時，代表 officials.json 對這個選區的現任名冊是完整
    // 的（沒有查無紀錄的漏網之魚），集合差集才站得住腳；不成立就代表名冊在這個
    // 選區本身不完整，貿然刪除有刪錯還在任者的風險，寧可不刪、印警告列報。
    const explicitDeparted = officials.filter((o) => (
      o.officeType === 'councilor' && o.district === districtStr
      && o.isIncumbent === false && hereNames.has(o.name)
    ));

    let departed: Candidate[] = [];
    let method = '';
    if (explicitDeparted.length === 1) {
      departed = here.filter((w) => w.name === explicitDeparted[0].name);
      method = 'officials.json 明確標記離職';
    } else if (explicitDeparted.length === 0) {
      const currentNames = new Set(
        officials
          .filter((o) => o.officeType === 'councilor' && o.isIncumbent && o.district === districtStr)
          .map((o) => o.name),
      );
      const setDiff = here.filter((w) => !currentNames.has(w.name));
      if (currentNames.size === here.length && setDiff.length === 1) {
        departed = setDiff;
        method = '集合差集（已核對現任人數與2022當選人數相符）';
      }
    }
    // explicitDeparted.length >= 2：多筆明確離職紀錄同時命中同一選區，無法判斷
    // 這次補選對應哪一筆，departed 維持空陣列，落入下方的警告分支。

    if (departed.length === 1) {
      winners.set(target.office, [...list.filter((w) => w !== departed[0]), c]);
      notes.push(`套用缺額補選：${target.countyName}第${target.districtNo}選舉區 → 移除已離職的 ${departed[0].name}（判定依據：${method}），新增 ${win.name}`);
    } else {
      winners.set(target.office, [...list, c]);
      notes.push(`⚠ 缺額補選 ${target.countyName}第${target.districtNo}選舉區：無法可靠判定離職者`
        + `（明確離職紀錄 ${explicitDeparted.length} 筆），退回單純附加 → ${win.name}`
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
const pendingDraws = loadPendingDraws();
const chiefTowns = townsWithOffice(['D1', 'D2']);
const councilTowns = townsWithOffice(['R1', 'R2', 'R3']);
const officials = JSON.parse(read('src/data/officials.json')) as any[];
const chiefs2018 = load2018Chiefs();
/** 出生日期由上一屆回填的縣市（見 backfillBirthDate），用來在理由字串裡標明推論來源。 */
const backfilledBirthDates = new Set<string>();
for (const n of applyByElections(winners, areas, parties, officials, chiefs2018, backfilledBirthDates)) {
  console.log(' ', n);
}
const slugs = loadSlugs(officials);
const history = [
  ...toTermRecords(2018, chiefs2018),
  ...toTermRecords(2022, winners.get('countyChief') ?? []),
];

const countyNameOf = (code: string) => byCode.get(countyCodeOf(code))?.name ?? '';

/**
 * 把當選者轉成頁面用的 Officeholder。
 *
 * `isCountyChief` 同時控制兩件事，因為兩件事都只在縣市長那一層成立：
 *   連任限制判定——只有縣市長受地方制度法第 55、56 條限制。
 *   檔案頁 slug——站上只有縣市長（與議員、立委）有檔案頁，**沒有任何村里長或
 *   鄉鎮市長**。若對每一層都查「姓名/縣市」，同名的村里長就會被連到縣市議員的
 *   檔案頁去（見 loadSlugs 的說明）。
 */
function holder(c: Candidate | undefined, isCountyChief: boolean): Officeholder | null {
  if (!c) return null;
  const county = countyNameOf(c.areaCode);
  const o: Officeholder = {
    name: c.name,
    partyCode: c.partyCode,
    partyName: parties.get(c.partyCode) ?? `未知政黨（代號 ${c.partyCode}）`,
    slug: isCountyChief ? slugs.get(`${c.name}/${county}`) ?? null : null,
  };
  if (c.electedBy === 'quota') o.electedBy = 'quota';
  if (isCountyChief) {
    const countyCode = countyCodeOf(c.areaCode);
    const r = termLimited(c, history, countyCode, UPCOMING);
    o.termLimitStatus = r.status;
    o.termLimitReason = r.status === 'limited' && backfilledBirthDates.has(countyCode)
      ? r.reason + BACKFILL_NOTE
      : r.reason;
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

// 待抽籤席位（中選會註記 `?`）。村里長逐村；鄉鎮市民代表的選舉區須先上溯到鄉鎮市區。
const villagePendingDraw = pendingDraws.get('villageChief') ?? new Map<string, Candidate[]>();
const repPendingByTown = groupBy([...(pendingDraws.get('townRepSeat') ?? new Map()).values()].flat(), townCodeOf);

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
 *
 * 濾完後另外核對：keys 裡每個鍵是否都真的在 keptGeometries 裡找到了對應多邊形。
 * 目前這件事全靠 test/areaMatch.test.ts 的全量對應測試把關，但那是測試層級的
 * 保護，這支腳本本身在產出當下沒有二次核對——界線檔一旦更新內容（不是本次任務
 * 會發生，但沒人能保證下次資料更新時測試一定會先被想起來重跑），就可能悄悄
 * 漏畫一塊地圖而不會有任何錯誤或警告。故產出時同樣核對一次、對不到的印出來，
 * 不靜默吞掉（已知例外沿用 test 那份 KNOWN_MISSING_BOUNDARY_KEYS，兩邊必須是
 * 同一份清單，否則各自的容忍範圍會分歧）；最後由檔尾的總量防線改成非零退出。
 */
let missingBoundaryKeyCount = 0;
function subsetTopology(level: 'county' | 'town' | 'village', keys: Set<string>, context: string): unknown {
  const topo = boundaryTopo[level];
  const expanded = keys;
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

  const foundKeys = new Set(keptGeometries.map((g) => g.properties.key as string));
  const missing = [...expanded].filter((k) => !foundKeys.has(k) && !KNOWN_MISSING_BOUNDARY_KEYS.has(k));
  if (missing.length) {
    missingBoundaryKeyCount += missing.length;
    console.warn(`⚠ ${context}：界線檔找不到對應多邊形，共 ${missing.length} 筆：${missing.join('、')}`);
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

/**
 * 該行政區在該層級的「首長／議會是否為民選職務」。
 *
 * 這是制度事實，與本站有沒有資料無關（見 src/lib/mapTypes.ts 的 OfficeStatus）。
 * 縣市長與縣市議會一律民選；鄉鎮市區要看它有沒有那場選舉（直轄市與省轄市的一般
 * 區長官派、也沒有代表會）；村里長民選、村里沒有代表會。
 */
function officeStatusOf(a: AreaNode): { chiefOffice: OfficeStatus; councilOffice: OfficeStatus } {
  if (a.level === 'county') return { chiefOffice: 'elected', councilOffice: 'elected' };
  if (a.level === 'village') return { chiefOffice: 'elected', councilOffice: 'none' };
  return {
    chiefOffice: chiefTowns.has(a.code) ? 'elected' : 'appointed',
    councilOffice: councilTowns.has(a.code) ? 'elected' : 'none',
  };
}

function buildArea(
  a: AreaNode,
  chief: Candidate | undefined,
  seatWinners: Candidate[],
  childFile: string | null,
  pending: { chief?: Candidate[]; seats?: Candidate[] } = {},
): MapArea {
  const area: MapArea = {
    code: a.code,
    key: codeIndex.get(a.code) ?? a.code,
    name: a.name,
    chief: holder(chief, a.level === 'county'),
    seats: seatWinners.length ? seatBreakdown(seatWinners, parties) : [],
    childFile,
    ...officeStatusOf(a),
  };
  if (pending.chief?.length) area.chiefPendingDraw = { names: pending.chief.map((c) => c.name) };
  if (pending.seats?.length) area.seatsPendingDraw = { names: pending.seats.map((c) => c.name) };
  const quota = seatWinners.filter((c) => c.electedBy === 'quota').length;
  if (quota) area.quotaSeats = quota;
  return area;
}

mkdirSync(`${OUT}/county`, { recursive: true });
mkdirSync(`${OUT}/town`, { recursive: true });

// 全國層
const counties = areas.filter((a) => a.level === 'county');
const national: MapLayer = {
  level: 'national',
  parentName: '全國',
  topology: subsetTopology('county', new Set(counties.map((a) => codeIndex.get(a.code) ?? a.code)), '全國層'),
  areas: counties.map((a) => buildArea(a, chiefByCounty.get(a.code), councilByCounty.get(a.code) ?? [], `county/${a.code}.json`)),
};
writeFileSync(`${OUT}/national.json`, JSON.stringify(national));

// 縣市層：該縣市轄下的鄉鎮市區
for (const c of counties) {
  const towns = areas.filter((a) => a.level === 'town' && countyCodeOf(a.code) === c.code);
  const layer: MapLayer = {
    level: 'county',
    parentName: c.name,
    topology: subsetTopology('town', new Set(towns.map((a) => codeIndex.get(a.code) ?? a.code)), `縣市層：${c.name}`),
    areas: towns.map((a) => buildArea(a, chiefByTown.get(a.code), repByTown.get(a.code) ?? [], `town/${a.code}.json`,
      { seats: repPendingByTown.get(a.code) })),
  };
  writeFileSync(`${OUT}/county/${c.code}.json`, JSON.stringify(layer));
}

// 鄉鎮市區層：該鄉鎮市區轄下的村里。村里為最底層，childFile 為 null。
let unassignedTotal = 0;
for (const t of areas.filter((a) => a.level === 'town')) {
  const villages = areas.filter((a) => a.level === 'village' && townCodeOf(a.code) === t.code);
  const villageAreas = villages.map((a) => buildArea(a, chiefByVillage.get(a.code), [], null,
    { chief: villagePendingDraw.get(a.code) }));

  // 未編定村里：不在中選會的行政區樹裡，故不能用 buildArea（沒有 AreaNode 可用）。
  // 若略過，這些鄉鎮的村里層地圖會出現沒有任何說明的破洞；改輸出成中性、不可
  // 點擊的區塊（chief 為 null、seats 為空、childFile 為 null）——本站規格要求
  // 「資料深度必須看得出來」，有標示的空白區優於無說明的破洞。
  const townKey = codeIndex.get(t.code) ?? t.name;
  const unassignedPrefix = `${townKey}/${UNASSIGNED_VILLAGE_PREFIX}`;
  const unassignedKeys = allVillageKeys.filter((k) => k.startsWith(unassignedPrefix));
  const unassignedAreas: MapArea[] = unassignedKeys.map((key) => ({
    // code 帶「未編定:」前綴（UNASSIGNED_VILLAGE_PREFIX，與前端 isUnassignedVillage
    // 共用同一個常數）：這些區塊天生沒有中選會的五段代碼（不在行政區樹裡），若 code
    // 只留界線檔自帶的內部編號（如 "09007010S30"），會被誤認成中選會代碼，違反
    // 「區域代碼一律用中選會五段代碼」的全域約束。加前綴讓呼叫端一眼就看得出這是
    // 界線檔的例外編號，同時仍保有跨全國的唯一值可用來當多邊形的渲染 key。
    code: `${UNASSIGNED_VILLAGE_PREFIX}${key.slice(unassignedPrefix.length)}`,
    key,
    name: '未編定村里',
    chief: null,
    seats: [],
    childFile: null,
    // 制度上這塊地根本不屬於任何村里，沒有村里長也沒有代表會——不是本站漏收
    chiefOffice: 'none',
    councilOffice: 'none',
  }));
  unassignedTotal += unassignedAreas.length;

  const keys = new Set([...villages.map((a) => codeIndex.get(a.code) ?? a.code), ...unassignedKeys]);
  const layer: MapLayer = {
    level: 'town',
    parentName: t.name,
    topology: subsetTopology('village', keys, `鄉鎮市區層：${t.name}`),
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

// ─────────────────────────────────────────────────────────────────────────────
// 總量防線
//
// 這支腳本原本對應失敗只 console.warn 而不動 process.exitCode，CI 綠燈、警告淹沒
// 在 392 個檔案的輸出裡。本分支審查出的多項缺陷（婦女保障名額當選被當成落選、
// 代表會席次全部對不上、連江縣 21 個村長被覆蓋掉）都是這樣一路通關的——共同的
// 結構原因就是「沒有任何一道防線在數字對不上時讓建置失敗」。
//
// 以下數字是逐檔實測 2022 年原始 elcand.csv 得出的，不是抄文件：`*` 與 `!`（婦女
// 保障名額）皆計入當選，`?`（得票相同待抽籤）不計入當選、另外單獨斷言。
// ─────────────────────────────────────────────────────────────────────────────
const failures: string[] = [];
const check = (label: string, actual: number, expected: number) => {
  if (actual !== expected) failures.push(`${label}：實得 ${actual}，應為 ${expected}`);
};

check('縣市長當選人數（含嘉義市重行選舉）', (winners.get('countyChief') ?? []).length, 22);
check('縣市議員當選人數', (winners.get('councilSeat') ?? []).length, 910);
check('鄉鎮市長當選人數', (winners.get('townChief') ?? []).length, 204);
check('鄉鎮市民代表當選人數', (winners.get('townRepSeat') ?? []).length, 2138);
check('村里長當選人數', (winners.get('villageChief') ?? []).length, 7740);

// 待抽籤：8 個村里各 2 人（村長 1 席）、1 個鄉鎮市民代表選舉區 2 人
check('待抽籤的村里數', villagePendingDraw.size, 8);
check('待抽籤的鄉鎮市民代表選舉區數', (pendingDraws.get('townRepSeat') ?? new Map()).size, 1);

// 「每個村里都有結果」：7,740 位當選村長 ＋ 8 個待抽籤 ＝ 7,748 個村里，恰為
// 行政區樹裡的村里總數。這條等式同時盯住三件事：0A0x 選舉單位沒有混進村里層、
// 沒有村里被鍵碰撞覆蓋掉、待抽籤沒有被當成落選。
const villageCount = areas.filter((a) => a.level === 'village').length;
check('村里總數', villageCount, 7748);
check('有村長或待抽籤的村里數', (winners.get('villageChief') ?? []).length + villagePendingDraw.size, villageCount);
check('合併選舉單位（0A0x，非村里）', areas.filter((a) => a.level === 'electoralUnit').length, 8);

// 官派區：全國 164 個一般區沒有民選區長也沒有代表會；其餘 204 個鄉鎮市區兩者都有。
const townNodes = areas.filter((a) => a.level === 'town');
check('鄉鎮市區總數', townNodes.length, 368);
check('有民選首長的鄉鎮市區', townNodes.filter((a) => chiefTowns.has(a.code)).length, 204);
check('有代表會的鄉鎮市區', townNodes.filter((a) => councilTowns.has(a.code)).length, 204);
const missingChief = townNodes.filter((a) => chiefTowns.has(a.code) && !chiefByTown.has(a.code));
const missingSeats = townNodes.filter((a) => councilTowns.has(a.code) && !(repByTown.get(a.code) ?? []).length);
if (missingChief.length) failures.push(`有民選首長制度卻查無當選者的鄉鎮市區 ${missingChief.length} 個：${missingChief.slice(0, 5).map((a) => a.name).join('、')}…`);
if (missingSeats.length) failures.push(`有代表會制度卻查無席次的鄉鎮市區 ${missingSeats.length} 個：${missingSeats.slice(0, 5).map((a) => a.name).join('、')}…`);

// 22 縣市全部要有首長與議會席次
const countiesNoChief = counties.filter((a) => !chiefByCounty.has(a.code));
const countiesNoSeats = counties.filter((a) => !(councilByCounty.get(a.code) ?? []).length);
if (countiesNoChief.length) failures.push(`查無首長的縣市：${countiesNoChief.map((a) => a.name).join('、')}`);
if (countiesNoSeats.length) failures.push(`查無議會席次的縣市：${countiesNoSeats.map((a) => a.name).join('、')}`);

if (missingBoundaryKeyCount > 0) {
  failures.push(`${missingBoundaryKeyCount} 個中選會行政區在界線檔找不到對應多邊形（明細見上方逐層警告），這些地圖區塊會缺畫`);
} else {
  console.log('界線檔核對：所有中選會行政區都找到對應多邊形（已知例外除外）');
}

if (failures.length) {
  console.error('\n✗ 總量防線未通過，產出的數字與實測不符：');
  for (const f of failures) console.error(`  · ${f}`);
  process.exitCode = 1;
} else {
  console.log('總量防線：縣市長 22、縣市議員 910、鄉鎮市長 204、鄉鎮市民代表 2138、村里長 7740'
    + '（另有 8 個村里、1 個代表選舉區待抽籤）全部相符');
}
