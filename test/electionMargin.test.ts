import { describe, expect, it } from 'vitest';
import { electionMargin, selectMarginRace, type MarginCounty } from '../src/lib/electionMargin';
import { loadMarginData } from '../src/lib/electionMarginData';
import type { RaceResult } from '../src/lib/mapTypes';

const race = (votes: number[]): RaceResult => ({
  validVotes: votes.reduce((a, b) => a + b, 0), electorate: 1000, turnout: 75,
  candidates: votes.map((v, i) => ({ number: i + 1, name: `候選人${i}`, votes: v, share: 0, partyCode: '999', partyName: '無黨籍', elected: false })),
});

describe('historical chief-election margin', () => {
  it('uses all valid votes as the denominator, sorts without mutating, and ignores rounded source shares', () => {
    const r = race([20, 50, 30]);
    const result = electionMargin(r);
    expect(result).toMatchObject({ kind: 'contested', votes: 20, points: 20, validVotes: 100 });
    expect(r.candidates.map(c => c.votes)).toEqual([20, 50, 30]);
  });
  it('distinguishes no opponent, a tie, and missing data', () => {
    expect(electionMargin(race([100]))).toMatchObject({ kind: 'single' });
    expect(electionMargin(race([50, 50]))).toMatchObject({ kind: 'tie', votes: 0, points: 0 });
    for (const r of [undefined, race([]), race([0, 0]), race([-1, 101]), race([0.5, 99.5]), { ...race([60, 40]), validVotes: 120 }]) {
      expect(electionMargin(r)).toEqual({ kind: 'missing' });
    }
  });
  it('only falls back to the county race for an appointed district', () => {
    const county: MarginCounty = { code: 'c', name: '測試市', chiefOffice: 'elected', race: race([60, 40]), towns: [
      { code: 'appointed', name: '一般區', chiefOffice: 'appointed' },
      { code: 'elected', name: '民選區', chiefOffice: 'elected', race: race([51, 49]) },
      { code: 'missing', name: '缺資料區', chiefOffice: 'elected' },
    ] };
    expect(selectMarginRace(county, 'appointed')).toMatchObject({ appointed: true, place: '測試市', result: { votes: 20 } });
    expect(selectMarginRace(county, 'elected')).toMatchObject({ appointed: false, place: '測試市民選區', result: { votes: 2 } });
    expect(selectMarginRace(county, 'missing').result).toEqual({ kind: 'missing' });
  });
  it('preserves all published 22 counties and 368 towns without shipping map geometry', () => {
    const data = loadMarginData();
    expect(data.year).toBe(2022);
    expect(data.counties).toHaveLength(22);
    const towns = data.counties.flatMap(c => c.towns);
    expect(towns).toHaveLength(368);
    const races = [...data.counties, ...towns.filter(t => t.chiefOffice === 'elected')];
    expect(races).toHaveLength(226);
    expect(races.every(a => electionMargin(a.race).kind !== 'missing')).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/"(topology|chief|seats)"/);
    const lienchiang = data.counties.find(c => c.name === '連江縣')!;
    const beigan = lienchiang.towns.find(t => t.name === '北竿鄉')!;
    expect(selectMarginRace(lienchiang, beigan.code).result).toMatchObject({ kind: 'contested', votes: 13 });
    const hsinchu = data.counties.find(c => c.name === '新竹市')!;
    expect(electionMargin(hsinchu.race)).toMatchObject({ kind: 'contested', votes: 20357 });
  });
});
