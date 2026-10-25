// 司法院開放資料判決 feed runner.
//
//   pnpm run judicial:measure   # auth + JList only — report how many judgments changed today
//   pnpm run judicial:feed       # + fetch each new judgment, match the roster, accumulate candidates
//   pnpm run judicial:feed -- --max=500   # cap JDoc fetches (the API window is 00–06 Taipei)
//
// Output (review-only — NEVER auto-published):
//   scraper/out-judicial/candidates.json  matched judgments awaiting human approval
//   scraper/out-judicial/.seen.json        processed jids, so reruns don't refetch (accumulates)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadTargets } from './lib/targets';
import { loadEnv } from './lib/loadEnv';
import { authJudicial, fetchJList, fetchJDoc, judgmentFromJDoc, matchJudgment, judgmentUrl } from './lib/judicial-feed';

loadEnv();

const argVal = (name: string): string | undefined => {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : undefined;
};
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const OUT_DIR = join(process.cwd(), 'scraper', 'out-judicial');
const SEEN_FILE = join(OUT_DIR, '.seen.json');
const CAND_FILE = join(OUT_DIR, 'candidates.json');

async function main() {
  const user = process.env.JUDICIAL_API_USER;
  const password = process.env.JUDICIAL_API_PASSWORD;
  if (!user || !password) throw new Error('Missing JUDICIAL_API_USER / JUDICIAL_API_PASSWORD');

  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (hour >= 6) throw new Error('Outside judicial API service hours (00:00–06:00 Asia/Taipei); no freshness update. Retry during the next service window.');

  const token = await authJudicial(user, password);
  const jids = await fetchJList(token);
  console.log(`JList: ${jids.length} changed judgments in the feed`);
  if (hasFlag('measure')) return;

  mkdirSync(OUT_DIR, { recursive: true });
  const seen: Record<string, string | 1> = existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, 'utf8')) : {};
  let cands: Array<{ judgment?: { judgmentUrl?: string }; [key: string]: unknown }> = existsSync(CAND_FILE) ? JSON.parse(readFileSync(CAND_FILE, 'utf8')) : [];
  const targets = loadTargets();
  const max = Number(argVal('max') ?? jids.length);
  const retrievedAt = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });

  const save = () => { writeFileSync(SEEN_FILE, JSON.stringify(seen)); writeFileSync(CAND_FILE, JSON.stringify(cands, null, 2)); };

  let fetched = 0;
  let matched = 0;
  let failed = 0;
  const failedJids: string[] = [];
  for (const jid of jids) {
    // A repeated jid on another day's change list may be amended or withdrawn.
    // Legacy markers (1) deliberately trigger one fresh fetch after this upgrade.
    if (seen[jid] === retrievedAt || fetched >= max) continue;
    let doc;
    try { doc = await fetchJDoc(token, jid); } catch (e) {
      failed++; failedJids.push(jid);
      console.warn(`JDoc ${jid} failed: ${e instanceof Error ? e.message : e}`);
      await new Promise(r => setTimeout(r, 200));
      continue;
    }
    fetched += 1;
    seen[jid] = retrievedAt;
    // Only this generated review queue changes; published curated judgments do not.
    cands = cands.filter(c => c.judgment?.judgmentUrl !== judgmentUrl(jid));
    if (!doc || !doc.text) { if (fetched % 200 === 0) save(); await new Promise(r => setTimeout(r, 200)); continue; }
    const j = judgmentFromJDoc(doc, retrievedAt);
    for (const m of matchJudgment(j, doc.text, targets)) {
      cands.push({ approved: false, status: 'needs_review', targetId: m.target.id, targetName: m.target.name, judgment: m.judgment });
      matched += 1;
      console.log(`MATCH ${m.target.name} ← ${j.caseNumber} 「${j.caseReason}」 conf=${m.judgment.match.confidence.toFixed(2)}`);
    }
    if (fetched % 200 === 0) { save(); console.log(`… ${fetched} fetched, ${matched} matched`); }
    await new Promise((r) => setTimeout(r, 200)); // politeness between JDoc calls
  }
  save();
  const remaining = jids.filter(jid => seen[jid] !== retrievedAt).length;
  writeFileSync(join(OUT_DIR, 'coverage.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), feedDate: retrievedAt,
    runId: process.env.GITHUB_RUN_ID ?? null, listed: jids.length, fetched, matched,
    failed, remaining, failedJids,
  }, null, 2) + '\n');
  console.log(`Feed done. fetched:${fetched} matched:${matched} total-candidates:${cands.length} failed:${failed} remaining:${remaining}`);
  if (failed || remaining) throw new Error(`Feed incomplete: ${failed} failed, ${remaining} still pending. Progress saved locally; data remains stale.`);
}

main().catch((e) => {
  // Network failures are distinct from application-level credential rejection.
  const code = e?.cause?.code;
  console.error(code === 'UND_ERR_CONNECT_TIMEOUT'
    ? 'Judicial API connection timed out before authentication. Check runner connectivity; credentials were not validated. Try the workflow runner option during service hours.'
    : e instanceof Error ? e.message : 'Judicial feed failed (details withheld)');
  process.exit(1);
});
