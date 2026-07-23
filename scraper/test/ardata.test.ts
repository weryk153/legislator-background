import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArdataCsv, aggregateAccounts, type DonationRow } from '../lib/ardata';

const here = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(here, '..', 'fixtures', 'ardata-sample.csv'), 'utf8');
const malformedCsv = readFileSync(join(here, '..', 'fixtures', 'ardata-malformed.csv'), 'utf8');

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
  it('解析身分證／統一編號欄', () => {
    const rows = parseArdataCsv(csv);
    expect(rows[1].idNumber).toBe('12345678');
    expect(rows[0].idNumber).toBe('A12*******');
  });
});

describe('splitCsv — 不成對引號不吞列（回歸：臺中市議員收入檔遮罩電話吞掉 6,356 列）', () => {
  it('遮罩電話等不成對引號視為字面字元，不進入「吞到下一個引號」的黑洞', () => {
    const rows = parseArdataCsv(malformedCsv);
    // 前後正常列都要在：不因中間一列的不成對引號/裸換行斷列而被吞掉或跟後面合併
    expect(rows.some((r) => r.counterparty === '陳大文' && r.income === 50000)).toBe(true);
    expect(rows.some((r) => r.counterparty === '林小美' && r.income === 30000)).toBe(true);
    expect(rows.some((r) => r.counterparty === '王小明' && r.income === 15000)).toBe(true);
    expect(rows.some((r) => r.counterparty === '李大同' && r.income === 40000)).toBe(true);
  });
  it('未加引號欄位中的裸換行造成的殘段列被跳過，不與後面的正常列合併', () => {
    const rows = parseArdataCsv(malformedCsv);
    // 被裸換行斷開的「測試協會」列欄數對不上 header，應整筆跳過，不產生半調子資料
    expect(rows.some((r) => r.counterparty === '測試協會')).toBe(false);
    // 緊接在殘段之後的正常列（李大同）金額不受影響（沒被錯位污染）
    const li = rows.find((r) => r.counterparty === '李大同')!;
    expect(li.income).toBe(40000);
    expect(li.account).toBe('乙候選人');
  });
  it('正確加引號且內含逗號的欄位仍正常解析（既有能力不因硬化引號規則而喪失）', () => {
    const rows = parseArdataCsv(malformedCsv);
    const row = rows.find((r) => r.counterparty === '測試建設股份有限公司, 分公司');
    expect(row).toBeDefined();
    expect(row!.income).toBe(200000);
  });
  it('欄位以字面 " 開頭但同列內找不到合法關閉引號，不當作開引號（回歸：111年臺北市議員選舉支出檔某支出用途欄以 " 開頭卻無配對關閉引號，曾把中間 273 列的裸換行吞成同一欄位、把 洪健益 支出吞成 0）', () => {
    const header = '擬參選人／政黨,選舉名稱,申報序號／年度,收支科目,捐贈者／支出對象,收入金額,支出金額,支出用途\n';
    const rows = parseArdataCsv(
      header +
      '甲,某選舉,首次申報,宣傳支出,某廠商,0,1000,"NO.雄獅奇異筆-紅色未關閉引號的自由文字\n' +
      '乙,某選舉,首次申報,個人捐贈收入,某人,2000,0,正常列\n',
    );
    // 兩列都要各自成立：前一列的未關閉引號不可把後一列的換行吞掉、合併成一列
    expect(rows).toHaveLength(2);
    expect(rows[0].account).toBe('甲');
    expect(rows[0].expense).toBe(1000);
    expect(rows[1].account).toBe('乙');
    expect(rows[1].income).toBe(2000);
  });
});

describe('parseArdataCsv — 列形驗證與跳過門檻', () => {
  it('跳過筆數在門檻內：正常回傳可解析的列，不拋錯', () => {
    // ardata-malformed.csv 只有 1 筆（3 個裸換行殘段）形狀不符，遠低於門檻，不應拋錯
    expect(() => parseArdataCsv(malformedCsv)).not.toThrow();
  });
  it('跳過筆數超過門檻（max(20, 1%)）時，寧可整體失敗也不要吞資料', () => {
    const header = '擬參選人／政黨,選舉名稱,申報序號／年度,收支科目,捐贈者／支出對象,收入金額,支出金額\n';
    // 25 列全部欄數不符（只有 3 欄，header 是 7 欄），總列數 25 → 門檻 max(20, 1) = 20，25 > 20 應拋錯
    const badRows = Array.from({ length: 25 }, (_, i) => `甲,乙,丙${i}\n`).join('');
    expect(() => parseArdataCsv(header + badRows)).toThrow(/列形不符跳過 25 列/);
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
