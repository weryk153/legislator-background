// 名冊稽核：中選會整批當選人名單 vs 站上現任名冊，產人工複核報告。**不寫 DB。**
//
// 資料來源與格式見 scraper/fixtures/cec-bulk-notes.md；稽核邏輯見
// docs/superpowers/specs/2026-07-23-roster-audit-design.md「稽核邏輯」「邊界」。
//
//   pnpm exec tsx scraper/roster-audit.ts
//
// 輸出 scraper/out-roster/audit-report.json：{missing, transferred, extra, near_miss}。
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { diffRoster, normalizeName, normalizeDistrict } from './lib/roster';
import type { CecWinner, OfficialRecord, OfficeType } from './lib/roster';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));
const CEC_ROOT = join(here, 'out-roster', 'cec');
const V2022 = join(CEC_ROOT, 'voteData', '2022-111年地方公職人員選舉');
const V2024 = join(CEC_ROOT, 'voteData', '2024總統立委');
const BYELECTION_ROOT = join(CEC_ROOT, '鄉鎮市長及議員補選(2023年後)');
const CHIAYI_REDO = join(CEC_ROOT, '2022年_嘉義市長重行選舉');

const adaptationNotes: string[] = [];

// ---------- CSV 讀取（支援 2024 檔案的引號欄位，處理 BOM/CRLF） ----------
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function loadCsv(path: string): string[][] {
  let raw = readFileSync(path, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // strip BOM
  return raw.split(/\r?\n/).filter((l) => l.length > 0).map(parseCsvLine);
}

// ---------- 政黨代號/名稱 → 站上慣用簡稱 ----------
// 站上 officials.party 用簡稱（如「國民黨」非「中國國民黨」）。未收錄者退回 CEC 原始名稱
// （寧可留原名讓人工核對，也不亂猜對應）。
const PARTY_CANON: Record<string, string> = {
  中國國民黨: '國民黨',
  民主進步黨: '民進黨',
  台灣民眾黨: '民眾黨',
  臺灣民眾黨: '民眾黨',
  無: '無黨籍',
  無黨籍及未經政黨推薦: '無黨籍及未經政黨推薦',
};
function canonParty(rawName: string): string {
  const t = (rawName || '').trim();
  return PARTY_CANON[t] ?? t;
}

// ---------- elbase / elpaty 共用載入 ----------
function loadElpatyMap(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of loadCsv(join(dir, 'elpaty.csv'))) map.set(row[0].trim(), row[1]?.trim() ?? '');
  return map;
}

type ElbaseMaps = { cityName: Map<string, string>; areaName: Map<string, string> };
function loadElbaseMaps(dir: string): ElbaseMaps {
  const cityName = new Map<string, string>();
  const areaName = new Map<string, string>();
  for (const row of loadCsv(join(dir, 'elbase.csv'))) {
    const [prv, city, area, dept, li, name] = row;
    if (dept !== '000' || li !== '0000') continue;
    if (area === '00') cityName.set(`${prv},${city}`, name);
    else areaName.set(`${prv},${city},${area}`, name);
  }
  return { cityName, areaName };
}

// 當選註記非僅 '*'：實查發現議員選舉尚有 '!'（婦女保障名額增額當選——4 筆全為性別=2，
// 且該選區站上現任人數與「*」+「!」加總完全吻合，如新竹縣第02選舉區 4*+1! ＝站上 5 席、
// 苗栗縣第05選舉區 7*+1! ＝站上 8 席）。筆記僅載明 '*'，此為實作時發現並在此記錄的落差。
const ELECTED_MARKS = new Set(['*', '!']);

// ---------- 2022 C1（首長）／T1,T2,T3（議員，含平地/山地原民）：標準 elcand.csv 版面 ----------
// 欄位：prv,city,area,dept,li,號次,姓名,政黨代號,性別,出生日期,年齡,出生地,學歷,現任註記,當選註記,副手註記
function loadElcandWinners(dir: string, office: OfficeType, election: string): CecWinner[] {
  const elcand = loadCsv(join(dir, 'elcand.csv'));
  const { cityName, areaName } = loadElbaseMaps(dir);
  const elpaty = loadElpatyMap(dir);
  const winners: CecWinner[] = [];
  for (const row of elcand) {
    if (!ELECTED_MARKS.has((row[14] ?? '').trim())) continue;
    const [prv, city, area] = row;
    const cityKey = `${prv},${city}`;
    const cityNm = cityName.get(cityKey);
    if (!cityNm) { adaptationNotes.push(`⚠ ${dir}: 查無城市名稱 (${cityKey})，略過候選人 ${row[6]}`); continue; }
    let district: string;
    if (office === 'mayor_magistrate') {
      district = cityNm;
    } else {
      const areaNm = areaName.get(`${prv},${city},${area}`);
      district = areaNm ? `${cityNm}${areaNm}` : cityNm;
    }
    const party = canonParty(elpaty.get((row[7] ?? '').trim()) ?? row[7]);
    winners.push({ office, name: (row[6] ?? '').trim(), district, party, election });
  }
  return winners;
}

