import type { CandidateEntry, CandidateSource, CountyCandidates, NationalCandidates } from '../../src/lib/candidateTypes';

export interface VerifiedBallots {
  reviewedOn: string;
  certification: CandidateSource;
  excluded: { countyName: string; districtNo: number; name: string }[];
  postponement: { date: string; url: string; label: string };
  ballots: { countyName: string; districtNo: number | null; source: CandidateSource; namesByNumber: string[] }[];
}

/** 以縣市、選區與姓名精確對應；完整核對才換版，舊登記名冊重建也不會洗掉號次。 */
export function applyVerifiedBallots(national: NationalCandidates, counties: CountyCandidates[], verified: VerifiedBallots): void {
  // 新階段的正式名冊不能被這批較早的人工核對覆蓋。
  if (national.source.tableDate > verified.reviewedOn || ['numbered', 'announced'].includes(national.source.stage)) return;
  const latest = (s: CandidateSource) => s.tableDate <= verified.reviewedOn;
  for (const excluded of verified.excluded) {
    const county = counties.find(c => c.countyName === excluded.countyName);
    const district = county?.districts.find(d => d.no === excluded.districtNo);
    if (!county || !district) throw new Error(`審定排除名單找不到選區：${excluded.countyName}/${excluded.districtNo}`);
    if (!latest(county.source)) continue;
    district.candidates = district.candidates.filter(c => c.name !== excluded.name);
  }
  const pending = `因颱風延期至 ${verified.postponement.date} 抽籤；號次尚未收錄。`;
  if (national.source.stage === 'registration') national.source = { ...verified.certification };
  national.source.note = `金門已補號次；其餘縣市因颱風延期至 ${verified.postponement.date} 抽籤。`;
  for (const race of national.races) {
    if (!race.source || race.source.stage === 'registration') race.source = { ...verified.certification, note: pending };
  }
  for (const county of counties) {
    if (county.source.stage === 'registration') county.source = { ...verified.certification, note: pending };
  }
  const numberList = (list: CandidateEntry[], names: string[]): CandidateEntry[] => {
    if (new Set(names).size !== names.length || new Set(list.map(c => c.name)).size !== list.length
      || list.length !== names.length || names.some(name => !list.some(c => c.name === name))) {
      throw new Error('抽籤名單與審定候選人不一致，停止套用號次');
    }
    return names.map((name, index) => {
      const person = list.find(c => c.name === name)!;
      if (person.number !== null && person.number !== index + 1) throw new Error(`既有號次衝突：${name}`);
      return { ...person, number: index + 1 };
    });
  };
  for (const ballot of verified.ballots) {
    if (ballot.districtNo === null) {
      const race = national.races.find(r => r.countyName === ballot.countyName);
      if (!race) throw new Error(`找不到首長選舉：${ballot.countyName}`);
      if (!latest(race.source ?? national.source)) continue;
      race.candidates = numberList(race.candidates, ballot.namesByNumber);
      race.source = { ...ballot.source };
    } else {
      const county = counties.find(c => c.countyName === ballot.countyName);
      const district = county?.districts.find(d => d.no === ballot.districtNo);
      if (!county || !district) throw new Error(`找不到議員選區：${ballot.countyName}/${ballot.districtNo}`);
      if (!latest(county.source)) continue;
      district.candidates = numberList(district.candidates, ballot.namesByNumber);
      if (county.districts.every(d => d.candidates.every(c => c.number !== null))) county.source = { ...ballot.source };
    }
  }
}
