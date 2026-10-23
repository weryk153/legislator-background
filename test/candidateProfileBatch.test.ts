import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { planCandidateProfiles, type CandidateProfileBatch, type ProfileState } from '../scraper/lib/candidateProfileBatch';
import type { CountyCandidates } from '../src/lib/candidateTypes';
const fullBatch = JSON.parse(readFileSync('scraper/candidate-profiles-confirmed.json', 'utf8')) as CandidateProfileBatch;
const profiles = fullBatch.profiles.filter(p => p.official.district.startsWith('連江縣'));
const sourceIds = new Set(profiles.flatMap(p => p.careers.map(c => c.source_id)));
const batch: CandidateProfileBatch = { profiles, sources: fullBatch.sources.filter(s => sourceIds.has(s.id)) };
const registrationArchive = JSON.parse(readFileSync('scraper/candidate-registrations-2026-excluded.json', 'utf8'));
// 此組測試驗證 9 月已執行的歷史建檔批次，使用當時登記名冊（包含後續未通過審定者）。
function registrationCounty(path: string): CountyCandidates {
  const c = JSON.parse(readFileSync(path, 'utf8')) as CountyCandidates;
  c.source = registrationArchive.registrationSource;
  for (const r of registrationArchive.records) if (r.countyCode === c.countyCode) {
    c.districts.find(d => d.no === r.districtNo)!.candidates.push(r.candidate);
  }
  return c;
}
const county = registrationCounty('public/data/candidates/2026/county/09-007-00-000-0000.json') as CountyCandidates;
const empty = (): ProfileState => ({ officials: [], sources: [], careers: [] });
const plan = (b = batch, state = empty(), counties = [county]) => planCandidateProfiles(b, counties, state);
describe('已查證參選人增量建檔', () => {
  it('跨縣市批次保留嘉義市自述出處，兩位僅有登記資料者不填推測經歷', () => {
    const dir = 'public/data/candidates/2026/county';
    const counties = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => registrationCounty(`${dir}/${f}`));
    const p = planCandidateProfiles(fullBatch, counties, empty());
    const chiayi = fullBatch.profiles.filter(p => p.official.district.startsWith('嘉義市'));
    expect(chiayi).toHaveLength(19);
    expect(chiayi.filter(p => p.careers.length === 1).map(p => p.official.name).sort()).toEqual(['林子淨', '魏志軒']);
    const chiayiSourceIds = new Set(chiayi.flatMap(p => p.careers.map(c => c.source_id)));
    expect(p.sources.filter(s => chiayiSourceIds.has(s.id) && s.type === 'website')).toHaveLength(3);
    const penghu = fullBatch.profiles.filter(p => p.official.district.startsWith('澎湖縣'));
    expect(penghu).toHaveLength(20);
    expect(penghu.filter(p => p.careers.length === 1).map(p => p.official.name).sort()).toEqual(
      ['歐松林', '林柏成', '張惠雅', '許皆詳', '許嘉峻', '黃榮焜', '鄭淑卿'].sort(),
    );
    const kinmen = fullBatch.profiles.filter(p => p.official.district.startsWith('金門縣'));
    expect(kinmen).toHaveLength(21);
    expect(kinmen.filter(p => p.careers.length === 1).map(p => p.official.name).sort()).toEqual(
      ['李文益', '陳麒翔', '洪毓壕'].sort(),
    );
    expect(kinmen.some(p => p.official.name === '楊育菡')).toBe(false);
    expect(kinmen.find(p => p.official.name === '林鑫一')!.careers.some(c => c.title.includes('在學'))).toBe(true);
    expect(planCandidateProfiles(fullBatch, counties, p)).toEqual(empty());
    const invalid = structuredClone(fullBatch);
    invalid.sources.find(s => s.type === 'website')!.title = '未標示性質的參選網站';
    expect(() => planCandidateProfiles(invalid, counties, empty())).toThrow(/自述/);
  });
  it('每人須與登記名冊吻合，保留所有經歷出處', () => {
    const p = plan(); expect(p.officials).toHaveLength(6); expect(p.careers).toHaveLength(23);
    expect(p.careers.every(c => p.sources.some(s => s.id === c.source_id))).toBe(true);
  });
  it('原住民選區須保留完整平地／山地標籤，不接受互換或省略', () => {
    const county = registrationCounty('public/data/candidates/2026/county/10-005-00-000-0000.json') as CountyCandidates;
    const profile = fullBatch.profiles.find(p => p.official.name === '朱仲一Kalih．Tahes．Didiyun')!;
    const b = { sources: fullBatch.sources, profiles: [profile] };
    expect(planCandidateProfiles(b, [county], empty()).officials).toHaveLength(1);
    for (const suffix of ['（山地原住民）', '']) {
      const invalid = structuredClone(b);
      const o = invalid.profiles[0].official;
      o.district = o.district.replace('（平地原住民）', suffix);
      o.slug = `cand-${o.name}-${o.district}`;
      expect(() => planCandidateProfiles(invalid, [county], empty())).toThrow(/名冊/);
    }
  });
  it('重跑不重複，來源已寫入但人物/經歷中斷可接續', () => {
    const p = plan(); expect(plan(batch, p)).toEqual(empty());
    const partial = { ...empty(), sources: p.sources, officials: p.officials.slice(0, 1) };
    expect(plan(batch, partial)).toMatchObject({ sources: [], careers: p.careers, officials: p.officials.slice(1) });
  });
  it('任何一人同名、slug 或既有固定 ID 衝突即拒絕整批', () => {
    const p = plan(); const state = structuredClone(p); state.officials[0].party = '另一政黨';
    expect(() => plan(batch, state)).toThrow(/衝突/);
    expect(() => plan(batch, { ...empty(), officials: [{ ...p.officials[0], id: 'another-id', district: '別縣市' }] })).toThrow(/同名/);
  });
  it('同名分開建檔須逐一指定既有 slug、理由和有效來源，不能放行 slug 衝突', () => {
    const b = structuredClone(batch);
    const original = b.profiles[0].official;
    const other = { ...original, id: 'other-id', slug: 'other-person', district: '桃園市第14選舉區' };
    const state = { ...empty(), officials: [other] };
    expect(() => plan(b, state)).toThrow(/同名/);
    b.profiles[0].distinctFrom = [{ slug: other.slug, basis: '完整名冊與兩地公報核對，分開建檔', sourceIds: [b.sources[0].id] }];
    expect(plan(b, state).officials).toHaveLength(6);
    for (const mutation of ['empty-basis', 'missing-source', 'wrong-slug', 'duplicate']) {
      const invalid = structuredClone(b), c = invalid.profiles[0].distinctFrom![0];
      if (mutation === 'empty-basis') c.basis = ' ';
      if (mutation === 'missing-source') c.sourceIds = ['missing'];
      if (mutation === 'wrong-slug') c.slug = 'not-the-collision';
      if (mutation === 'duplicate') invalid.profiles[0].distinctFrom!.push(c);
      expect(() => plan(invalid, state)).toThrow(/同名/);
    }
    expect(() => plan(b, { ...empty(), officials: [{ ...other, slug: original.slug }] })).toThrow(/slug/);
    expect(() => plan(b, { ...empty(), officials: [{ ...other, name: '另一個人' }] })).toThrow(/同名/);
  });
  it('名冊選區、黨籍、日期或已連結其他人不符都拒絕', () => {
    for (const change of ['district', 'party', 'date', 'slug']) {
      const counties = [structuredClone(county)]; const candidate = counties[0].districts[0].candidates.find(c => c.name === batch.profiles[0].official.name)!;
      if (change === 'district') counties[0].districts[0].label = '第99選舉區';
      if (change === 'party') candidate.partyName = '其他';
      if (change === 'date') candidate.registeredOn = '2026-09-04';
      if (change === 'slug') candidate.slug = 'someone-else';
      expect(() => plan(batch, empty(), counties)).toThrow(/名冊/);
    }
  });
  it('同批次同名人物須雙向逐一判別，允許分開匯入及中斷後接續', () => {
    const dir = 'public/data/candidates/2026/county';
    const counties = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => registrationCounty(`${dir}/${f}`));
    const b = structuredClone({ sources: fullBatch.sources, profiles: fullBatch.profiles.filter(p => p.official.name === '張耀中') });
    expect(b.profiles).toHaveLength(2);
    const result = planCandidateProfiles(b, counties, empty());
    expect(result.officials.map(o => o.district).sort()).toEqual(['臺中市第7選舉區', '高雄市第11選舉區']);
    expect(planCandidateProfiles(b, counties, result)).toEqual(empty());
    expect(planCandidateProfiles(b, counties, { ...result, officials: result.officials.slice(0, 1) }).officials).toHaveLength(1);
    for (const index of [0, 1]) {
      const invalid = structuredClone(b);
      delete invalid.profiles[index].distinctFrom;
      expect(() => planCandidateProfiles(invalid, counties, empty())).toThrow(/同名/);
    }
  });
  it('經歷來源缺失、日期被誤當現任與來源 ID 重複都拒絕', () => {
    const b = structuredClone(batch); b.profiles[0].careers[1].source_id = 'missing';
    expect(() => plan(b)).toThrow(/出處/);
    const c = structuredClone(batch); c.profiles[0].careers[1].start_date = '2005-05-02';
    expect(() => plan(c)).toThrow(/日期/);
    const d = structuredClone(batch); d.sources.push(d.sources[0]); expect(() => plan(d)).toThrow(/重複/);
  });
  it('中途重跑時也不覆蓋已寫入經歷或出處', () => {
    const p = structuredClone(plan()); p.careers[0].title = '被修改'; expect(() => plan(batch, p)).toThrow(/careers 既有資料衝突/);
    const s = structuredClone(plan()); s.sources[0].url = 'https://example.com'; expect(() => plan(batch, s)).toThrow(/sources 既有資料衝突/);
  });
});
