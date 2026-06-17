import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCec } from '../adapters/cec';

const here = dirname(fileURLToPath(import.meta.url));
// Real response from the 中選會 選舉資料庫 candidate-query API (JSON), see adapters/cec.ts header.
const fixture = readFileSync(join(here, '..', 'fixtures', 'cec-sample.json'), 'utf8');

describe('parseCec', () => {
  it('extracts 學經歷 rows as CandidateCareer with a gov source', () => {
    const careers = parseCec(fixture, 'https://db.cec.gov.tw/query/api/v1/elections/candidates/query?cand_name=...', '2026-06-17');
    expect(careers.length).toBeGreaterThan(0);
    for (const c of careers) {
      expect(c.organization.length).toBeGreaterThan(0);
      expect(c.source.type).toBe('gov');
      expect(c.source.url).toContain('http');
      expect(c.source.retrievedAt).toBe('2026-06-17');
    }
  });
});
