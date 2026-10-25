import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const script = resolve('scraper/scripts/judicial-artifact-status.mjs');
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));

function run(feed: string, measure: string, previous?: object, candidates = true) {
  const root = mkdtempSync(join(tmpdir(), 'judicial-status-'));
  roots.push(root);
  const dir = join(root, 'scraper/out-judicial');
  mkdirSync(dir, { recursive: true });
  const candidateText = '[{"approved":false,"status":"needs_review"}]';
  if (candidates) writeFileSync(join(dir, 'candidates.json'), candidateText);
  if (previous) writeFileSync(join(dir, 'status.json'), JSON.stringify(previous));
  const summary = join(root, 'summary.md');
  const result = spawnSync(process.execPath, [script], {
    cwd: root, encoding: 'utf8', env: {
      ...process.env, FEED_OUTCOME: feed, MEASURE_OUTCOME: measure,
      GITHUB_RUN_ID: '456', GITHUB_RUN_ATTEMPT: '2', MAX_FETCH: '3000',
      RESTORED_CACHE_KEY: 'judicial-state-123', GITHUB_STEP_SUMMARY: summary,
    },
  });
  expect(result.status, result.stderr).toBe(0);
  if (candidates) expect(readFileSync(join(dir, 'candidates.json'), 'utf8')).toBe(candidateText);
  return { status: JSON.parse(readFileSync(join(dir, 'status.json'), 'utf8')), summary: readFileSync(summary, 'utf8') };
}

describe('judicial artifact freshness', () => {
  it('marks legacy restored candidates stale when Auth fails, without inventing a success date', () => {
    const { status, summary } = run('skipped', 'failure');
    expect(status).toMatchObject({ stale: true, lastSuccessfulFeedAt: null, lastSuccessfulFeedRunId: null,
      restoredCacheKey: 'judicial-state-123', candidatesPresent: true });
    expect(summary).toContain('STALE');
  });
  it('does not advance freshness on measure-only success', () => {
    const previous = { lastSuccessfulFeedAt: '2026-09-08T21:09:23Z', lastSuccessfulFeedRunId: '123' };
    expect(run('skipped', 'success', previous).status).toMatchObject({ ...previous, stale: true });
  });
  it.each(['failure', 'cancelled'])('marks a %s feed stale and retains last successful provenance', feed => {
    const previous = { lastSuccessfulFeedAt: '2026-09-08T21:09:23Z', lastSuccessfulFeedRunId: '123' };
    expect(run(feed, 'success', previous).status).toMatchObject({ ...previous, stale: true, feedOutcome: feed });
  });
  it('records a completed feed even when it adds no candidates', () => {
    const { status, summary } = run('success', 'success');
    expect(status).toMatchObject({ stale: false, lastSuccessfulFeedRunId: '456', runAttempt: '2', maxFetch: '3000' });
    expect(status.lastSuccessfulFeedAt).toBe(status.checkedAt);
    expect(summary).toContain('does not imply full historical coverage');
  });
  it('writes a status artifact on first-run failure with no cached candidates', () => {
    expect(run('', '', undefined, false).status).toMatchObject({ stale: true, candidatesPresent: false, feedOutcome: 'skipped' });
  });
});
