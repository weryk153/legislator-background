import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dependency): tsx/node do not auto-load .env the way Vite
// does for the Astro build. Populates process.env from the project-root .env for
// values not already set in the real environment.
export function loadEnv(): void {
  try {
    const raw = readFileSync(join(here, '..', '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // no .env present — rely on the real environment
  }
}
