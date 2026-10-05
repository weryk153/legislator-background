// 站上既有檔案頁的「2026 參選」標記。資料來自候選人建置輸出，不寫回 officials 資料庫——
// 名單會換版，標記跟著輸出走，不必另外同步。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chiefTitle, type CountyCandidates, type NationalCandidates } from './candidateTypes';

export function candidacyIndex(national: NationalCandidates | null, counties: CountyCandidates[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of national?.races ?? []) {
    for (const c of r.candidates) if (c.slug) m.set(c.slug, `2026 參選：${chiefTitle(r.countyName)}`);
  }
  for (const co of counties) {
    for (const d of co.districts) {
      for (const c of d.candidates) if (c.slug) m.set(c.slug, `2026 參選：${co.countyName}${d.label}議員`);
    }
  }
  return m;
}

let cache: Map<string, string> | null = null;

/** 每頁建置都會呼叫，讀檔只做一次。 */
export function loadCandidacies(): Map<string, string> {
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
