// 唯讀盤點；以 JSON 輸出各縣市缺漏名單，方便下一批逐人查證。
import { readFileSync } from 'node:fs';
import type { NationalCandidates, CountyCandidates } from '../src/lib/candidateTypes';
const national = JSON.parse(readFileSync('public/data/candidates/2026/national.json', 'utf8')) as NationalCandidates;
const counties = national.races.map(r => {
  const c = JSON.parse(readFileSync(`public/data/candidates/2026/county/${r.countyCode}.json`, 'utf8')) as CountyCandidates;
  const entries = [...r.candidates.map(x => ({ ...x, race: r.countyName, office: 'chief' })), ...c.districts.flatMap(d => d.candidates.map(x => ({ ...x, race: c.countyName + d.label, office: 'council' })))];
  const missing = entries.filter(x => !x.slug);
  return { county: r.countyName, total: entries.length, linked: entries.length - missing.length, missing: missing.length, candidates: missing };
});
console.log(JSON.stringify({ tableDate: national.source.tableDate, total: counties.reduce((n, c) => n + c.total, 0), linked: counties.reduce((n, c) => n + c.linked, 0), missing: counties.reduce((n, c) => n + c.missing, 0), counties }, null, 2));
