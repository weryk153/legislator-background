// 站上既有檔案頁的「2026 參選」標記。資料來自候選人建置輸出，不寫回 officials 資料庫——
// 名單會換版，標記跟著輸出走，不必另外同步。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chiefTitle, type CountyCandidates, type NationalCandidates, type FirstRunEvidence } from './candidateTypes';
import { countyByCode, countyByName } from './countyKeys';

export interface Candidacy {
  /** 參選職位：「臺北市長」「臺北市第1選舉區議員」。描述與結構化資料用這個組字。 */
  role: string;
  /** 頁首標記文字：「2026 參選：臺北市長」。 */
  label: string;
  /** 縣市選舉頁的 key（/elections/2026/<key>/）；對照表查無時為 null，標記就不加連結。 */
  countyKey: string | null;
  firstRun?: FirstRunEvidence;
  number?: number;
}

// 以代碼為準、縣市名備援：單元測試與舊版輸出的代碼可能是簡寫。
const keyOf = (code: string, name: string): string | null =>
  (countyByCode(code) ?? countyByName(name))?.key ?? null;

const entry = (role: string, countyKey: string | null, firstRun?: FirstRunEvidence, number: number | null = null): Candidacy =>
  ({ role, label: `2026 參選：${role}`, countyKey, ...(firstRun ? { firstRun } : {}), ...(number !== null ? { number } : {}) });

export function candidacyIndex(national: NationalCandidates | null, counties: CountyCandidates[]): Map<string, Candidacy> {
  const m = new Map<string, Candidacy>();
  for (const r of national?.races ?? []) {
    const key = keyOf(r.countyCode, r.countyName);
    for (const c of r.candidates) if (c.slug) m.set(c.slug, entry(chiefTitle(r.countyName), key, c.firstRun, c.number));
  }
  for (const co of counties) {
    const key = keyOf(co.countyCode, co.countyName);
    for (const d of co.districts) {
      for (const c of d.candidates) if (c.slug) m.set(c.slug, entry(`${co.countyName}${d.label}議員`, key, c.firstRun, c.number));
    }
  }
  return m;
}

let cache: Map<string, Candidacy> | null = null;

/** 每頁建置都會呼叫，讀檔只做一次。 */
export function loadCandidacies(): Map<string, Candidacy> {
  if (cache) return cache;
  const dir = join(process.cwd(), 'public', 'data', 'candidates', '2026');
  const national = existsSync(join(dir, 'national.json'))
    ? JSON.parse(readFileSync(join(dir, 'national.json'), 'utf8')) as NationalCandidates : null;
  const counties = existsSync(join(dir, 'county'))
    ? readdirSync(join(dir, 'county')).filter(f => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, 'county', f), 'utf8')) as CountyCandidates)
    : [];
  cache = candidacyIndex(national, counties);
  return cache;
}

/** 保留未通過審定者的登記歷史，供人物頁明確標示；不再加入現行候選人索引。 */
let excludedCache: Map<string, { name: string; sourceUrl: string }> | undefined;
export function excludedCandidacies(): Map<string, { name: string; sourceUrl: string }> {
  if (excludedCache) return excludedCache;
  const archive = JSON.parse(readFileSync(join(process.cwd(), 'scraper/candidate-registrations-2026-excluded.json'), 'utf8')) as {
    source: { url: string }; records: { candidate: { slug: string | null; name: string } }[];
  };
  return excludedCache = new Map(archive.records.filter(r => r.candidate.slug).map(r => [r.candidate.slug!, { name: r.candidate.name, sourceUrl: archive.source.url }]));
}
