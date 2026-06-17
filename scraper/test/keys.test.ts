import { describe, it, expect } from 'vitest';
import { judgmentKey, assetKey, careerKey } from '../lib/keys';

describe('natural keys', () => {
  it('judgmentKey uses court + case number', () => {
    expect(judgmentKey({ court: '臺北地院', caseNumber: '111易1' })).toBe('臺北地院|111易1');
  });
  it('assetKey uses target + year', () => {
    expect(assetKey('han-kuo-yu', { year: 2024 })).toBe('han-kuo-yu|2024');
  });
  it('careerKey uses target + organization + startDate', () => {
    expect(careerKey('a1', { organization: '台北市議會', startDate: '2014' })).toBe('a1|台北市議會|2014');
  });
});
