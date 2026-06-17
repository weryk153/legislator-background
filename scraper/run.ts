import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTargets } from './lib/targets';
import { buildReviewFile } from './lib/review';
import { lyAdapter } from './adapters/ly';
import { cecAdapter } from './adapters/cec';
import { cyAdapter } from './adapters/cy';
import { judgmentsAdapter } from './adapters/judgments';
import type { SourceAdapter } from './lib/types';

const here = dirname(fileURLToPath(import.meta.url));
const adapters: SourceAdapter[] = [lyAdapter, cecAdapter, cyAdapter, judgmentsAdapter];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

async function main() {
  const only = arg('only');
  const sourceFilter = arg('source');
  const dryRun = process.argv.includes('--dry-run');
  const outDir = join(here, 'out');
  mkdirSync(outDir, { recursive: true });

  const targets = loadTargets().filter((t) => !only || t.id === only);
  const active = adapters.filter((a) => !sourceFilter || a.name === sourceFilter);

  for (const target of targets) {
    const results = [];
    for (const adapter of active) {
      results.push(await adapter.fetchFor(target));
    }
    const review = buildReviewFile(target, results, new Date().toISOString());
    const summary = review.report.map((r) => `${r.source}:${r.ok ? 'ok' : 'FAIL'}(${JSON.stringify(r.counts)})`).join(' ');
    console.log(`${target.name} → ${summary}`);
    if (!dryRun) writeFileSync(join(outDir, `${target.id}.json`), JSON.stringify(review, null, 2));
  }
  console.log(dryRun ? '(dry-run: no files written)' : `Wrote ${targets.length} review file(s) to scraper/out/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
