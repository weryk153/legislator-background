import { describe, it, expect } from 'vitest';
import { loadTargets } from '../lib/targets';

describe('loadTargets', () => {
  it('loads 13 targets with unique ids and required fields', () => {
    const targets = loadTargets();
    expect(targets).toHaveLength(13);
    const ids = new Set(targets.map((t) => t.id));
    expect(ids.size).toBe(13);
    for (const t of targets) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.party.length).toBeGreaterThan(0);
      expect(Array.isArray(t.keywords)).toBe(true);
      expect(Array.isArray(t.aliases)).toBe(true);
    }
  });
});
