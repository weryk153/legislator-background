// corp_donations + donation_reports → public/data/donors.json(/donors 頁 client fetch)。
// officials 索引 = 有獻金報告的現任(雙向搜尋的「政治人物」側)。
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './lib/loadEnv';

loadEnv();
const here = dirname(fileURLToPath(import.meta.url));

async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function main() {
  const sb = createClient(process.env.PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  type Rep = { official_id: string; election_name: string; total_income: number; officials: { name: string; slug: string; party: string; office_type: string; district: string } };
  const reps = await fetchAll<Rep>((a, b) => sb.from('donation_reports')
    .select('official_id, election_name, total_income, officials!inner(name, slug, party, office_type, district)').order('id', { ascending: true }).range(a, b));

  const offAgg = new Map<string, { name: string; slug: string; party: string; officeType: string; district: string; totalIncome: number }>();
  const offMeta = new Map<string, { slug: string; party: string; officeType: string }>();
  for (const r of reps) {
    const o = r.officials;
    offMeta.set(r.official_id, { slug: o.slug, party: o.party, officeType: o.office_type });
    const cur = offAgg.get(r.official_id);
    if (cur) cur.totalIncome += r.total_income;
    else offAgg.set(r.official_id, { name: o.name, slug: o.slug, party: o.party, officeType: o.office_type, district: o.district, totalIncome: r.total_income });
  }

  type Corp = { donor_uid: string; donor_name: string; recipient_name: string; election_name: string; amount: number; official_id: string | null };
  const corp = await fetchAll<Corp>((a, b) => sb.from('corp_donations')
    .select('donor_uid, donor_name, recipient_name, election_name, amount, official_id').order('id', { ascending: true }).range(a, b));

  const donorMap = new Map<string, { uid: string; name: string; total: number; recipients: { name: string; election: string; amount: number; slug: string | null; party: string | null; officeType: string | null }[] }>();
  for (const c of corp) {
    const meta = c.official_id ? offMeta.get(c.official_id) : undefined;
    const d = donorMap.get(c.donor_uid) ?? { uid: c.donor_uid, name: c.donor_name, total: 0, recipients: [] };
    d.total += c.amount;
    d.recipients.push({ name: c.recipient_name, election: c.election_name, amount: c.amount, slug: meta?.slug ?? null, party: meta?.party ?? null, officeType: meta?.officeType ?? null });
    donorMap.set(c.donor_uid, d);
  }
  const donors = [...donorMap.values()];
  for (const d of donors) d.recipients.sort((a, b) => b.amount - a.amount);
  donors.sort((a, b) => b.total - a.total);
  const officials = [...offAgg.values()].sort((a, b) => b.totalIncome - a.totalIncome);
  const elections = [...new Set(corp.map((c) => c.election_name))].sort();

  const outDir = join(here, '..', 'public', 'data');
  mkdirSync(outDir, { recursive: true });
  const payload = { generatedAt: new Date().toISOString().slice(0, 10), elections, officials, donors };
  writeFileSync(join(outDir, 'donors.json'), JSON.stringify(payload));
  console.log(`exported ${donors.length} donors / ${officials.length} officials → public/data/donors.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
