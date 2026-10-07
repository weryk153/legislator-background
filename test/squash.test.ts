import { describe, it, expect } from 'vitest';
import { squashWidth, squashStyle, fitStyle } from '../src/lib/squash';

describe('squashWidth', () => {
  it('全形字每字 1em', () => {
    expect(squashWidth('政治人物背景資料庫')).toBe(9);
    expect(squashWidth('縣長・議員選舉')).toBe(7);
  });
  it('半形數字與拉丁字每字 0.56em，避免負 margin 吃掉後面的字', () => {
    expect(squashWidth('2026')).toBe(2.24);
    expect(squashWidth('第1選舉區')).toBe(4.56);
  });
  it('空字串為 0', () => {
    expect(squashWidth('')).toBe(0);
  });
});

describe('squashStyle', () => {
  it('帶出壓扁比例與寬度', () => {
    expect(squashStyle('名冊')).toBe('--k:0.7;--n:2');
    expect(squashStyle('澎湖縣', 0.62)).toBe('--k:0.62;--n:3');
  });
});

describe('fitStyle', () => {
  it('長字串在窄螢幕縮字：font-size 取 maxPx 與 (100vw - reserve) / (n*k) 的較小者', () => {
    expect(fitStyle('政治獻金', 0.62, 84, 120)).toBe('--k:0.62;--n:4;font-size:min(84px, calc((100vw - 120px) / 2.48))');
  });
});
