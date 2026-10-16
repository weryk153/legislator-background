import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { indexCandidateChannels, loadCandidateChannels, type ChannelDataset } from '../src/lib/candidateChannels';
const roster = [{ slug: 'person', name: '測試候選人', role: '臺北市長' }];
const sample = (): ChannelDataset => ({ electionYear: 2026, updatedOn: '2026-10-16', rosterDate: '2026-09-04', candidates: [{ ...roster[0], reviewedOn: '2026-10-16', websiteNote: '未確認', facebookNote: '已確認', queries: ['候選人 官方網站 Facebook'], links: [{ kind: 'facebook-page', url: 'https://www.facebook.com/example/', title: '本人專頁', evidence: { url: 'https://example.tw/', note: '官網直接連結' } }] }] });
describe('候選人網站與 Facebook', () => {
  it('實際快照與完整首長名冊逐人對應', () => {
    const raw = JSON.parse(readFileSync('public/data/candidates/2026/national.json', 'utf8'));
    const expected = raw.races.flatMap((r: { candidates: { slug: string }[] }) => r.candidates.map(c => c.slug));
    expect([...loadCandidateChannels().keys()].sort()).toEqual(expected.sort());
  });
  it('保留未確認狀態，不能藉空資料漏掉候選人', () => {
    const data = sample(); data.candidates[0].links = [];
    expect(indexCandidateChannels(data, roster).get('person')?.links).toEqual([]);
    data.candidates = [];
    expect(() => indexCandidateChannels(data, roster)).toThrow('完整名冊');
  });
  it('拒絕同名誤配、重複人選與錯誤職位', () => {
    for (const key of ['slug', 'name', 'role'] as const) {
      const data = sample(); data.candidates[0][key] = '另一人';
      expect(() => indexCandidateChannels(data, roster)).toThrow('名冊不符');
    }
    const data = sample(); data.candidates.push(data.candidates[0]);
    expect(() => indexCandidateChannels(data, roster)).toThrow('名冊不符');
  });
  it('拒絕社團、貼文、偽冒網域與含帳密網址', () => {
    for (const url of ['https://www.facebook.com/groups/123/', 'https://www.facebook.com/person/posts/123/', 'https://facebook.com.evil.test/person', 'https://user:pass@facebook.com/person', 'javascript:alert(1)', 'https://www.facebook.com/']) {
      const data = sample(); data.candidates[0].links[0].url = url;
      expect(() => indexCandidateChannels(data, roster)).toThrow();
    }
  });
  it('查核必須有來源、說明與有效日期', () => {
    const data = sample(); data.candidates[0].links[0].evidence.note = '';
    expect(() => indexCandidateChannels(data, roster)).toThrow('來源無效');
    const later = sample(); later.candidates[0].reviewedOn = '2026-10-17';
    expect(() => indexCandidateChannels(later, roster)).toThrow('查核紀錄不完整');
  });
  it('Facebook 個人帳號與競選官網保持不同標籤', () => {
    const data = sample(); data.candidates[0].links[0].kind = 'facebook-profile';
    expect(indexCandidateChannels(data, roster).get('person')?.links[0].kind).toBe('facebook-profile');
    data.candidates[0].links[0].kind = 'campaign';
    expect(() => indexCandidateChannels(data, roster)).toThrow('不可標為競選網站');
  });
});
