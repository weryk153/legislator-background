import { describe, it, expect } from 'vitest';
import { flattenJList, judgmentFromJDoc, matchJudgment, defendantZones, type JDoc } from '../lib/judicial-feed';
import type { Target } from '../lib/types';

describe('flattenJList', () => {
  it('handles the [{DATE,LIST}] shape and de-dupes', () => {
    expect(flattenJList([{ DATE: '20260615', LIST: ['A,1', 'B,2'] }, { DATE: '20260616', LIST: ['B,2', 'C,3'] }]))
      .toEqual(['A,1', 'B,2', 'C,3']);
  });
  it('handles a bare {LIST} and a bare array', () => {
    expect(flattenJList({ LIST: ['X,1'] })).toEqual(['X,1']);
    expect(flattenJList(['Y,1', 'Y,1'])).toEqual(['Y,1']);
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
