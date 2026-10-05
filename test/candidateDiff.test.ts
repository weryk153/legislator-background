import { describe, it, expect } from 'vitest';
import { flatten, diffCandidates, renderDiff } from '../scraper/lib/candidateDiff';
import type { NationalCandidates, CountyCandidates, CandidateEntry } from '../src/lib/candidateTypes';

const c = (name: string, o: Partial<CandidateEntry> = {}): CandidateEntry =>
  ({ name, partyName: '無', partyCode: '999', number: null, registeredOn: '2026-09-02', slug: null, identity: null, ...o });
const nat = (cands: CandidateEntry[]): NationalCandidates => ({
  source: { stage: 'registration', url: '', tableDate: '' },
  races: [{ countyCode: '63-000-00-000-0000', countyName: '臺北市', isMunicipality: true, candidates: cands, incumbent2022: null }],
});

describe('diffCandidates', () => {
  it('首次產出（無前一版）回 null，報告寫首次產出', () => {
    const d = diffCandidates(null, flatten(nat([c('甲')]), []));
    expect(d).toBeNull();
    expect(renderDiff(d)).toMatch(/首次產出/);
  });
  it('新增、移除、改黨、號次各一', () => {
    const prev = flatten(nat([c('甲'), c('乙'), c('丙')]), []);
    const next = flatten(nat([c('甲', { partyName: '民主進步黨', partyCode: '16' }), c('乙', { number: 3 }), c('丁')]), []);
    const kinds = diffCandidates(prev, next)!.map((l) => `${l.kind}:${l.name}`).sort();
    expect(kinds).toEqual(['added:丁', 'numberChanged:乙', 'partyChanged:甲', 'removed:丙']);
  });
  it('移除的條目在報告中提示檢查參選標記', () => {
    const d = diffCandidates(flatten(nat([c('丙', { slug: 's' })]), []), flatten(nat([]), []));
    expect(renderDiff(d)).toMatch(/檢查.*參選標記/);
  });
});

const county = (label: string, cands: CandidateEntry[]): CountyCandidates => ({
  source: { stage: 'registration', url: '', tableDate: '' }, countyCode: 'x', countyName: '臺東縣',
  districts: [{ no: 9, label, type: 'unknown', candidates: cands }], townToDistrict: null, splitTowns: [], mappingNote: null,
});

describe('flatten 的穩定鍵', () => {
  it('選區標籤加上類型後綴（對應由未確認變確認）不產生差異', () => {
    const prev = flatten(null, [county('第9選舉區', [c('甲'), c('乙')])]);
    const next = flatten(null, [county('第9選舉區（平地原住民）', [c('甲'), c('乙')])]);
    expect(diffCandidates(prev, next)).toEqual([]);
  });
  it('議員選區新增候選人只報新增，race 仍用可讀標籤', () => {
    const prev = flatten(null, [county('第9選舉區', [c('甲')])]);
    const next = flatten(null, [county('第9選舉區（平地原住民）', [c('甲'), c('乙')])]);
    const d = diffCandidates(prev, next)!;
    expect(d.map((l) => `${l.kind}:${l.name}`)).toEqual(['added:乙']);
    expect(d[0].race).toBe('臺東縣第9選舉區（平地原住民）');
  });
  it('漢字相同、羅馬拼音不同的兩位候選人各自追蹤', () => {
    const a = c('楊清順Cinsun‧Pawtawan'), b = c('楊清順Lisin‧Pawtawan');
    const d = diffCandidates(flatten(nat([a, b]), []), flatten(nat([a]), []))!;
    expect(d.map((l) => `${l.kind}:${l.name}`)).toEqual(['removed:楊清順Lisin‧Pawtawan']);
  });
  it('同選區完整姓名重複就拋錯', () => {
    expect(() => flatten(nat([c('甲'), c('甲')]), [])).toThrow(/臺北市.*甲.*甲/);
  });
});
