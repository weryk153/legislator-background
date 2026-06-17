import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseLy } from '../adapters/ly';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'ly-sample.json'), 'utf8'));

describe('parseLy', () => {
  it('maps fixture rows to CandidateCareer with a gov source', () => {
    const careers = parseLy(fixture, 'https://ly.govapi.tw/v2/legislators?...', '2026-06-17');
    expect(Array.isArray(careers)).toBe(true);
    expect(careers.length).toBeGreaterThan(0);
    for (const c of careers) {
      expect(c.organization.length).toBeGreaterThan(0);
      expect(c.source.type).toBe('gov');
      expect(c.source.url).toContain('http');
    }
  });
});