// ---------- 2024 區域立委：district 需自行依單/多選區慣例組字串（見報告內 adaptations） ----------
function loadRegionalLegislators(): CecWinner[] {
  const dir = join(V2024, '區域立委');
  const elcand = loadCsv(join(dir, 'elcand.csv'));
  const elbase = loadCsv(join(dir, 'elbase.csv'));
  const elpaty = loadElpatyMap(dir);
  const cityName = new Map<string, string>();
  const areasByCity = new Map<string, Set<string>>();
  for (const row of elbase) {
    const [prv, city, area, dept, li, name] = row;
    if (dept !== '000' || li !== '0000') continue;
    const cityKey = `${prv},${city}`;
    if (area === '00') cityName.set(cityKey, name);
    else (areasByCity.get(cityKey) ?? areasByCity.set(cityKey, new Set()).get(cityKey)!).add(area);
  }
  const winners: CecWinner[] = [];
  for (const row of elcand) {
    if (!ELECTED_MARKS.has((row[14] ?? '').trim())) continue;
    const [prv, city, area] = row;
    const cityKey = `${prv},${city}`;
    const cityNm = cityName.get(cityKey);
    if (!cityNm) { adaptationNotes.push(`⚠ 區域立委: 查無城市名稱 (${cityKey})，略過候選人 ${row[6]}`); continue; }
    const areas = areasByCity.get(cityKey) ?? new Set();
    const district = areas.size <= 1 ? `${cityNm}選舉區` : `${cityNm}第${parseInt(area, 10)}選舉區`;
    const party = canonParty(elpaty.get((row[7] ?? '').trim()) ?? row[7]);
    winners.push({ office: 'legislator', name: (row[6] ?? '').trim(), district, party, election: '2024 立委(區域)' });
  }
  return winners;
}

// ---------- 2024 平地/山地立委：標準 elcand.csv 版面，district 為固定字串 ----------
function loadAtLargeLegislators(folder: '平地立委' | '山地立委', district: string): CecWinner[] {
  const dir = join(V2024, folder);
  const elcand = loadCsv(join(dir, 'elcand.csv'));
  const elpaty = loadElpatyMap(dir);
  const winners: CecWinner[] = [];
  for (const row of elcand) {
    if (!ELECTED_MARKS.has((row[14] ?? '').trim())) continue;
    const party = canonParty(elpaty.get((row[7] ?? '').trim()) ?? row[7]);
    winners.push({ office: 'legislator', name: (row[6] ?? '').trim(), district, party, election: `2024 立委(${folder === '平地立委' ? '平地原住民' : '山地原住民'})` });
  }
  return winners;
}

// ---------- 2024 不分區立委：候選人記錄在 elcand.csv 的是「政黨」本身，實際上任名單在 elrepm.csv ----------
// 欄位：政黨代號,名次,姓名,性別,出生日期,年齡,出生地,學歷,現任註記,當選註記
function loadPartyListLegislators(): CecWinner[] {
  const dir = join(V2024, '不分區政黨');
  const elrepm = loadCsv(join(dir, 'elrepm.csv'));
  const elpaty = loadElpatyMap(dir);
  const winners: CecWinner[] = [];
  for (const row of elrepm) {
    if ((row[9] ?? '').trim() !== '*') continue;
    const party = canonParty(elpaty.get((row[0] ?? '').trim()) ?? row[0]);
    winners.push({ office: 'legislator', name: (row[2] ?? '').trim(), district: '全國不分區及僑居國外國民', party, election: '2024 立委(不分區)' });
  }
  return winners;
}

