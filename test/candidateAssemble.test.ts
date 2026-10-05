import { describe, it, expect } from 'vitest';
import { assemble, type AssembleInput } from '../scraper/lib/candidateAssemble';
import { buildDistrictRefs } from '../scraper/lib/councilDistricts';
import type { RegistrationRow } from '../scraper/lib/candidatePdf';

const row = (district: string, name: string, party = '無', registeredOn = '2026-09-02', number: number | null = null): RegistrationRow =>
  ({ district, name, party, registeredOn, note: '', number });

const T1 = [
  '63,000,00,000,0000,臺北市', '63,000,01,000,0000,第01選舉區', '63,000,01,110,0000,北投區',
  '63,000,01,120,0000,士林區', '63,000,02,000,0000,第02選舉區', '63,000,02,010,0000,松山區',
  '10,014,00,000,0000,臺東縣', '10,014,01,000,0000,第01選舉區', '10,014,01,010,0000,臺東市',
].join('\n');

function input(over: Partial<AssembleInput> = {}): AssembleInput {
  return {
    source: { stage: 'registration', url: 'https://web.cec.gov.tw/central/article/64709', tableDate: '2026-09-07' },
    chiefRows: [
      row('臺東縣', '陳瑩', '民主進步黨'),
      row('臺北市', '郭璽', '台灣麻將最大黨', '2026-08-31'),
      row('臺北市', '蔣萬安', '中國國民黨', '2026-09-04'),
    ],
    councilRows: [
      row('臺北市第1選舉區', '甲'), row('臺北市第2選舉區', '乙'),
      row('臺東縣第1選舉區', '丙'), row('臺東縣第2選舉區', '丁'),
    ],
    countyOrder: [{ code: '10-014-00-000-0000', name: '臺東縣' }, { code: '63-000-00-000-0000', name: '臺北市' }],
    partyCode: (n) => ({ 民主進步黨: '16', 中國國民黨: '1', 無: '999' } as Record<string, string>)[n] ?? null,
    link: (name) => name === '蔣萬安'
      ? { kind: 'auto', slug: 'mayor-taipei', reason: '' }
      : name === '乙' ? { kind: 'review', slug: null, reason: '同名多筆', candidates: ['x', 'y'] }
        : { kind: 'none', slug: null, reason: '' },
    identity: (slug) => (slug === 'mayor-taipei' ? '現任臺北市長' : null),
    districtRefs: buildDistrictRefs([{ type: 'regional', elbaseCsv: T1 }]),
    ...over,
  };
}

describe('assemble：首長', () => {
  const { national } = assemble(input());
  it('六都在前，其餘依地圖檔順序', () => {
    expect(national.races.map((r) => r.countyName)).toEqual(['臺北市', '臺東縣']);
    expect(national.races[0].isMunicipality).toBe(true);
  });
  it('無號次時保持名冊列序', () => {
    expect(national.races[0].candidates.map((c) => c.name)).toEqual(['郭璽', '蔣萬安']);
  });
  it('連結與身分說明帶入', () => {
    expect(national.races[0].candidates[1]).toMatchObject({ slug: 'mayor-taipei', identity: '現任臺北市長', partyCode: '1' });
  });
  it('新政黨的 partyCode 是 null，不是 999', () => {
    expect(national.races[0].candidates[0]).toMatchObject({ partyName: '台灣麻將最大黨', partyCode: null });
  });
});

describe('assemble：2022 當選者對照', () => {
  const chief = { name: '蔣萬安', partyName: '中國國民黨', partyCode: '1', slug: 'mayor-taipei', termLimitStatus: 'notLimited' as const, termLimitReason: '' };
  it('countyOrder 帶 chief 時 race.incumbent2022 帶出', () => {
    const { national } = assemble(input({
      countyOrder: [{ code: '10-014-00-000-0000', name: '臺東縣' }, { code: '63-000-00-000-0000', name: '臺北市', chief }],
    }));
    expect(national.races[0].incumbent2022).toEqual(chief);
  });
  it('不帶 chief 時為 null', () => {
    const { national } = assemble(input());
    expect(national.races.every((r) => r.incumbent2022 === null)).toBe(true);
  });
});

