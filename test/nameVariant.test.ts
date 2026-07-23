import { describe, it, expect } from 'vitest';
import { normalizeNameChars } from '../src/lib/nameVariant';

describe('normalizeNameChars', () => {
  it('姍/姗 雙向正規化為「姍」', () => {
    expect(normalizeNameChars('戴瑋姍')).toBe('戴瑋姍');
    expect(normalizeNameChars('戴瑋姗')).toBe('戴瑋姍');
  });

  it('台/臺 雙向正規化為「臺」', () => {
    expect(normalizeNameChars('臺中市')).toBe('臺中市');
    expect(normalizeNameChars('台中市')).toBe('臺中市');
  });

  it('峯/峰 雙向正規化為「峰」', () => {
    expect(normalizeNameChars('王大峰')).toBe('王大峰');
    expect(normalizeNameChars('王大峯')).toBe('王大峰');
  });

  it('恒/恆 雙向正規化為「恆」', () => {
    expect(normalizeNameChars('李永恆')).toBe('李永恆');
    expect(normalizeNameChars('李永恒')).toBe('李永恆');
  });

  it('間隔號變體（・·．˙･）統一為 ‧', () => {
    expect(normalizeNameChars('國民黨・立委')).toBe('國民黨‧立委');
    expect(normalizeNameChars('國民黨·立委')).toBe('國民黨‧立委');
    expect(normalizeNameChars('國民黨．立委')).toBe('國民黨‧立委');
    expect(normalizeNameChars('國民黨˙立委')).toBe('國民黨‧立委');
    expect(normalizeNameChars('國民黨･立委')).toBe('國民黨‧立委');
  });

  it('去除首尾空白', () => {
    expect(normalizeNameChars('  戴瑋姗  ')).toBe('戴瑋姍');
  });

  it('不影響不含異體字的一般姓名', () => {
    expect(normalizeNameChars('陳一')).toBe('陳一');
  });
});
