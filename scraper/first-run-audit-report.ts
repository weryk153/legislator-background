// 每次人工查證後執行；--write 將確認結果輸出給候選人建置流程。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import type { FirstRunConfirmation } from './lib/candidateFirstRun';
import { applyFirstRuns } from './lib/candidateFirstRun';
import type { NationalCandidates, CountyCandidates } from '../src/lib/candidateTypes';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const audit = read('scraper/candidate-first-run-audit.json');
const dir = 'public/data/candidates/2026';
const national = read(`${dir}/national.json`) as NationalCandidates;
const counties = readdirSync(`${dir}/county`).filter(f => f.endsWith('.json')).map(f => read(`${dir}/county/${f}`)) as CountyCandidates[];
const roster = [
  ...national.races.flatMap(r => r.candidates.map(c => ({ ...c, county: r.countyName, race: r.countyName }))),
  ...counties.flatMap(c => c.districts.flatMap(d => d.candidates.map(p => ({ ...p, county: c.countyName, race: c.countyName + d.label })))),
];
const seen = new Set<string>();
const confirmations: FirstRunConfirmation[] = [];
const totals = { 'first-run': 0, 'previously-ran': 0, unresolved: 0 };
const summary = national.races.map(r => ({ county: r.countyName, total: 0, 'first-run': 0, 'previously-ran': 0, unresolved: 0 }));
for (const record of audit.records) {
  const match = roster.filter(p => p.slug === record.slug);
  if (seen.has(record.slug) || match.length !== 1 || match[0].name !== record.name || match[0].race !== record.race || match[0].county !== record.county) throw new Error(`查核身分或選區不符：${record.slug}`);
  seen.add(record.slug);
  if (record.year !== 2026 || record.scope !== 'public-office' || !/^\d{4}-\d{2}-\d{2}$/.test(record.reviewedOn) || !Object.hasOwn(totals, record.status)) throw new Error(`查核尚未完成或範圍錯誤：${record.slug}`);
  if (record.status === 'unresolved') {
    if (!record.reason?.trim() || !record.searches?.length) throw new Error(`未確認者缺查核紀錄：${record.slug}`);
  } else if (!record.evidence?.length || record.evidence.some((e: { url: string; title: string; basis: string }) => !/^https?:\/\//.test(e.url) || !e.title?.trim() || !e.basis?.trim())) {
    throw new Error(`確認結果缺證據：${record.slug}`);
  }
  const status = record.status as keyof typeof totals;
  totals[status]++;
  const county = summary.find(c => c.county === record.county)!;
  county.total++;
  county[status]++;
  if (status === 'first-run') {
    const { basis, ...source } = record.evidence[0];
    confirmations.push({ slug: record.slug, name: record.name, race: record.race, year: 2026, scope: 'public-office', source, basis, reviewedOn: record.reviewedOn });
  }
}
if (seen.size !== roster.length) throw new Error('查核名冊未涵蓋全國候選人');
applyFirstRuns(national, counties, confirmations, 2026);
if (process.argv.includes('--write')) writeFileSync('scraper/candidate-first-runs-confirmed.json', JSON.stringify(confirmations, null, 2) + '\n');
console.log(JSON.stringify({ reviewedOn: audit.reviewedOn, rosterDate: audit.rosterSource.tableDate, total: seen.size, ...totals, counties: summary }, null, 2));
