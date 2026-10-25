import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseLy, parseOfficialLy } from '../adapters/ly';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, '..', 'fixtures', 'ly-sample.json'), 'utf8'));

describe('parseLy', () => {
  it('maps official ID16 fields and isolates the requested name and term', () => {
    const rows = [
      { term: '11', name: '王測試', onboardDate: '2024/02/01', leaveDate: '', committee: '第11屆第6會期：內政委員會;', experience: '議員;理事;  ;' },
      { term: '10', name: '王測試', experience: '不同屆資料' },
      { term: '11', name: '李測試', experience: '別人的經歷' },
    ];
    const careers = parseOfficialLy(rows, '王測試', '2026-10-26');
    expect(careers).toHaveLength(4);
    expect(careers[0]).toMatchObject({ startDate: '2024-02-01', endDate: null });
    expect(careers[1]).toMatchObject({ organization: '內政委員會', startDate: '第11屆第6會期' });
    expect(careers.every(c => c.source.url.startsWith('https://data.ly.gov.tw/'))).toBe(true);
    expect(JSON.stringify(careers)).not.toContain('別人的經歷');
  });
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
