import { afterEach, describe, it, expect, vi } from 'vitest';
import { authJudicial, fetchJList, fetchJDoc, flattenJList, judgmentFromJDoc, matchJudgment, defendantZones, judicialQueue, type JDoc } from '../lib/judicial-feed';
import type { Target } from '../lib/types';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('unfinished judicial queue', () => {
  it('retains failed and capped documents after the daily change list rotates', () => {
    expect(judicialQueue(['new', 'retry'], { pendingJids: ['retry', 'old-failure', 'capped'] })).toEqual(['new', 'retry', 'old-failure', 'capped']);
  });
  it('migrates legacy failures while ignoring invalid entries', () => {
    expect(judicialQueue(['new'], { failedJids: ['old', null, '', 1, 'old'] })).toEqual(['new', 'old']);
  });
  it('does not revive completed backlog from an empty pending list', () => {
    expect(judicialQueue(['today'], { pendingJids: [], failedJids: ['previous'] })).toEqual(['today']);
  });
});

describe('judicial API responses', () => {
  it('uses the documented Auth request and capitalized Token response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Token: 'test-token' })));
    vi.stubGlobal('fetch', fetch);
    await expect(authJudicial('test-user', 'test-password')).resolves.toBe('test-token');
    expect(fetch).toHaveBeenCalledWith('https://data.judicial.gov.tw/jdg/api/Auth', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ user: 'test-user', password: 'test-password' }),
    }));
  });
  it('fails immediately on application-level Auth rejection without retrying credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '驗證失敗' })));
    vi.stubGlobal('fetch', fetch);
    await expect(authJudicial('test-user', 'test-password')).rejects.toThrow('Auth: 驗證失敗');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed tokens and withholds arbitrary error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ Token: {}, error: 'test-password' }))));
    await expect(authJudicial('test-user', 'test-password')).rejects.toThrow('response withheld');
  });
  it('withholds invalid JSON even after network-response retries', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('{test-password')));
    const failure = expect(authJudicial('test-user', 'test-password')).rejects.toThrow('Auth returned invalid JSON (response withheld)');
    await vi.runAllTimersAsync();
    await failure;
  });
  it.each([{ error: '驗證失敗' }, { error: '目前非本 API 服務時間。' }, {}, null])('does not turn a failed JList into a successful empty feed', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(fetchJList('test-token')).rejects.toThrow('JList failed');
  });
  it('accepts a genuine empty day', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')));
    await expect(fetchJList('test-token')).resolves.toEqual([]);
  });
  it('does not treat an expired token as a withdrawn judgment', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '驗證失敗' }))));
    await expect(fetchJDoc('test-token', 'test-jid')).rejects.toThrow('JDoc failed');
  });
  it('recognizes the documented removal response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: '查無資料，本裁判可能未公開或已從系統移除，若您曾經下載過本裁判，亦請您將其移除！謝謝！' }))));
    await expect(fetchJDoc('test-token', 'test-jid')).resolves.toBeNull();
  });
});

describe('flattenJList', () => {
  it('handles the [{DATE,LIST}] shape and de-dupes', () => {
    expect(flattenJList([{ DATE: '20260615', LIST: ['A,1', 'B,2'] }, { DATE: '20260616', LIST: ['B,2', 'C,3'] }]))
      .toEqual(['A,1', 'B,2', 'C,3']);
  });
  it('handles a bare {LIST} and a bare array', () => {
    expect(flattenJList({ LIST: ['X,1'] })).toEqual(['X,1']);
    expect(flattenJList(['Y,1', 'Y,1'])).toEqual(['Y,1']);
  });
  it('handles the REAL lowercase {date,list} shape from the live API', () => {
    expect(flattenJList([{ date: '20260615', list: ['A,1', 'B,2'] }, { date: '20260616', list: ['C,3'] }]))
      .toEqual(['A,1', 'B,2', 'C,3']);
  });
});

// Realistic open-data full text: padded party labels ("被        告") and names that wrap
// across lines ("王\n測試").
const sampleDoc: JDoc = {
  jid: 'TPHM,112,訴,99,20260101,1',
  year: '112', jcase: '訴', no: '99', date: '20260101', title: '貪污治罪條例',
  text: [
    '臺灣高等法院刑事判決                 112 年度訴字第 99 號',
    '公    訴    人   臺灣高等檢察署檢察官',
    '被                 告   王',
    '測試',
    '選任辯護人   陳大律師',
    '主    文   王測試犯貪污罪，處有期徒刑伍年。',
    '事    實   ……',
  ].join('\n'),
};

describe('judgmentFromJDoc', () => {
  it('builds caseReason/caseNumber/date from JDoc fields', () => {
    const j = judgmentFromJDoc(sampleDoc, '2026-06-22');
    expect(j.caseReason).toBe('貪污治罪條例');
    expect(j.caseNumber).toBe('112年度訴字第99號');
    expect(j.judgmentDate).toBe('2026-01-01');
    expect(j.judgmentUrl).toContain('TPHM');
  });
});

describe('defendantZones', () => {
  it('finds the padded/​wrapped defendant name after the label', () => {
    const zones = defendantZones(sampleDoc.text);
    expect(zones.some((z) => z.includes('王測試'))).toBe(true);
  });
});

describe('matchJudgment', () => {
  const mk = (name: string): Target => ({ id: `t-${name}`, name, party: '無', district: '台北市', office: 'councilor', keywords: [], aliases: [] });

  it('matches a target who is the (padded, wrapped) defendant', () => {
    const j = judgmentFromJDoc(sampleDoc, '2026-06-22');
    const hits = matchJudgment(j, sampleDoc.text, [mk('王測試')]);
    expect(hits).toHaveLength(1);
    expect(hits[0].judgment.defendantNames).toEqual(['王測試']);
    expect(hits[0].judgment.match.signals).toContain('name-exact');
  });

  it('does NOT match the prosecutor / lawyer / a non-party', () => {
    const j = judgmentFromJDoc(sampleDoc, '2026-06-22');
    expect(matchJudgment(j, sampleDoc.text, [mk('陳大律師')])).toHaveLength(0);
    expect(matchJudgment(j, sampleDoc.text, [mk('李四')])).toHaveLength(0);
  });
});
