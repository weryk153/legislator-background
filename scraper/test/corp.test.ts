import { describe, it, expect } from 'vitest';
import { aggregateCorpDonations } from '../lib/corp';
import type { DonationRow } from '../lib/ardata';

const row = (over: Partial<DonationRow>): DonationRow => ({
  account: '王測試', electionName: '113年立法委員選舉', reportSeq: '首次申報',
  category: '營利事業捐贈收入', counterparty: '甲公司', idNumber: '11111111',
  income: 100000, expense: 0, ...over,
});

describe('aggregateCorpDonations', () => {
  it('只收營利事業捐贈收入', () => {
    const out = aggregateCorpDonations([row({}), row({ category: '個人捐贈收入' }), row({ category: '宣傳支出', income: 0, expense: 5000 })]);
    expect(out).toHaveLength(1);
  });
  it('同公司×同人×同選舉加總；不同人分列', () => {
    const out = aggregateCorpDonations([
      row({ income: 100000 }), row({ income: 50000 }),
      row({ account: '李試驗', electionName: '111年臺北市議員選舉', income: 30000 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((c) => c.recipientName === '王測試')!.amount).toBe(150000);
    expect(out.find((c) => c.recipientName === '李試驗')!.amount).toBe(30000);
  });
  it('同統編名稱變體合併，取最長為正規名', () => {
    const out = aggregateCorpDonations([
      row({ counterparty: '中科國際物流(股)公司', income: 10000 }),
      row({ counterparty: '中科國際物流股份有限公司', income: 20000 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].donorName).toBe('中科國際物流股份有限公司');
    expect(out[0].amount).toBe(30000);
    expect(out[0].donorUid).toBe('11111111');
  });
  it('統編非8碼數字 → name:<公司名> 為鍵，不與他人合併', () => {
    const out = aggregateCorpDonations([
      row({ idNumber: '', counterparty: '乙公司' }),
      row({ idNumber: '1234567', counterparty: '乙公司' }), // 7碼 → 也是 fallback，同名合併
      row({ counterparty: '乙公司' }),                       // 有效統編 → 獨立
    ]);
    const fallback = out.find((c) => c.donorUid === 'name:乙公司')!;
    expect(fallback.amount).toBe(200000);
    expect(out.find((c) => c.donorUid === '11111111')!.amount).toBe(100000);
  });
  it('金額為0的列略過', () => {
    expect(aggregateCorpDonations([row({ income: 0 })])).toHaveLength(0);
  });
});
