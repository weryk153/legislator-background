import { describe, it, expect } from 'vitest';
import { ELECTION_MILESTONES, timelineProgress, taipeiToday } from '../src/lib/candidateTypes';

describe('選務時程軸', () => {
  it('節點依日期先後排列，區間節點 start ≤ end', () => {
    for (const m of ELECTION_MILESTONES) expect(m.start <= m.end).toBe(true);
    for (let i = 1; i < ELECTION_MILESTONES.length; i++) {
      expect(ELECTION_MILESTONES[i - 1].end < ELECTION_MILESTONES[i].start).toBe(true);
    }
  });

  it('登記結束後、審定前：登記已過，今天標記落在登記與審定之間', () => {
    const p = timelineProgress(ELECTION_MILESTONES, '2026-10-05');
    expect(p.states).toEqual(['done', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(p.todayAfter).toBe(0);
  });

  it('登記期間內：登記為 current，不另畫今天標記', () => {
    const p = timelineProgress(ELECTION_MILESTONES, '2026-09-02');
    expect(p.states[0]).toBe('current');
    expect(p.todayAfter).toBeNull();
  });

  it('單日節點當天為 current，隔天才算已過', () => {
    expect(timelineProgress(ELECTION_MILESTONES, '2026-10-23').states[2]).toBe('current');
    const next = timelineProgress(ELECTION_MILESTONES, '2026-10-24');
    expect(next.states.slice(0, 3)).toEqual(['done', 'done', 'done']);
    expect(next.todayAfter).toBe(2);
  });

  it('公告期間（11/12～11/17）之間仍算公告節點進行中', () => {
    const p = timelineProgress(ELECTION_MILESTONES, '2026-11-14');
    expect(p.states[3]).toBe('current');
    expect(p.todayAfter).toBeNull();
  });

  it('早於第一個節點 → -1；投票後 → 最後一個節點之後', () => {
    expect(timelineProgress(ELECTION_MILESTONES, '2026-08-01').todayAfter).toBe(-1);
    const after = timelineProgress(ELECTION_MILESTONES, '2026-12-01');
    expect(after.states.every((s) => s === 'done')).toBe(true);
    expect(after.todayAfter).toBe(ELECTION_MILESTONES.length - 1);
  });

  it('建置日期以臺灣時區計：UTC 前一天 16:00 已是臺灣隔天', () => {
    expect(taipeiToday(new Date('2026-10-04T16:30:00Z'))).toBe('2026-10-05');
    expect(taipeiToday(new Date('2026-10-04T15:59:00Z'))).toBe('2026-10-04');
  });
});
