// 營利事業捐贈全量彙總（/donors 反查用）。統編（8碼明碼）為公司主鍵：
// 同統編的名稱變體（漏字/簡寫）合併，取最長字串為正規名。統編無效的極少數列
// （2026-07 實測 20,288 列中僅 1 列）以 'name:<公司名>' 為鍵，避免與他公司誤併。
import type { DonationRow } from './ardata';

export interface CorpDonation {
  donorUid: string; donorName: string;
  recipientName: string; electionName: string; amount: number;
}

const UID_RE = /^\d{8}$/;

export function aggregateCorpDonations(rows: DonationRow[]): CorpDonation[] {
  const canonical = new Map<string, string>();          // uid → 最長名稱
  const sums = new Map<string, CorpDonation>();         // uid|recipient|election → 累計
  for (const r of rows) {
    if (r.category !== '營利事業捐贈收入' || r.income <= 0 || !r.counterparty) continue;
    const uid = UID_RE.test(r.idNumber) ? r.idNumber : `name:${r.counterparty}`;
    const prev = canonical.get(uid) ?? '';
    if (r.counterparty.length > prev.length) canonical.set(uid, r.counterparty);
    const key = `${uid}|${r.account}|${r.electionName}`;
    const cur = sums.get(key);
    if (cur) cur.amount += r.income;
    else sums.set(key, { donorUid: uid, donorName: '', recipientName: r.account, electionName: r.electionName, amount: r.income });
  }
  const out = [...sums.values()];
  for (const c of out) c.donorName = canonical.get(c.donorUid)!;
  return out;
}
