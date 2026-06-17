import { describe, it, expect } from 'vitest';
import { scoreMatch } from '../match/score';

const target = { name: '徐巧芯', keywords: ['台北市', '大安', '台北市議會'], aliases: [] };

describe('scoreMatch', () => {
  it('name-only match stays low confidence (same-name risk)', () => {
    const r = scoreMatch({ candidateName: '徐巧芯', text: '與本案無關之內容' }, target);
    expect(r.signals).toContain('name-exact');
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('name plus corroborating keywords raises confidence', () => {
    const r = scoreMatch({ candidateName: '徐巧芯', text: '被告現為台北市議會議員，居住於大安區' }, target);
    expect(r.confidence).toBeGreaterThan(0.7);
    expect(r.signals).toContain('keyword:大安');
  });

  it('no name match yields zero', () => {
    const r = scoreMatch({ candidateName: '王小明', text: '台北市大安' }, target);
    expect(r.confidence).toBe(0);
    expect(r.signals).toEqual([]);
  });

  it('confidence never exceeds 1', () => {
    const many = { name: 'X', keywords: ['a', 'b', 'c', 'd', 'e'], aliases: [] };
    const r = scoreMatch({ candidateName: 'X', text: 'a b c d e' }, many);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});
