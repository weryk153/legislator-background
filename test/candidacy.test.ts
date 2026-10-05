import { describe, it, expect } from 'vitest';
import { candidacyIndex } from '../src/lib/candidacy';
import type { CandidateEntry } from '../src/lib/candidateTypes';

const c = (name: string, slug: string | null): CandidateEntry =>
  ({ name, partyName: '無', partyCode: '999', number: null, registeredOn: '2026-09-02', slug, identity: null });
const src = { stage: 'registration' as const, url: '', tableDate: '' };

describe('candidacyIndex', () => {
  const idx = candidacyIndex(
    { source: src, races: [{ countyCode: '63-000-00-000-0000', countyName: '臺北市', isMunicipality: true, candidates: [c('蔣萬安', 'mayor-taipei'), c('郭璽', null)], incumbent2022: null }] },
    [{ source: src, countyCode: '65-000-00-000-0000', countyName: '新北市', townToDistrict: null, splitTowns: [], mappingNote: null,
      districts: [{ no: 1, label: '第1選舉區', type: 'regional', candidates: [c('甲', 'c-甲')] }] }],
  );
  it('首長', () => expect(idx.get('mayor-taipei')).toEqual({ role: '臺北市長', label: '2026 參選：臺北市長', countyKey: 'taipei' }));
  it('議員', () => expect(idx.get('c-甲')).toEqual({ role: '新北市第1選舉區議員', label: '2026 參選：新北市第1選舉區議員', countyKey: 'new-taipei' }));
  it('代碼為簡寫時以縣市名查 key', () => {
    const i = candidacyIndex({ source: src, races: [{ countyCode: '10', countyName: '基隆市', isMunicipality: false, candidates: [c('乙', 'b')], incumbent2022: null }] }, []);
    expect(i.get('b')?.countyKey).toBe('keelung');
  });
  it('對照表查無時 key 為 null', () => {
    const i = candidacyIndex({ source: src, races: [{ countyCode: 'x', countyName: '某縣', isMunicipality: false, candidates: [c('丙', 'p')], incumbent2022: null }] }, []);
    expect(i.get('p')?.countyKey).toBeNull();
  });
  it('沒有檔案的候選人不進索引', () => expect(idx.size).toBe(2));
  it('沒有資料時回空索引', () => expect(candidacyIndex(null, []).size).toBe(0));
});