// ---------- 補選/重行選舉：cand.csv/prof.csv 版面與 elcand 完全不同（見下方 adaptationNotes） ----------
// cand.csv 欄位：號次,名字,政黨名稱（無當選註記！）
// prof.csv 欄位：行政區別,村里別,投開票所別,號次1..號次N,有效票數A,...（逐投開票所得票，需自行加總取最高票判定當選）
type ByElectionWinner = { name: string; party: string };
function determineByElectionWinner(dir: string): ByElectionWinner {
  const candRows = loadCsv(join(dir, 'cand.csv')).slice(1); // skip header
  const profRows = loadCsv(join(dir, 'prof.csv')).slice(1);
  const n = candRows.length;
  const sums = new Array(n).fill(0);
  for (const row of profRows) {
    for (let i = 0; i < n; i++) {
      const raw = (row[3 + i] ?? '0').replace(/,/g, '').replace(/"/g, '').trim();
      sums[i] += Number(raw) || 0;
    }
  }
  let winnerIdx = 0;
  for (let i = 1; i < n; i++) if (sums[i] > sums[winnerIdx]) winnerIdx = i;
  const winnerRow = candRows[winnerIdx];
  return { name: (winnerRow[1] ?? '').trim(), party: canonParty(winnerRow[2] ?? '') };
}

function parseCouncilorByElectionFolder(folderName: string): { city: string; districtNum: number } | null {
  const m = folderName.match(/^\d{4}(.+?)議會第\d+屆議員第(\d+)選舉區缺額補選$/u);
  if (!m) return null;
  return { city: m[1], districtNum: Number(m[2]) };
}

// ---------- 主流程 ----------
async function main() {
  adaptationNotes.push(
    '補選資料夾（缺額補選/重行選舉）cand.csv 只有「號次,名字,政黨名稱」三欄、無當選註記；' +
      'prof.csv 是逐投開票所得票明細（無候選人層級加總、無當選欄）。已改用 prof.csv 逐所得票加總取最高票，' +
      '交叉比對 cand.csv 號次判定當選人與政黨（原設計文件筆記假設欄位同 elcand，實際不同，已於此文件與程式碼記錄）。',
  );
  adaptationNotes.push(
    '2022 議員(T1) elcand.csv 當選註記除筆記載明的「*」外，另有「!」共 4 筆——經查全為性別=2（女性）' +
      '且該選區站上現任人數＝「*」+「!」加總（如新竹縣第02選舉區 4*+1!＝站上 5 席），研判為婦女保障名額' +
      '增額當選，已一併視為當選處理，避免誤把她們的席次判定為 missing、把同選區真正的「*」當選人誤配為 near_miss。',
  );
  adaptationNotes.push(
    '2024 不分區政黨 elrepm.csv 當選註記除「*」外另見「!」(1筆,陳培瑜) 與「-」(1筆,王正旭)，意義不明' +
      '（推測為列名遞補／中途遞補上任，非首次就職名單）。筆記已預警「就任後辭職/遞補不反映在此檔」，' +
      '本次僅採計「*」為首次就職名單，故 missing/extra 中不分區立委的殘餘落差多屬任期中列名遞補，' +
      '非資料錯誤，人工複核時可對照該黨遞補公告確認。',
  );

  const winners: CecWinner[] = [];

  // 2022 縣市長/直轄市長（C1）
  winners.push(...loadElcandWinners(join(V2022, 'C1', 'prv'), 'mayor_magistrate', '2022 縣市長/直轄市長'));
  winners.push(...loadElcandWinners(join(V2022, 'C1', 'city'), 'mayor_magistrate', '2022 縣市長/直轄市長'));

  // 2022 議員：T1 區域、T2 平地原民、T3 山地原民（prv 直轄市 + city 縣轄市）
  const t1: CecWinner[] = [
    ...loadElcandWinners(join(V2022, 'T1', 'prv'), 'councilor', '2022 議員(區域)'),
    ...loadElcandWinners(join(V2022, 'T1', 'city'), 'councilor', '2022 議員(區域)'),
  ];
  winners.push(...t1);
  winners.push(...loadElcandWinners(join(V2022, 'T2', 'prv'), 'councilor', '2022 議員(平地原住民)'));
  winners.push(...loadElcandWinners(join(V2022, 'T2', 'city'), 'councilor', '2022 議員(平地原住民)'));
  winners.push(...loadElcandWinners(join(V2022, 'T3', 'prv'), 'councilor', '2022 議員(山地原住民)'));
  winners.push(...loadElcandWinners(join(V2022, 'T3', 'city'), 'councilor', '2022 議員(山地原住民)'));

  // 2024 立委：區域、平地原民、山地原民、不分區
  winners.push(...loadRegionalLegislators());
  winners.push(...loadAtLargeLegislators('平地立委', '平地原住民選舉區'));
  winners.push(...loadAtLargeLegislators('山地立委', '山地原住民選舉區'));
  winners.push(...loadPartyListLegislators());

  // 嘉義市長重行選舉（2022 年 C1 原始檔對嘉義市完全無資料——原選舉因驗票爭議作廢，
  // 重行選舉才是嘉義市長唯一有效當選結果，非「取代」關係，直接併入）
  const chiayiWinner = determineByElectionWinner(CHIAYI_REDO);
  winners.push({ office: 'mayor_magistrate', name: chiayiWinner.name, district: '嘉義市', party: chiayiWinner.party, election: '2022 嘉義市長重行選舉' });

  // 議員缺額補選（4 場）：補選當選人取代該選區 2022 原當選人為現任
  type Supersession = { office: OfficeType; normDistrict: string; replacedName: string; byWinner: string; election: string };
  const supersessions: Supersession[] = [];

  if (!existsSync(BYELECTION_ROOT)) {
    adaptationNotes.push(`⚠ 找不到補選資料夾 ${BYELECTION_ROOT}`);
  } else {
    const fs = await import('node:fs');
    for (const folderName of fs.readdirSync(BYELECTION_ROOT)) {
      const parsed = parseCouncilorByElectionFolder(folderName);
      if (!parsed) { adaptationNotes.push(`⚠ 補選資料夾名稱未能解析選區：${folderName}`); continue; }
      const dir = join(BYELECTION_ROOT, folderName);
      const byWinner = determineByElectionWinner(dir);
      const district = `${parsed.city}第${String(parsed.districtNum).padStart(2, '0')}選舉區`;
      const normDistrict = normalizeDistrict(district);

      // 找出並移除該選區 2022 原當選人（由補選當選人取代為現任）
      const origIdx = winners.findIndex(
        (w) => w.office === 'councilor' && normalizeDistrict(w.district) === normDistrict,
      );
      if (origIdx >= 0) {
        const orig = winners[origIdx];
        winners.splice(origIdx, 1);
        supersessions.push({ office: 'councilor', normDistrict, replacedName: orig.name, byWinner: byWinner.name, election: folderName });
      } else {
        adaptationNotes.push(`⚠ 補選 ${folderName}：查無對應 2022 原當選人（選區 ${district}），未執行取代`);
      }

      winners.push({ office: 'councilor', name: byWinner.name, district, party: byWinner.party, election: folderName });
    }
  }

  // ---------- 站上現任名冊（paginate） ----------
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const sb = createClient(url, key);

  const officials: OfficialRecord[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from('officials')
      .select('id,name,office_type,district,party,is_incumbent')
      .eq('is_incumbent', true)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`officials query failed: ${error.message}`);
    const page = (data ?? []) as OfficialRecord[];
    officials.push(...page);
    if (page.length < pageSize) break;
  }

  // ---------- 稽核 ----------
  const result = diffRoster(winners, officials);

  // departed_candidate 註記：extra 中若剛好是被補選取代的原任者，附上取代說明
  for (const e of result.extra) {
    const key = `${e.official.office_type}|${normalizeDistrict(e.official.district)}`;
    const hit = supersessions.find((s) => `${s.office}|${s.normDistrict}` === key && normalizeName(s.replacedName) === normalizeName(e.official.name));
    if (hit) {
      e.note = `departed_candidate：此選區已由補選當選人「${hit.byWinner}」取代為現任（${hit.election}）。站上仍列原 2022 當選人「${e.official.name}」，需查證是否已解職／尚未更新名冊。`;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      cecWinners: winners.length,
      officialsIncumbent: officials.length,
      missing: result.missing.length,
      transferred: result.transferred.length,
      extra: result.extra.length,
      near_miss: result.near_miss.length,
    },
    adaptationNotes,
    supersessions,
    missing: result.missing,
    transferred: result.transferred,
    extra: result.extra,
    near_miss: result.near_miss,
  };

  const outPath = join(here, 'out-roster', 'audit-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  // ---------- console 摘要 ----------
  console.log('=== 名冊稽核摘要 ===');
  console.log(`CEC 當選人（併補選取代後）：${winners.length}　站上現任：${officials.length}`);
  console.table({
    missing: result.missing.length,
    transferred: result.transferred.length,
    extra: result.extra.length,
    near_miss: result.near_miss.length,
  });

  const byOffice = (rows: { office?: OfficeType; official?: OfficialRecord }[], get: (r: any) => OfficeType) => {
    const m = new Map<string, number>();
    for (const r of rows) { const o = get(r); m.set(o, (m.get(o) ?? 0) + 1); }
    return Object.fromEntries(m);
  };
  console.log('missing by office:', byOffice(result.missing as any[], (r) => r.cec.office));
  console.log('transferred by (cec.office → foundAs.office_type):');
  for (const t of result.transferred) console.log(`  ${t.cec.name}: ${t.cec.office}(${t.cec.district}) → ${t.foundAs.office_type}`);
  console.log('extra by office:', byOffice(result.extra as any[], (r) => r.official.office_type));

  console.log(`\n報告寫入 ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
