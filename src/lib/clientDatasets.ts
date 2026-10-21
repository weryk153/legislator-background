// Build-only: content-addressed query files keep large arrays out of island props.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadOfficials } from './data';
import { toListRow } from './transform';
import { electionCandidates, electionDistrictAreas } from './electionFinder';
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
  const townNames = new Map<string, string>();
  for (const council of councils) {
    const path = join(process.cwd(), 'public/data/map/county', `${council.countyCode}.json`);
    if (!existsSync(path)) continue;
    const map = JSON.parse(readFileSync(path, 'utf8')) as { areas: { code: string; name: string }[] };
    for (const area of map.areas) townNames.set(area.code, area.name);
  }
  return clientDataset('elections', {
    candidates: electionCandidates(national, councils),
    areas: electionDistrictAreas(councils, townNames),
  });
}

export async function marginsDataset() {
  const { loadMarginData } = await import("./electionMarginData");
  return clientDataset("margins", loadMarginData());
}

export async function connectionsDataset() {
  const { loadGraph } = await import('./loadGraph');
  const graph = loadGraph();
  // Text-only paths need identity and evidence, not photos or graph layout assets.
  return clientDataset('connections', {
    nodes: graph.nodes.map(({ key, name, kind, subtype, slug, party, officeType, description, wikipediaUrl }) =>
      ({ key, name, kind, subtype, slug, party, officeType, description, wikipediaUrl })),
    edges: graph.edges,
  });
}

export async function rankingsDataset() {
  const { buildRankingPeople } = await import('./rankings');
  const { loadGraph } = await import('./loadGraph');
  return clientDataset('rankings', buildRankingPeople(await loadOfficials(), loadGraph()));
}
