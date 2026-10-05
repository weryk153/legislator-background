import { describe, it, expect } from 'vitest';
import {
  candidateOverview, isChiefReelect, orderCandidates, partyColorVar, partyLabel, partyTally, recordCounts,
} from '../src/lib/candidateStats';
import type { CandidateEntry, ChiefRace, CountyCandidates, NationalCandidates } from '../src/lib/candidateTypes';

const c = (name: string, o: Partial<CandidateEntry> = {}): CandidateEntry => ({
  name, partyName: '無', partyCode: '999', number: null, registeredOn: '2026-09-02', slug: null, identity: null, ...o,
});
const KMT = { partyName: '中國國民黨', partyCode: '1' };
const DPP = { partyName: '民主進步黨', partyCode: '16' };
const src = { stage: 'registration' as const, url: '', tableDate: '' };
const inc = (slug: string, termLimitStatus: 'limited' | 'notLimited' | 'unknown') =>
  ({ name: '某', partyName: '中國國民黨', partyCode: '1', slug, termLimitStatus, termLimitReason: '' });

const taipei: ChiefRace = {
  countyCode: '63', countyName: '臺北市', isMunicipality: true, incumbent2022: inc('mayor-taipei', 'notLimited'),
  candidates: [c('甲', { ...KMT, slug: 'mayor-taipei' }), c('乙', { ...DPP, slug: 'yi' }), c('丙')],
};
const newTaipei: ChiefRace = {
  countyCode: '65', countyName: '新北市', isMunicipality: true, incumbent2022: inc('mayor-new-taipei', 'limited'),
  candidates: [c('丁', { ...KMT, slug: 'ding' })],
};
const keelung: ChiefRace = {
  countyCode: '10', countyName: '基隆市', isMunicipality: false, incumbent2022: null,
  candidates: [c('戊', { partyName: '新黨甲', partyCode: null })],
};
const national: NationalCandidates = { source: src, races: [taipei, newTaipei, keelung] };
const council: CountyCandidates = {
  source: src, countyCode: '63', countyName: '臺北市', townToDistrict: null, splitTowns: [], mappingNote: null,
  districts: [
    { no: 1, label: '第1選舉區', type: 'regional', candidates: [c('子', { identity: '現任議員（臺北市第1選舉區）' }), c('丑')] },
    { no: 2, label: '第2選舉區', type: 'regional', candidates: [c('寅', { identity: '前任議員' }), c('卯', { identity: '現任議員' })] },
  ],
};

describe('參選概況', () => {
  it('人數、爭取連任、不得連任縣市', () => {
    expect(candidateOverview(national, [council])).toEqual({
      chiefCount: 5, councilCount: 4, chiefReelect: 1, councilReelect: 2, termLimited: ['新北市'],
    });
  });

  it('爭取連任須 slug 與 2022 當選者相同；沒有 slug 不算', () => {
    expect(isChiefReelect(taipei.candidates[0], taipei)).toBe(true);
    expect(isChiefReelect(taipei.candidates[1], taipei)).toBe(false);
    expect(isChiefReelect(c('x'), { ...taipei, incumbent2022: { ...inc('', 'notLimited'), slug: null } })).toBe(false);
  });
});

describe('各黨提名人數', () => {
  it('依人數排序；無黨籍單獨一條；主要政黨以外一律併成「其他政黨」並固定排最後', () => {
    const bars = partyTally([
      c('a', KMT), c('b', KMT), c('c', DPP), c('d'), c('e'), c('f'),
      c('g', { partyName: '新黨甲', partyCode: null }), c('h', { partyName: '新黨乙', partyCode: null }),
      c('i', { partyName: '新黨乙', partyCode: null }), c('j', { partyName: '勞動黨', partyCode: '15' }),
    ]);
    expect(bars.map((b) => [b.label, b.count, b.cssVar])).toEqual([
      ['無黨籍', 3, '--party-none'],
      ['中國國民黨', 2, '--party-kmt'],
      ['民主進步黨', 1, '--party-dpp'],
      ['其他政黨', 4, '--party-other'],
    ]);
    expect(bars[3].parties).toEqual([{ name: '新黨乙', count: 2 }, { name: '勞動黨', count: 1 }, { name: '新黨甲', count: 1 }]);
  });

  it('只有主要政黨時沒有其他政黨這一條', () => {
    expect(partyTally([c('a', KMT)]).map((b) => b.key)).toEqual(['1']);
  });
});

describe('排序與筆數', () => {
  it('全部有號次才依號次，否則維持名冊順序', () => {
    expect(orderCandidates([c('a', { number: 2 }), c('b', { number: 1 })]).map((x) => x.name)).toEqual(['b', 'a']);
    expect(orderCandidates([c('a', { number: 2 }), c('b')]).map((x) => x.name)).toEqual(['a', 'b']);
  });

  it('沒有檔案回 null；有檔案時 0 照算', () => {
    expect(recordCounts(undefined)).toBeNull();
    expect(recordCounts({ careers: [{}, {}], judgments: [], controversies: [{}], donations: [] } as never))
      .toEqual({ careers: 2, judgments: 0, controversies: 1, donations: 0 });
  });
});

describe('partyLabel / partyColorVar', () => {
  it('名冊「無」顯示為無黨籍', () => {
    expect(partyLabel(c('甲'))).toBe('無黨籍');
    expect(partyLabel(c('乙', KMT))).toBe('中國國民黨');
  });
  it('色點與 partyTally 同規則', () => {
    expect(partyColorVar(c('甲'))).toBe('--party-none');
    expect(partyColorVar(c('乙', KMT))).toBe(partyTally([c('乙', KMT)])[0].cssVar);
    expect(partyColorVar(c('丙', { partyName: '新黨甲', partyCode: null }))).toBe('--party-other');
  });
});
