import { describe, it, expect } from 'vitest';
import { officialIdIn, resolveSubject, resolveCounterpart, type Roster, type EndpointRow } from '../scraper/lib/relEndpoints';

const roster: Roster = [
  { id: 'L1', name: '傅崐萁', office_type: 'legislator' },
  { id: 'M1', name: '徐榛蔚', office_type: 'mayor_magistrate' },
  { id: 'C1', name: '張美慧', office_type: 'councilor' },
  { id: 'C2', name: '王小明', office_type: 'councilor' },
  { id: 'C3', name: '王小明', office_type: 'councilor' },
];
const row = (over: Partial<EndpointRow> = {}): EndpointRow => ({
  subject: '傅崐萁', counterpartName: '徐榛蔚', counterpartKind: 'official', ...over,
});

describe('officialIdIn', () => {
  it('唯一匹配才回 id；同名多人回 null', () => {
    expect(officialIdIn(roster, '傅崐萁')).toBe('L1');
    expect(officialIdIn(roster, '王小明')).toBeNull();
    expect(officialIdIn(roster, '沒有人')).toBeNull();
  });
  it('restrict 只看立委／首長', () => {
    expect(officialIdIn(roster, '張美慧')).toBe('C1');
    expect(officialIdIn(roster, '張美慧', true)).toBeNull();
  });
});

describe('resolveSubject', () => {
  const cache = new Map([['柯文哲', 'E1'], ['李傑::學者', 'E2']]);
  it('預設（official）限立委／首長', () => {
    expect(resolveSubject(row(), roster, cache)).toEqual({ type: 'official', id: 'L1' });
    expect(resolveSubject(row({ subject: '張美慧' }), roster, cache)).toEqual({ skip: 'subject 未匹配: 張美慧' });
  });
  it('subjectKind entity 從快取找 name / name::distinct', () => {
    expect(resolveSubject(row({ subject: '柯文哲', subjectKind: 'entity' }), roster, cache)).toEqual({ type: 'entity', id: 'E1' });
    expect(resolveSubject(row({ subject: '李傑', subjectKind: 'entity', subjectDistinct: '學者' }), roster, cache)).toEqual({ type: 'entity', id: 'E2' });
  });
  it('entity subject 不在快取 → skip，不建新 entity', () => {
    expect(resolveSubject(row({ subject: '李傑', subjectKind: 'entity' }), roster, cache)).toEqual({ skip: 'subject entity 尚未建立: 李傑' });
    expect(resolveSubject(row({ subject: '李傑', subjectKind: 'entity', subjectDistinct: '國防部長' }), roster, cache))
      .toEqual({ skip: 'subject entity 尚未建立: 李傑::國防部長' });
  });
});

describe('resolveCounterpart', () => {
  it('official 且名冊唯一匹配（不限層級）→ official', () => {
    expect(resolveCounterpart(row(), roster)).toEqual({ type: 'official', id: 'M1' });
    expect(resolveCounterpart(row({ counterpartName: '張美慧' }), roster)).toEqual({ type: 'official', id: 'C1' });
  });
  it('counterpartDistinct 一律 entity，且不算 fell-through', () => {
    expect(resolveCounterpart(row({ counterpartName: '張美慧', counterpartDistinct: '企業高管' }), roster))
      .toEqual({ type: 'entity', fellThrough: false });
  });
  it('official 但名冊無唯一匹配 → entity 並標 fellThrough', () => {
    expect(resolveCounterpart(row({ counterpartName: '柯文哲' }), roster)).toEqual({ type: 'entity', fellThrough: true });
    expect(resolveCounterpart(row({ counterpartName: '王小明' }), roster)).toEqual({ type: 'entity', fellThrough: true });
  });
  it('counterpartKind entity → entity，不查名冊、不算 fell-through', () => {
    expect(resolveCounterpart(row({ counterpartName: '徐榛蔚', counterpartKind: 'entity' }), roster)).toEqual({ type: 'entity', fellThrough: false });
  });
});
