// Build-only: content-addressed query files keep large arrays out of island props.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadOfficials } from './data';
import { toListRow } from './transform';
import { electionCandidates } from './electionFinder';
import type { NationalCandidates, CountyCandidates } from './candidateTypes';
export function clientDataset<T>(name: string, data: T) {
  const json = JSON.stringify(data);
  const version = createHash('sha256').update(json).digest('hex').slice(0, 16);
  return { name, version, data, json, url: `/data/query/${name}/${version}.json` };
}
export async function rosterDataset() {
  return clientDataset('roster', (await loadOfficials()).filter(o => o.officeType !== 'candidate').map(toListRow));
}
export function electionsDataset() {
  const dir = join(process.cwd(), 'public/data/candidates/2026');
  const national = JSON.parse(readFileSync(join(dir, 'national.json'), 'utf8')) as NationalCandidates;
  const councils = readdirSync(join(dir, 'county')).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, 'county', f), 'utf8')) as CountyCandidates);
  return clientDataset('elections', electionCandidates(national, councils));
}