describe('assemble：號次', () => {
  it('全數有號次時依號次排序', () => {
    const { national } = assemble(input({
      chiefRows: [row('臺北市', '蔣萬安', '中國國民黨', '2026-09-04', 2), row('臺北市', '郭璽', '無', '2026-08-31', 1)],
    }));
    expect(national.races[0].candidates.map((c) => c.number)).toEqual([1, 2]);
  });
});

describe('assemble：議員', () => {
  const { counties, review, warnings } = assemble(input());
  const tp = counties.find((c) => c.countyName === '臺北市')!;
  const tt = counties.find((c) => c.countyName === '臺東縣')!;
  it('選區數一致的縣市有鄉鎮對應與選區類型', () => {
    expect(tp.townToDistrict).toEqual({
      '63-000-00-110-0000': 1, '63-000-00-120-0000': 1, '63-000-00-010-0000': 2,
    });
    expect(tp.districts.map((d) => [d.no, d.type, d.label])).toEqual([[1, 'regional', '第1選舉區'], [2, 'regional', '第2選舉區']]);
    expect(tp.mappingNote).toBeNull();
  });
  it('選區數不一致的縣市對應為 null、類型 unknown、附原因', () => {
    expect(tt.townToDistrict).toBeNull();
    expect(tt.districts.every((d) => d.type === 'unknown')).toBe(true);
    expect(tt.mappingNote).toMatch(/重劃/);
    expect(warnings.some((w) => w.includes('臺東縣'))).toBe(true);
  });
  it('審核清單收集 review 結果', () => {
    expect(review).toEqual([{ name: '乙', race: '臺北市第2選舉區', reason: '同名多筆', candidates: ['x', 'y'] }]);
  });
  it('查無代碼的政黨列入警告（無黨籍「無」除外）', () => {
    const { warnings: w } = assemble(input());
    expect(w.some((x) => x.includes('台灣麻將最大黨'))).toBe(true);
    expect(w.some((x) => x.includes('「無」'))).toBe(false);
  });
});

describe('assemble：同一選舉不得兩人連到同一檔案', () => {
  const same = { kind: 'auto' as const, slug: 'dup', reason: '' };
  it('議員選區：兩人同 slug 時雙雙取消連結並各進審核清單', () => {
    const { counties, review } = assemble(input({
      councilRows: [row('臺北市第1選舉區', '甲'), row('臺北市第1選舉區', '乙'), row('臺北市第2選舉區', '丙')],
      link: (name) => (name === '甲' || name === '乙' ? same : { kind: 'none', slug: null, reason: '' }),
      identity: () => '現任議員',
    }));
    const d1 = counties.find((c) => c.countyName === '臺北市')!.districts[0];
    expect(d1.candidates.map((c) => [c.slug, c.identity])).toEqual([[null, null], [null, null]]);
    expect(review).toEqual([
      { name: '甲', race: '臺北市第1選舉區', reason: '同一選舉兩位候選人連到同一檔案（dup）', candidates: ['dup'] },
      { name: '乙', race: '臺北市第1選舉區', reason: '同一選舉兩位候選人連到同一檔案（dup）', candidates: ['dup'] },
    ]);
  });
  it('首長選舉同理；不同選舉各連一次不受影響', () => {
    const { national, review } = assemble(input({
      chiefRows: [row('臺北市', '甲'), row('臺北市', '乙'), row('臺東縣', '丙')],
      link: (name) => (name === '丙' || name === '甲' || name === '乙' ? same : { kind: 'none', slug: null, reason: '' }),
    }));
    expect(national.races.find((r) => r.countyName === '臺北市')!.candidates.every((c) => c.slug === null)).toBe(true);
    expect(national.races.find((r) => r.countyName === '臺東縣')!.candidates[0].slug).toBe('dup');
    expect(review).toHaveLength(2);
  });
});

describe('assemble：資料錯誤', () => {
  it('首長選區不是已知縣市就拋錯', () => {
    expect(() => assemble(input({ chiefRows: [row('臺北縣', '某')] }))).toThrow(/臺北縣/);
  });
  it('議員選區字串格式不對就拋錯', () => {
    expect(() => assemble(input({ councilRows: [row('臺北市第一選舉區', '某')] }))).toThrow(/第一選舉區/);
  });
});
