// pnpm run append:candidate-profiles [--apply]：僅新增本機資料，預設唯讀。
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from './lib/loadEnv';
import { planCandidateProfiles, type CandidateProfileBatch, type ProfileState } from './lib/candidateProfileBatch';
async function main() {
  if (process.argv.slice(2).some(a => a !== '--apply')) throw new Error('只接受 --apply；省略時唯讀');
  loadEnv();
  const url = process.env.PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('僅允許本機 Supabase');
  const db = createClient(url, key);
  async function all(table: string) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select('*').order('id').range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) return rows;
    }
  }
  const [officials, sources, careers] = await Promise.all(['officials', 'sources', 'careers'].map(all));
  const existing = { officials, sources, careers } as ProfileState;
  const batch = JSON.parse(readFileSync('scraper/candidate-profiles-confirmed.json', 'utf8')) as CandidateProfileBatch;
  const dir = 'public/data/candidates/2026/county';
  const counties = readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const plan = planCandidateProfiles(batch, counties, existing);
  console.log(`預檢通過：新增 ${plan.officials.length} 人、${plan.sources.length} 來源、${plan.careers.length} 經歷。`);
  if (!process.argv.includes('--apply')) return;
  if (!Object.values(plan).some(rows => rows.length)) { console.log('資料已一致，無需寫入。'); return; }
  const backupDir = join(tmpdir(), 'candidate-profile-backups');
  mkdirSync(backupDir, { recursive: true });
  const backup = join(backupDir, `${Date.now()}.json`);
  writeFileSync(backup, JSON.stringify(existing), { flag: 'wx', mode: 0o600 });
  console.log(`已備份既有 officials／sources／careers：${backup}`);
  // 固定 ID＋先完整預檢＋insert only：中途失敗可接續，不覆寫其他資料。
  async function insertRows<T extends object>(table: string, rows: T[]) {
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from(table).insert(rows.slice(i, i + 100));
      if (error) throw new Error(`${table}: ${error.message}（修正後可重跑接續）`);
    }
  }
  await insertRows('officials', plan.officials);
  await insertRows('sources', plan.sources);
  await insertRows('careers', plan.careers);
  console.log('完成。請執行 export:data 與 build:candidates -- --stage registration。');
}
main().catch(e => { console.error(e); process.exit(1); });
