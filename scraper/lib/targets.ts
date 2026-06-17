import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Target } from './types';

const here = dirname(fileURLToPath(import.meta.url));

export function loadTargets(): Target[] {
  const raw = readFileSync(join(here, '..', 'targets.json'), 'utf8');
  const targets = JSON.parse(raw) as Target[];
  const ids = new Set<string>();
  for (const t of targets) {
    if (!t.id || !t.name || !t.party) throw new Error(`Invalid target: ${JSON.stringify(t)}`);
    if (ids.has(t.id)) throw new Error(`Duplicate target id: ${t.id}`);
    ids.add(t.id);
  }
  return targets;
}
