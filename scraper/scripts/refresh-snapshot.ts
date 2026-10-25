// Full factual refresh, without rebuilding people from an empty database.
// Output is committed only after every target has been fetched and validated.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadTargets } from '../lib/targets';
import { buildReviewFile } from '../lib/review';
import { refreshSnapshot } from '../lib/refreshSnapshot';
import { lyAdapter } from '../adapters/ly';
import { cecAdapter } from '../adapters/cec';
import { cyAdapter } from '../adapters/cy';
import type { Official } from '../../src/lib/types';
import type { ReviewFile } from '../lib/types';

const output = join(process.cwd(), 'scraper/out-refresh');
mkdirSync(output, { recursive: true });
const startedAt = new Date().toISOString();
const snapshotPath = join(process.cwd(), 'src/data/officials.json');
const baseline = readFileSync(snapshotPath, 'utf8');
const snapshot: Official[] = JSON.parse(baseline);
const targets = loadTargets();
const renames = JSON.parse(readFileSync(join(process.cwd(), 'scraper/roster-confirmed.json'), 'utf8'));
const reviews: ReviewFile[] = [];
const failures: Array<{ targetId: string; source: string; error?: string }> = [];
const reportPath = join(output, 'status.json');

async function main() {
  rmSync(reportPath, { force: true });
  rmSync(join(output, 'failure.json'), { force: true });
  // Three bounded workers; each worker fetches sources sequentially. Checkpoints
  // are for inspection only and are never reused as fresh network results.
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor++;
      const target = targets[index];
      const adapters = target.office === 'legislator' ? [lyAdapter, cecAdapter, cyAdapter] : [cecAdapter, cyAdapter];
      const results = [];
      for (const adapter of adapters) {
        let result = await adapter.fetchFor(target);
        if (!result.ok) {
          // A transient HTML/error response must not publish a partial snapshot.
          // Retry the failed source once, with a pause, before failing the batch.
          console.warn(`${target.id}: retrying ${adapter.name} after a failed check`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          result = await adapter.fetchFor(target);
        }
        results.push(result);
      }
      const review = buildReviewFile(target, results, new Date().toISOString());
      reviews.push(review);
      for (const r of results) if (!r.ok) failures.push({ targetId: target.id, source: r.source, error: r.error });
      writeFileSync(join(output, `${target.id}.json`), JSON.stringify(review));
      console.log(`${index + 1}/${targets.length} ${target.name}: ${results.map(r => `${r.source}:${r.ok ? 'ok' : 'FAIL'}`).join(' ')}`);
    }
  }
  await Promise.all(Array.from({ length: 3 }, () => worker()));
  // Completion order depends on network latency; published ordering must not.
  reviews.sort((a, b) => a.targetId.localeCompare(b.targetId));
  const result = refreshSnapshot(snapshot, reviews, targets, renames);
  const status = { startedAt, finishedAt: new Date().toISOString(), targets: targets.length, reviewed: reviews.length, failures, ...result.stat, changed: result.changed, published: false };
  writeFileSync(reportPath, JSON.stringify(status, null, 2) + '\n');
  if (failures.length) throw new Error(`${failures.length} source checks failed; snapshot and dates unchanged. See ${reportPath}`);
  if (readFileSync(snapshotPath, 'utf8') !== baseline) throw new Error('Snapshot changed during refresh; refusing to overwrite concurrent edits');
  if (result.changed) {
    const metaPath = join(process.cwd(), 'src/data/meta.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    writeFileSync(snapshotPath, JSON.stringify(result.officials));
    // Date of a changed snapshot, not merely a job/build attempt.
    writeFileSync(metaPath, JSON.stringify({ ...meta, generatedAt: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }), officials: result.officials.length }, null, 2) + '\n');
  }
  status.published = true;
  writeFileSync(reportPath, JSON.stringify(status, null, 2) + '\n');
  console.log(JSON.stringify(status));
}

main().catch(e => {
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ startedAt, failedAt: new Date().toISOString(), reviewed: reviews.length, targets: targets.length, error: e instanceof Error ? e.message : String(e) }, null, 2) + '\n');
  console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1;
});
