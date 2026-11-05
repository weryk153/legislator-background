import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const NEWS_CATEGORY = { policy: '政見', election: '選務', public: '公共議題' } as const;
export interface BriefSource {
  publisher: string;
  kind: 'official' | 'news' | 'campaign' | 'civic';
  title: string;
  url: string;
  publishedOn: string | null;
  reviewedAt: string;
}
export interface BriefStory {
  id: string;
  category: keyof typeof NEWS_CATEGORY;
  region: string;
  shortTitle: string;
  title: string;
  summary: string[];
  positions: { name: string; party: string; text: string }[];
  qualification: string | null;
  eventOn: string | null;
  reminder: boolean;
  sources: BriefSource[];
}
export interface DailyEdition {
  date: string;
  number: number;
  label: string;
  cutoffAt: string;
  publishedAt: string;
  updatedAt: string;
  stories: BriefStory[];
}

const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const validTime = (s: string) => typeof s === 'string' && /T\d{2}:\d{2}:\d{2}\+08:00$/.test(s) && validDate(s.slice(0, 10)) && Number.isFinite(Date.parse(s));
const nonempty = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

/** Refuse publication when sources or dates cannot support an edition. Unknown dates stay null. */
export function validateEditions(editions: DailyEdition[]): DailyEdition[] {
  if (!editions.length) throw new Error('每日快報尚無已查核刊次');
  const dates = new Set<string>();
  const numbers = new Set<number>();
  for (const issue of editions) {
    if (!validDate(issue.date) || dates.has(issue.date) || !Number.isInteger(issue.number) || issue.number < 1 || numbers.has(issue.number)) throw new Error('快報日期或期號無效／重複');
    dates.add(issue.date); numbers.add(issue.number);
    if (!nonempty(issue.label) || !validTime(issue.cutoffAt) || !validTime(issue.publishedAt) || !validTime(issue.updatedAt)
      || issue.cutoffAt.slice(0, 10) !== issue.date || issue.cutoffAt > issue.publishedAt || issue.publishedAt > issue.updatedAt) throw new Error('快報核對或發布時間不一致');
    if (!issue.stories.length) throw new Error('不能以空白快報冒充已完成查核');
    const ids = new Set<string>();
    for (const story of issue.stories) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(story.id) || ids.has(story.id)) throw new Error('快報消息 ID 無效／重複');
      ids.add(story.id);
      if (!Object.hasOwn(NEWS_CATEGORY, story.category) || ![story.title, story.shortTitle, story.region].every(nonempty)
        || !story.summary.length || !story.summary.every(nonempty) || typeof story.reminder !== 'boolean') throw new Error('快報消息內容或分類不完整');
      if (story.eventOn !== null && (!validDate(story.eventOn) || (!story.reminder && story.eventOn > issue.date))) throw new Error('未來事件必須標為提醒');
      if ((story.category === 'policy' || story.reminder) && !nonempty(story.qualification)) throw new Error('政見或提醒缺少限定說明');
      for (const position of story.positions) {
        if (![position.name, position.party, position.text].every(nonempty)) throw new Error('候選人說法歸屬不完整');
      }
      if (!story.sources.length) throw new Error('快報消息缺少來源');
      const urls = new Set<string>();
      for (const source of story.sources) {
        const url = new URL(source.url);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || urls.has(source.url)
          || ![source.publisher, source.title].every(nonempty) || !['official', 'news', 'campaign', 'civic'].includes(source.kind)) throw new Error('快報來源不完整／網址無效');
        urls.add(source.url);
        if (!validTime(source.reviewedAt) || source.reviewedAt > issue.updatedAt
          || (source.publishedOn !== null && (!validDate(source.publishedOn) || source.publishedOn > source.reviewedAt.slice(0, 10)))) throw new Error('快報來源日期不一致');
        // Later corrections may be reviewed after the original cutoff, but never silently enter the original edition.
        if (source.reviewedAt > issue.cutoffAt && issue.updatedAt === issue.publishedAt) throw new Error('新增來源超過本期查核截止時間');
      }
    }
  }
  return [...editions].sort((a, b) => b.date.localeCompare(a.date));
}

let cached: DailyEdition[] | undefined;
export function loadDailyEditions(): DailyEdition[] {
  if (!cached) {
    const dir = join(process.cwd(), 'src/data/daily');
    const editions = readdirSync(dir).filter(name => name.endsWith('.json')).map(name => {
      const issue = JSON.parse(readFileSync(join(dir, name), 'utf8')) as DailyEdition;
      if (name !== `${issue.date}.json`) throw new Error('快報檔名與刊次日期不一致');
      return issue;
    });
    cached = validateEditions(editions);
  }
  return cached;
}

export const editionHref = (date: string) => `/daily/${date}/`;
export const displayDate = (date: string) => date.replaceAll('-', '.');
export const weekday = (date: string) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'long' }).format(new Date(`${date}T12:00:00+08:00`));
