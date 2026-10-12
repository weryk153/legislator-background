import { expect, it } from 'vitest';
import { clientDataset, rosterDataset, electionsDataset } from '../src/lib/clientDatasets';
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
  expect(new Set(data.map(c => c.countyCode)).size).toBe(22);
  expect(data.some(c => c.office === 'council')).toBe(true);
  expect(filterElectionCandidates(data, { county: '', office: 'chief', query: '蔣萬安' })).toHaveLength(1);
});
