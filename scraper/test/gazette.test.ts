import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseDeclaration, parseGazetteAmount } from '../lib/gazette';

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, '..', 'fixtures', 'gazette-sample.txt'), 'utf8');

describe('parseGazetteAmount', () => {
  it('strips separators', () => {
    expect(parseGazetteAmount('新臺幣 1,234,567 元')).toBe(1234567);
    expect(parseGazetteAmount('—')).toBe(0);
  });
});

describe('parseDeclaration', () => {
  it('extracts category items with positive amounts from a real block', () => {
    const items = parseDeclaration(text, '楊金龍');
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(['land', 'building', 'cash', 'deposit', 'securities', 'investment', 'claim', 'debt', 'other']).toContain(it.category);
      expect(it.amount).toBeGreaterThan(0);
    }
    expect(items.some((i) => i.category === 'deposit')).toBe(true);
  });

  it('returns [] when the name is not in the text', () => {
    expect(parseDeclaration(text, '查無此人')).toEqual([]);
  });
});
