import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArdataCsv, aggregateAccounts, type DonationRow } from '../lib/ardata';

const here = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(here, '..', 'fixtures', 'ardata-sample.csv'), 'utf8');

describe('parseArdataCsv', () => {
  it('解析所有列，含引號內逗號', () => {
    const rows = parseArdataCsv(csv);
    expect(rows).toHaveLength(8);
    expect(rows[1].counterparty).toBe('大安建設股份有限公司, 籌備處');
    expect(rows[1].income).toBe(300000);
    expect(rows[5].expense).toBe(200000);
    expect(rows[0].account).toBe('王測試');
    expect(rows[0].electionName).toBe('113年立法委員選舉');
    expect(rows[0].reportSeq).toBe('首次申報');
  });
  it('金額欄為小數字串(元)，容忍千分位；一律取整數元', () => {
    const rows = parseArdataCsv(
      '擬參選人／政黨,選舉名稱,申報序號／年度,收支科目,捐贈者／支出對象,收入金額,支出金額\n' +
      '甲,某選舉,首次申報,個人捐贈收入,乙,"1,234,567.00",0.00\n' +
      '甲,某選舉,首次申報,個人捐贈收入,丙,162000.00,0.00\n');
    expect(rows[0].income).toBe(1234567);
    expect(rows[1].income).toBe(162000); // digit-strip 會錯成 16200000，必須用小數解析
  });
});

describe('aggregateAccounts', () => {
  const summaries = aggregateAccounts(parseArdataCsv(csv));
  const wang = summaries.find((s) => s.name === '王測試')!;
  it('每專戶一筆摘要', () => {
    expect(summaries).toHaveLength(2);
    expect(wang.electionName).toBe('113年立法委員選舉');
  });
  it('總額與分類小計', () => {
    expect(wang.totalIncome).toBe(533000);
    expect(wang.totalExpense).toBe(200000);
    expect(wang.incomeByType['個人捐贈收入']).toBe(230000);
    expect(wang.incomeByType['營利事業捐贈收入']).toBe(300000);
    expect(wang.incomeByType['匿名捐贈']).toBe(3000);
    expect(wang.expenseByType['宣傳支出']).toBe(200000);
  });
  it('大額捐贈者：營利事業全列、個人加總排序、匿名不列', () => {
    expect(wang.topDonors).toEqual([
      { donorName: '大安建設股份有限公司, 籌備處', donorType: '營利事業', amount: 300000, rank: 1 },
      { donorName: '陳大文', donorType: '個人', amount: 150000, rank: 2 },
      { donorName: '林小美', donorType: '個人', amount: 80000, rank: 3 },
    ]);
  });
  it('個人取前 N（參數化）', () => {
    const top1 = aggregateAccounts(parseArdataCsv(csv), 1).find((s) => s.name === '王測試')!;
    expect(top1.topDonors.filter((d) => d.donorType === '個人')).toHaveLength(1);
    expect(top1.topDonors.filter((d) => d.donorType === '營利事業')).toHaveLength(1);
  });
});

describe('aggregateAccounts — area（同名同選舉但不同地區的檔案不可被誤併）', () => {
  // area 非 CSV 欄位，是 donations-record.ts 依檔名附加上去的；同一姓名/選舉名稱/年度
  // 若出現在不同地區的檔案（理論上不會，但分組鍵仍須涵蓋 area 以防萬一）應各自成一筆摘要。
  const rows: DonationRow[] = [
    { account: '張志豪', electionName: '111年臺北市議員選舉', reportSeq: '首次申報', category: '個人捐贈收入', counterparty: '甲', income: 1000, expense: 0, area: '臺北市' },
    { account: '張志豪', electionName: '111年新北市議員選舉', reportSeq: '首次申報', category: '個人捐贈收入', counterparty: '乙', income: 2000, expense: 0, area: '新北市' },
  ];
  it('area 併入分組鍵，各自彙總並帶出 area', () => {
    const summaries = aggregateAccounts(rows);
    expect(summaries).toHaveLength(2);
    const taipei = summaries.find((s) => s.area === '臺北市')!;
    const newTaipei = summaries.find((s) => s.area === '新北市')!;
    expect(taipei.totalIncome).toBe(1000);
    expect(newTaipei.totalIncome).toBe(2000);
  });
  it('同 area 的列仍正常合併（不因加了分組維度而拆散同一專戶)', () => {
    const sameArea: DonationRow[] = [
      { account: '甲候選人', electionName: '111年臺北市議員選舉', reportSeq: '首次申報', category: '個人捐贈收入', counterparty: 'X', income: 100, expense: 0, area: '臺北市' },
      { account: '甲候選人', electionName: '111年臺北市議員選舉', reportSeq: '首次申報', category: '個人捐贈收入', counterparty: 'Y', income: 200, expense: 0, area: '臺北市' },
    ];
    const summaries = aggregateAccounts(sameArea);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].totalIncome).toBe(300);
  });
});
