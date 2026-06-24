import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GraphData } from './types';

// Build-time only (imported by .astro, NOT by the Svelte island). Missing file → empty graph,
// so the site builds before any relationship has been seeded.
export function loadGraph(): GraphData {
  try {
    const path = join(process.cwd(), 'src', 'data', 'graph.json');
    return JSON.parse(readFileSync(path, 'utf8')) as GraphData;
  } catch {
    return { nodes: [], edges: [] };
  }
}
