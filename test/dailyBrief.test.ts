import { describe, expect, it } from 'vitest';
import firstIssue from '../src/data/daily/2026-11-05.json';
import { loadDailyEditions, validateEditions, type DailyEdition } from '../src/lib/dailyBrief';

const copy = () => structuredClone(firstIssue) as DailyEdition;
describe('每日快報發布資料', () => {
  it('publishes sourced editions and preserves unknown source dates', () => {
    const issues = loadDailyEditions();
    expect(issues.length).toBeGreaterThan(0);
    const first = issues.find(issue => issue.date === '2026-11-05')!;
    expect(first.stories).toHaveLength(5);
    expect(first.stories.find(story => story.id === 'newtaipei')!.sources[0].publishedOn).toBeNull();
  });
  it('rejects missing sources and unexplained campaign claims', () => {
    const issue = copy();
    issue.stories[0].sources = [];
    expect(() => validateEditions([issue])).toThrow('缺少來源');
    const claim = copy();
    claim.stories[0].qualification = null;
    expect(() => validateEditions([claim])).toThrow('限定說明');
  });
  it('keeps future events explicitly marked as reminders', () => {
    const issue = copy();
    issue.stories[3].reminder = false;
    expect(() => validateEditions([issue])).toThrow('未來事件');
  });
  it('rejects sources published after review or reviewed after the edition cutoff', () => {
    const issue = copy();
    issue.stories[0].sources[0].publishedOn = '2026-11-06';
    expect(() => validateEditions([issue])).toThrow('來源日期');
    const late = copy();
    late.stories[0].sources[0].reviewedAt = '2026-11-05T17:30:00+08:00';
    expect(() => validateEditions([late])).toThrow('截止時間');
  });
  it('rejects ambiguous edition dates and anchor ids', () => {
    expect(() => validateEditions([copy(), copy()])).toThrow('重複');
    const issue = copy();
    issue.stories[1].id = issue.stories[0].id;
    expect(() => validateEditions([issue])).toThrow('ID');
  });
  it('accepts later reporting in the same edition without changing its first publication time', () => {
    const issue = copy();
    const publishedAt = issue.publishedAt;
    issue.cutoffAt = '2026-11-05T18:20:00+08:00';
    issue.updatedAt = '2026-11-05T18:30:00+08:00';
    issue.stories[0].sources[0].reviewedAt = '2026-11-05T18:15:00+08:00';
    const [updated] = validateEditions([issue]);
    expect(updated.publishedAt).toBe(publishedAt);
    expect(updated.number).toBe(firstIssue.number);
    expect(updated.cutoffAt).toBe(issue.cutoffAt);
  });
  it('rejects an updated edition whose new sources exceed its cutoff or whose cutoff exceeds publication', () => {
    const issue = copy();
    issue.updatedAt = '2026-11-05T18:30:00+08:00';
    issue.stories[0].sources[0].reviewedAt = '2026-11-05T18:15:00+08:00';
    expect(() => validateEditions([issue])).toThrow('截止時間');
    issue.cutoffAt = '2026-11-05T18:31:00+08:00';
    expect(() => validateEditions([issue])).toThrow('發布時間');
    const firstPublication = copy();
    firstPublication.cutoffAt = '2026-11-05T23:59:00+08:00';
    expect(() => validateEditions([firstPublication])).toThrow('發布時間');
  });
  it('sorts latest-first without changing existing archive dates', () => {
    const issue = copy();
    issue.date = '2026-11-06'; issue.number = 2;
    issue.cutoffAt = '2026-11-06T17:26:00+08:00';
    issue.publishedAt = issue.updatedAt = '2026-11-06T17:47:00+08:00';
    expect(validateEditions([copy(), issue]).map(i => i.date)).toEqual(['2026-11-06', '2026-11-05']);
  });
});
