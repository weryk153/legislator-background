// 已逐筆查證的議員參選人建檔批次。純預檢；整批驗完才允許寫入。
import { fullKey, nameKey, normalizeDistrict } from './candidateLinks';
import type { CountyCandidates } from '../../src/lib/candidateTypes';
export interface ProfileSource { id: string; url: string; type: 'gov' | 'news' | 'gazette' | 'website'; title: string; retrieved_at: string }
export interface ProfileOfficial { id: string; slug: string; name: string; party: string; office_type: string; district: string; term: string; is_incumbent: boolean; bio: string; photo_url: string | null }
export interface ProfileCareer { id: string; official_id: string; title: string; organization: string; start_date: string; end_date: string | null; source_id: string }
export interface DistinctPersonConfirmation { slug: string; basis: string; sourceIds: string[] }
export interface CandidateProfileBatch { sources: ProfileSource[]; profiles: { official: ProfileOfficial; registration: { partyName: string; registeredOn: string }; careers: ProfileCareer[]; distinctFrom?: DistinctPersonConfirmation[] }[] }
export interface ProfileState { officials: ProfileOfficial[]; sources: ProfileSource[]; careers: ProfileCareer[] }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
function fail(message: string): never { throw new Error(`候選人批次：${message}`); }
function unique(rows: { id: string }[], table: string) {
  const ids = new Set<string>();
  for (const r of rows) { if (!uuid.test(r.id) || ids.has(r.id)) fail(`${table} ID 無效或重複：${r.id}`); ids.add(r.id); }
}
function missing<T extends { id: string }>(wanted: T[], existing: T[], table: string): T[] {
  return wanted.filter(row => {
    const old = existing.find(r => r.id === row.id);
    if (!old) return true;
    if (Object.entries(row).some(([key, value]) => old[key as keyof T] !== value)) fail(`${table} 既有資料衝突：${row.id}`);
    return false;
  });
}
export function planCandidateProfiles(batch: CandidateProfileBatch, counties: CountyCandidates[], existing: ProfileState): ProfileState {
  const officials = batch.profiles.map(p => p.official), careers = batch.profiles.flatMap(p => p.careers);
  unique(officials, 'officials'); unique(careers, 'careers'); unique(batch.sources, 'sources');
  const sourceIds = new Set(batch.sources.map(s => s.id));
  for (const s of batch.sources) {
    if (!/^https:\/\//.test(s.url) || !s.title.trim() || !date.test(s.retrieved_at) || !['gov', 'news', 'gazette', 'website'].includes(s.type)) fail(`來源不完整：${s.id}`);
    if (s.type === 'website' && !s.title.includes('自述')) fail(`參選網站須標明自述來源：${s.id}`);
  }
  const seenSlugs = new Set<string>();
  const knownOfficials = [...existing.officials, ...officials];
  for (const p of batch.profiles) {
    const o = p.official;
    if (!o.name.trim() || seenSlugs.has(o.slug)) fail(`姓名無效或 slug 重複：${o.name}`);
    seenSlugs.add(o.slug);
    if (o.office_type !== 'candidate' || o.is_incumbent !== false || o.term !== '2026' || !/^[^第]+[縣市]第\d+選舉區(?:（[平山]地原住民）)?$/.test(o.district) || o.slug !== `cand-${o.name}-${o.district}` || o.bio !== '' || o.photo_url !== null) fail(`建檔身分無效：${o.name}`);
    const matches = counties.flatMap(c => c.districts.flatMap(d => d.candidates
      .filter(r => fullKey(r.name) === fullKey(o.name) && normalizeDistrict(c.countyName + d.label) === normalizeDistrict(o.district))
      .map(r => ({ r, source: c.source }))));
    if (matches.length !== 1) fail(`登記名冊身分不唯一：${o.name}`);
    const { r, source } = matches[0];
    if (r.partyName !== p.registration.partyName || r.registeredOn !== p.registration.registeredOn || (r.slug && r.slug !== o.slug)) fail(`登記名冊不一致：${o.name}`);
    const party = r.partyName === '無' ? '無黨籍' : r.partyName;
    if (o.party !== party || !date.test(r.registeredOn)) fail(`黨籍／登記日期不一致：${o.name}`);
    const confirmations = p.distinctFrom ?? [];
    const confirmedSlugs = new Set<string>();
    for (const c of confirmations) {
      const target = knownOfficials.find(x => x.slug === c.slug);
      if (!c.slug.trim() || c.slug === o.slug || confirmedSlugs.has(c.slug) || !c.basis.trim() || !c.sourceIds.length || c.sourceIds.some(id => !sourceIds.has(id)) || (target && nameKey(target.name) !== nameKey(o.name))) fail(`同名人工判別不完整：${o.name}`);
      confirmedSlugs.add(c.slug);
    }
    if (knownOfficials.some(x => x.id !== o.id && (x.slug === o.slug || (nameKey(x.name) === nameKey(o.name) && !confirmedSlugs.has(x.slug))))) fail(`既有或批次同名／slug 待人工判別：${o.name}`);
    if (!p.careers.length || !p.careers.some(c => c.start_date === r.registeredOn && c.end_date === r.registeredOn && /登記參選/.test(c.title) && batch.sources.some(s => s.id === c.source_id && s.url === source.url && s.type === 'gov'))) fail(`缺登記來源：${o.name}`);
    for (const c of p.careers) {
      if (c.official_id !== o.id || !c.title.trim() || !sourceIds.has(c.source_id)) fail(`經歷或出處不完整：${o.name}`);
      // 未知任期不補日期；有日期須有結束，避免歷史經歷被網站誤顯示為現任。
      if ((c.start_date && (!date.test(c.start_date) || !c.end_date)) || (c.end_date && (!date.test(c.end_date) || (c.start_date && c.end_date < c.start_date)))) fail(`經歷日期不完整：${o.name}`);
      if (existing.careers.some(x => x.id !== c.id && x.official_id === c.official_id && x.title === c.title && x.organization === c.organization)) fail(`經歷重複：${o.name}`);
    }
  }
  return { officials: missing(officials, existing.officials, 'officials'), sources: missing(batch.sources, existing.sources, 'sources'), careers: missing(careers, existing.careers, 'careers') };
}
