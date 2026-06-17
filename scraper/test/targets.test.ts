import { describe, it, expect } from 'vitest';
import { loadTargets } from '../lib/targets';

describe('loadTargets', () => {
  it('loads the full roster with unique ids and required fields', () => {
    const targets = loadTargets();
    expect(targets.length).toBeGreaterThan(100); // full 第11屆 roster (~113 serving)
    const ids = new Set(targets.map((t) => t.id));
    expect(ids.size).toBe(targets.length); // all ids unique
    for (const t of targets) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.party.length).toBeGreaterThan(0);
      expect(Array.isArray(t.keywords)).toBe(true);
      expect(Array.isArray(t.aliases)).toBe(true);
    }
  });
});
