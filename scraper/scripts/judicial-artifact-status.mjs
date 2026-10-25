// Runs with plain Node even when dependency installation / auth failed.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'scraper', 'out-judicial');
const statusPath = join(dir, 'status.json');
let previous;
try { previous = JSON.parse(readFileSync(statusPath, 'utf8')); } catch { /* legacy / no cache */ }
const completed = process.env.FEED_OUTCOME === 'success';
const checkedAt = new Date().toISOString();
const runId = process.env.GITHUB_RUN_ID ?? null;
const status = {
  schemaVersion: 1,
  checkedAt,
  runId,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  stale: !completed,
  measureOutcome: process.env.MEASURE_OUTCOME || 'skipped',
  feedOutcome: process.env.FEED_OUTCOME || 'skipped',
  restoredCacheKey: process.env.RESTORED_CACHE_KEY || null,
  lastSuccessfulFeedAt: completed ? checkedAt : previous?.lastSuccessfulFeedAt ?? null,
  lastSuccessfulFeedRunId: completed ? runId : previous?.lastSuccessfulFeedRunId ?? null,
  candidatesPresent: existsSync(join(dir, 'candidates.json')),
  maxFetch: process.env.MAX_FETCH ?? null,
  note: completed
    ? 'The current feed list completed this run. Candidates accumulate across runs; completion does not imply full historical coverage. Human review is required.'
    : 'STALE: feed did not complete this run. Candidates may be restored or partially processed. Upload time is not data freshness. Null last-success fields mean unknown (legacy or no cache).',
};
mkdirSync(dir, { recursive: true });
writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
const summary = `Judicial candidates: ${status.stale ? 'STALE' : 'feed completed'}\n\n${status.note}\n\nLast successful feed: ${status.lastSuccessfulFeedAt ?? 'unknown'} (run ${status.lastSuccessfulFeedRunId ?? 'unknown'}).\nRestored cache: ${status.restoredCacheKey ?? 'none'}.\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
