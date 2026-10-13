import { expect, it } from 'vitest';
import { clientDataset, rosterDataset, electionsDataset, connectionsDataset } from '../src/lib/clientDatasets';
import { loadOfficials } from '../src/lib/data';
import { toListRow } from '../src/lib/transform';
import { filterElectionCandidates } from '../src/lib/electionFinder';
it('data changes get a new URL while the same snapshot stays cacheable', () => {
  const first = clientDataset('roster', [{ name: '甲' }]);
  expect(clientDataset('roster', [{ name: '甲' }]).url).toBe(first.url);
  expect(clientDataset('roster', [{ name: '乙' }]).url).not.toBe(first.url);
  expect(JSON.parse(first.json)).toEqual(first.data);
});
it('roster endpoint preserves every non-candidate row', async () => {
  const dataset = await rosterDataset();
  expect(dataset.data).toEqual((await loadOfficials()).filter(o => o.officeType !== 'candidate').map(toListRow));
});
it('deferred elections lookup includes council and chief names with the same filtering', () => {
  const { data } = electionsDataset();
  expect(new Set(data.candidates.map(c => c.countyCode)).size).toBe(22);
  expect(data.candidates.some(c => c.office === 'council')).toBe(true);
  expect(filterElectionCandidates(data.candidates, { county: '', office: 'chief', query: '蔣萬安' })).toHaveLength(1);
  expect(data.areas[JSON.stringify(['63-000-00-000-0000', 'council', '第1選舉區'])].towns).toEqual(['士林區', '北投區']);
  expect(Object.keys(data.areas)).toHaveLength(new Set(data.candidates.filter(c => c.office === 'council').map(c => JSON.stringify([c.countyCode, c.office, c.district]))).size);
});

it('connection payload preserves identities and original evidence without graph images', async () => {
  const { loadGraph } = await import('../src/lib/loadGraph');
  const graph = loadGraph(), dataset = await connectionsDataset();
  expect(dataset.data.nodes.map(n => n.key)).toEqual(graph.nodes.map(n => n.key));
  expect(dataset.data.edges).toEqual(graph.edges);
  expect(dataset.json).not.toMatch(/"photo(Url|Credit|SourceUrl)"/);
});
