import type { MapArea, RaceCandidate, RaceResult } from './mapTypes';

export type MarginArea = Pick<MapArea, 'code' | 'name' | 'chiefOffice' | 'race'>;
export interface MarginCounty extends MarginArea { towns: MarginArea[] }
export interface MarginDataset { year: number; counties: MarginCounty[] }
export type MarginResult =
  | { kind: 'missing' }
  | { kind: 'single'; candidates: RaceCandidate[]; validVotes: number }
  | { kind: 'tie' | 'contested'; candidates: RaceCandidate[]; validVotes: number; votes: number; points: number };

/** Historical race data only: the current chief can have changed after this election. */
export function electionMargin(race?: RaceResult): MarginResult {
  if (!race || !Number.isSafeInteger(race.validVotes) || race.validVotes <= 0 || !race.candidates.length
    || race.candidates.some(c => !Number.isSafeInteger(c.votes) || c.votes < 0)
    || race.candidates.reduce((sum, c) => sum + c.votes, 0) !== race.validVotes) return { kind: 'missing' };
  const candidates = [...race.candidates].sort((a, b) => b.votes - a.votes || a.number - b.number);
  const base = { candidates, validVotes: race.validVotes };
  if (candidates.length === 1) return { kind: 'single', ...base };
  const votes = candidates[0].votes - candidates[1].votes;
  return { kind: votes === 0 ? 'tie' : 'contested', ...base, votes, points: votes / race.validVotes * 100 };
}

export function selectMarginRace(county: MarginCounty, townCode: string) {
  const town = county.towns.find(t => t.code === townCode);
  const appointed = town?.chiefOffice === 'appointed';
  const area = appointed || !town ? county : town;
  return {
    area, appointed: !!appointed,
    place: area === county ? county.name : county.name + area.name,
    result: electionMargin(area.chiefOffice === 'elected' ? area.race : undefined),
  };
}
