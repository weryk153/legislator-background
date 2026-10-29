import type { CandidateEntry, CandidateSource, CountyCandidates, NationalCandidates } from '../../src/lib/candidateTypes';

export interface VerifiedBallots {
  reviewedOn: string;
  certification: CandidateSource;
  excluded: { countyName: string; districtNo: number; name: string }[];
  reinstated?: { countyName: string; districtNo: number; candidate: CandidateEntry; source: CandidateSource }[];
  nameCorrections?: { countyName: string; districtNo: number; slug: string; previousName: string; name: string; sourceUrl: string }[];
  postponement: { date: string; url: string; label: string };
  ballots: { countyName: string; districtNo: number | null; source: CandidateSource; namesByNumber: string[] }[];
}

/** 以縣市、選區與姓名精確對應；完整核對才換版，舊登記名冊重建也不會洗掉號次。 */
export function applyVerifiedBallots(national: NationalCandidates, counties: CountyCandidates[], verified: VerifiedBallots): void {
  // 新階段的正式名冊不能被這批較早的人工核對覆蓋。
  if (national.source.tableDate > verified.reviewedOn || ['numbered', 'announced'].includes(national.source.stage)) return;
  const latest = (s: CandidateSource) => s.tableDate <= verified.reviewedOn;
  for (const correction of verified.nameCorrections ?? []) {
    const county = counties.find(c => c.countyName === correction.countyName);
    const district = county?.districts.find(d => d.no === correction.districtNo);
    if (!county || !district) throw new Error('姓名更正找不到選區');
    if (!latest(district.source ?? county.source)) continue;
    const person = district.candidates.find(c => c.slug === correction.slug);
    if (!person || ![correction.previousName, correction.name].includes(person.name)) throw new Error('姓名更正身分不一致');
    person.name = correction.name;
  }
  for (const restored of verified.reinstated ?? []) {
    const county = counties.find(c => c.countyName === restored.countyName);
    const district = county?.districts.find(d => d.no === restored.districtNo);
    if (!county || !district) throw new Error('恢復參選名單找不到選區');
    if (!latest(district.source ?? county.source)) continue;
    const person = district.candidates.find(c => c.slug === restored.candidate.slug || c.name === restored.candidate.name);
    if (person && (person.slug !== restored.candidate.slug || person.name !== restored.candidate.name)) throw new Error('恢復參選身分不一致');
    if (!person) district.candidates.push(structuredClone(restored.candidate));
  }
  for (const excluded of verified.excluded) {
    const county = counties.find(c => c.countyName === excluded.countyName);
    const district = county?.districts.find(d => d.no === excluded.districtNo);
    if (!county || !district) throw new Error(`審定排除名單找不到選區：${excluded.countyName}/${excluded.districtNo}`);
    if (!latest(county.source)) continue;
    district.candidates = district.candidates.filter(c => c.name !== excluded.name);
  }
  const pending = `抽籤因颱風改至 ${verified.postponement.date}；本站尚未收錄可核對的完整選區號次。`;
  if (national.source.stage === 'registration') national.source = { ...verified.certification };
  for (const race of national.races) {
    if (!race.source || race.source.stage === 'registration') race.source = { ...verified.certification, note: pending };
    else if (race.source.stage === 'certified' && latest(race.source)) race.source.note = pending;
  }
  for (const county of counties) {
    if (county.source.stage === 'registration') county.source = { ...verified.certification, note: pending };
    else if (county.source.stage === 'certified' && latest(county.source)) county.source.note = pending;
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
      if (!latest(district.source ?? county.source)) continue;
      district.candidates = numberList(district.candidates, ballot.namesByNumber);
      district.source = { ...ballot.source };
      if (county.districts.every(d => d.candidates.every(c => c.number !== null))) county.source = { ...ballot.source };
    }
  }
  const chiefs = national.races.filter(r => r.candidates.every(c => c.number !== null)).length;
  for (const county of counties) {
    if (county.source.stage !== 'certified' || !latest(county.source)) continue;
    const known = county.districts.filter(d => d.candidates.every(c => c.number !== null)).length;
    if (known) county.source.note = `已收錄 ${known}/${county.districts.length} 個議員選區的完整號次；來源見各選區，其餘號次待核實。`;
  }
  const districts = counties.flatMap(c => c.districts);
  const numbered = districts.filter(d => d.candidates.every(c => c.number !== null)).length;
  national.source.note = `已收錄 ${chiefs}/${national.races.length} 個首長選舉、${numbered}/${districts.length} 個議員選區的完整號次；各選區保留查證來源${numbered === districts.length && chiefs === national.races.length ? '，持續核對後續正式公告及修正。' : '，其他號次待核實。'}`;
}
