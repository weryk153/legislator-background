// 2026 候選人名單建置。用法：pnpm run build:candidates -- --stage registration
// 名單換版時在 candidates-2026-sources.json 加一個階段、放好 PDF，再以新階段重跑；
// 產出前會與現有輸出比對並寫差異報告，人工看過才 commit。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pdfToBbox, parseRegistrationBbox } from './lib/candidatePdf';
import { mergeParties, partyCodeLookup } from './lib/cecParties';
import { buildDistrictRefs } from './lib/councilDistricts';
import { linkCandidate, identityLine, type LinkConfirmation, type OfficialRef } from './lib/candidateLinks';
import { assemble } from './lib/candidateAssemble';
import { flatten, diffCandidates, renderDiff } from './lib/candidateDiff';
import type { CandidateStage, CountyCandidates, NationalCandidates } from '../src/lib/candidateTypes';
import type { Officeholder } from '../src/lib/mapTypes';

const R22 = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉';
const OUT = 'public/data/candidates/2026';
const REPORT_DIR = 'scraper/out-roster/cec';
const read = (p: string) => readFileSync(p, 'utf8');

const stageArg = process.argv.indexOf('--stage');
const stage = (stageArg > 0 ? process.argv[stageArg + 1] : '') as CandidateStage;
const sources = JSON.parse(read('scraper/candidates-2026-sources.json'));
const cfg = sources[stage];
if (!cfg) throw new Error(`未知的階段「${stage}」；candidates-2026-sources.json 有：${Object.keys(sources).join('、')}`);

const parse = (f: string) => parseRegistrationBbox(pdfToBbox(join(cfg.dir, cfg.files[f])));
const chiefRows = [...parse('municipalMayor'), ...parse('countyMayor')];
const councilRows = [...parse('municipalCouncil'), ...parse('countyCouncil')];
console.log(`名冊：首長 ${chiefRows.length} 人、議員 ${councilRows.length} 人`);

const parties = mergeParties(['C1', 'T1', 'T2', 'T3'].flatMap((c) => ['city', 'prv'].map((s) => {
  const path = `${R22}/${c}/${s}/elpaty.csv`;
  return { path, csv: read(path) };
})));
const elbase = (c: string) => ['city', 'prv'].map((s) => read(`${R22}/${c}/${s}/elbase.csv`)).join('\n');
const districtRefs = buildDistrictRefs([
  { type: 'regional', elbaseCsv: elbase('T1') },
  { type: 'plainIndigenous', elbaseCsv: elbase('T2') },
  { type: 'mountainIndigenous', elbaseCsv: elbase('T3') },
]);

const officials = (JSON.parse(read('src/data/officials.json')) as OfficialRef[])
  .map(({ slug, name, officeType, district, isIncumbent }) => ({ slug, name, officeType, district, isIncumbent }));
const bySlug = new Map(officials.map((o) => [o.slug, o]));
const confirmed = JSON.parse(read('scraper/candidates-links-confirmed.json')) as LinkConfirmation[];

const nationalMap = JSON.parse(read('public/data/map/national.json')) as { areas: { code: string; name: string; chief: Officeholder | null }[] };

const { national, counties, review, warnings } = assemble({
  source: { stage, url: cfg.url, tableDate: cfg.tableDate },
  chiefRows, councilRows,
  countyOrder: nationalMap.areas.map((a) => ({
    code: a.code, name: a.name,
    // 只取對照需要的欄位；無 termLimit 資料時標 unknown，不憑空當成可連任
    chief: a.chief ? {
      name: a.chief.name, partyName: a.chief.partyName, partyCode: a.chief.partyCode, slug: a.chief.slug,
      termLimitStatus: a.chief.termLimitStatus ?? 'unknown', termLimitReason: a.chief.termLimitReason ?? '',
    } : null,
  })),
  partyCode: partyCodeLookup(parties),
  link: (name, race) => linkCandidate(name, race, officials, confirmed),
  identity: (slug) => identityLine(bySlug.get(slug)!),
  districtRefs,
});

// 差異報告：與現有輸出比對（首次產出時沒有前一版）
const prevNational = existsSync(`${OUT}/national.json`) ? JSON.parse(read(`${OUT}/national.json`)) as NationalCandidates : null;
const prevCounties = existsSync(`${OUT}/county`)
  ? readdirSync(`${OUT}/county`).map((f) => JSON.parse(read(`${OUT}/county/${f}`)) as CountyCandidates) : [];
const diff = diffCandidates(prevNational ? flatten(prevNational, prevCounties) : null, flatten(national, counties));
writeFileSync(`${REPORT_DIR}/candidates-2026-diff.md`, renderDiff(diff));

writeFileSync(`${REPORT_DIR}/candidates-2026-review.md`,
  `# 候選人連結審核清單（${stage}）\n\n共 ${review.length} 筆。確認後寫入 scraper/candidates-links-confirmed.json。\n\n`
  + review.map((r) => `- ${r.race}｜${r.name}｜${r.reason}｜站上同名：${r.candidates.join('、')}`).join('\n') + '\n');

mkdirSync(`${OUT}/county`, { recursive: true });
writeFileSync(`${OUT}/national.json`, JSON.stringify(national, null, 1));
for (const c of counties) writeFileSync(`${OUT}/county/${c.countyCode}.json`, JSON.stringify(c, null, 1));

const linked = [...national.races.flatMap((r) => r.candidates), ...counties.flatMap((c) => c.districts.flatMap((d) => d.candidates))]
  .filter((c) => c.slug).length;
console.log(`輸出：${national.races.length} 縣市首長選舉、${counties.length} 縣市議員名單；連到站上檔案 ${linked} 人；待審核 ${review.length} 筆`);
for (const w of warnings) console.log('⚠', w);
console.log(`差異報告：${REPORT_DIR}/candidates-2026-diff.md；審核清單：${REPORT_DIR}/candidates-2026-review.md`);
