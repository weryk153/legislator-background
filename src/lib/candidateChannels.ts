import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CHANNEL_LABEL = {
  campaign: '競選網站', website: '官方網站', hub: '官方連結頁',
  support: '競選支持頁', 'facebook-page': 'Facebook 粉絲專頁', 'facebook-profile': 'Facebook 公開帳號',
} as const;
export interface CandidateChannel {
  kind: keyof typeof CHANNEL_LABEL;
  url: string;
  title: string;
  evidence: { url: string; note: string };
}
export interface CandidateChannels {
  slug: string; name: string; role: string; reviewedOn: string;
  links: CandidateChannel[];
  websiteNote: string; facebookNote: string;
  queries: string[];
}
export interface ChannelDataset {
  electionYear: number; updatedOn: string; rosterDate: string;
  candidates: CandidateChannels[];
}
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
function publicUrl(value: string): URL {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('公開網址無效');
  return url;
}
/** 來源與身分核對保留在獨立快照，未確認帳號不建立連結。 */
export function indexCandidateChannels(data: ChannelDataset, roster: Pick<CandidateChannels, 'slug' | 'name' | 'role'>[]): Map<string, CandidateChannels> {
  if (data.electionYear !== 2026 || !validDate(data.updatedOn) || !validDate(data.rosterDate) || data.rosterDate > data.updatedOn) throw new Error('候選人連結年度或日期無效');
  const people = new Map(roster.map(c => [c.slug, c]));
  const index = new Map<string, CandidateChannels>();
  for (const c of data.candidates) {
    const person = people.get(c.slug);
    if (!person || person.name !== c.name || person.role !== c.role || index.has(c.slug)) throw new Error(`候選人連結名冊不符：${c.slug}`);
    if (!validDate(c.reviewedOn) || c.reviewedOn > data.updatedOn || !c.websiteNote.trim() || !c.facebookNote.trim() || !c.queries.length) throw new Error(`候選人連結查核紀錄不完整：${c.slug}`);
    const urls = new Set<string>();
    for (const link of c.links) {
      const url = publicUrl(link.url);
      publicUrl(link.evidence.url);
      if (!Object.hasOwn(CHANNEL_LABEL, link.kind) || !link.title.trim() || !link.evidence.note.trim() || urls.has(link.url)) throw new Error(`候選人連結類型或來源無效：${c.slug}`);
      urls.add(link.url);
      const facebook = ['facebook.com', 'www.facebook.com'].includes(url.hostname);
      if (link.kind.startsWith('facebook-')) {
        if (!facebook || url.pathname === '/' || /\/(groups|posts|videos|reels|photos|events|share|sharer|watch|login|hashtag)(\/|\.|$)/i.test(url.pathname)) throw new Error(`Facebook 連結須為本人專頁或公開帳號：${c.slug}`);
      } else if (facebook) throw new Error(`Facebook 不可標為競選網站：${c.slug}`);
    }
    index.set(c.slug, c);
  }
  if (index.size !== people.size) throw new Error('候選人連結查核未涵蓋完整名冊');
  return index;
}
let cache: Map<string, CandidateChannels> | undefined;
export function loadCandidateChannels(): Map<string, CandidateChannels> {
  if (!cache) {
    const data = JSON.parse(readFileSync(join(process.cwd(), 'src/data/candidate-channels.json'), 'utf8')) as ChannelDataset;
    const roster = JSON.parse(readFileSync(join(process.cwd(), 'public/data/candidates/2026/national.json'), 'utf8')) as { source: { tableDate: string }; races: { countyName: string; candidates: { slug: string; name: string }[] }[] };
    if (data.rosterDate !== roster.source.tableDate) throw new Error('候選人連結名冊日期已過期');
    cache = indexCandidateChannels(data, roster.races.flatMap(r => r.candidates.map(c => ({ ...c, role: `${r.countyName}長` }))));
  }
  return cache;
}
