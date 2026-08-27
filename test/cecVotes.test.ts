import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseElctks, parseElprof } from '../scraper/lib/cecVotes';

const C1_ELCTKS = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉/C1/city/elctks.csv';
const C1_ELPROF = 'scraper/out-roster/cec/voteData/2022-111年地方公職人員選舉/C1/city/elprof.csv';

describe('parseElctks：得票數與得票率（只留彙總列）', () => {
  it('個別投開票所（投開票所別非 0000）不是彙總列，要略過', () => {
    const csv = [
      '10,005,00,000,0000,0001,1,100,50.00, ', // 個別投開票所
      '10,005,00,000,0000,0000,1,124603,42.66,*', // 縣市彙總
    ].join('\n');
    expect(parseElctks(csv)).toEqual([
      { areaCode: '10-005-00-000-0000', number: 1, votes: 124603, share: 42.66, elected: true },
    ]);
  });

  it('依五段代碼組出 areaCode，與 cecVoteData.ts 的 AreaNode.code 一致', () => {
    const csv = '09,007,00,010,0000,0000,1,4484,100.00,*';
    expect(parseElctks(csv)[0].areaCode).toBe('09-007-00-010-0000');
  });

  it('當落註記為空白時 elected 為 false', () => {
    const csv = '10,005,00,000,0000,0000,2,32026,10.96, ';
    expect(parseElctks(csv)[0].elected).toBe(false);
  });

  it('苗栗縣長：鍾東錦以 124603 票、42.66% 當選', () => {
    const csv = readFileSync(C1_ELCTKS, 'utf8');
    const rows = parseElctks(csv).filter((r) => r.areaCode === '10-005-00-000-0000');
    expect(rows).toEqual([
      { areaCode: '10-005-00-000-0000', number: 1, votes: 124603, share: 42.66, elected: true },
      { areaCode: '10-005-00-000-0000', number: 2, votes: 32026, share: 10.96, elected: false },
      { areaCode: '10-005-00-000-0000', number: 3, votes: 4864, share: 1.67, elected: false },
      { areaCode: '10-005-00-000-0000', number: 4, votes: 91260, share: 31.24, elected: false },
      { areaCode: '10-005-00-000-0000', number: 5, votes: 39347, share: 13.47, elected: false },
    ]);
  });

  it('得票數無法解析為整數時要拋錯，不可用 parseInt 靜默吞掉', () => {
    const csv = '10,005,00,000,0000,0000,1,abc,42.66,*';
    expect(() => parseElctks(csv)).toThrow(/得票數/);
  });

  it('得票率無法解析為數字時要拋錯', () => {
    const csv = '10,005,00,000,0000,0000,1,124603,abc,*';
    expect(() => parseElctks(csv)).toThrow(/得票率/);
  });

  it('當落註記不是已知值時要拋錯，不猜測', () => {
    const csv = '10,005,00,000,0000,0000,1,124603,42.66,!';
    expect(() => parseElctks(csv)).toThrow(/當落註記/);
  });

  it('當落註記為 ? （得票相同待抽籤，僅見於村里長）時 elected 為 false，不視為已知的錯誤值', () => {
    const csv = '09,020,00,090,0008,0000,1,228,37.56,?';
    expect(() => parseElctks(csv)).not.toThrow();
    expect(parseElctks(csv)[0].elected).toBe(false);
  });

  it('欄位不足要拋錯', () => {
    const csv = '10,005,00,000,0000,0000,1,124603';
    expect(() => parseElctks(csv)).toThrow(/欄位不足/);
  });

  it('純空白行不拋錯，不是資料錯誤', () => {
    const csv = ['10,005,00,000,0000,0000,1,124603,42.66,*', '   '].join('\n');
    expect(() => parseElctks(csv)).not.toThrow();
    expect(parseElctks(csv)).toHaveLength(1);
  });
});

describe('parseElprof：選舉人數與投票率（只留彙總列）', () => {
  it('苗栗縣：有效票 292100、選舉人數 443908、投票率 67.20%', () => {
    const csv = readFileSync(C1_ELPROF, 'utf8');
    const rows = parseElprof(csv).filter((r) => r.areaCode === '10-005-00-000-0000');
    expect(rows).toEqual([
      {
        areaCode: '10-005-00-000-0000',
        validVotes: 292100, invalidVotes: 6219, castVotes: 298319,
        electorate: 443908, turnout: 67.20,
      },
    ]);
  });

  it('個別投開票所不是彙總列，要略過', () => {
    const csv = [
      '10,005,00,000,0000,0001,100,5,105,200,250,5,0,5,1,0,1,80.00,52.50,20.00',
      '10,005,00,000,0000,0000,292100,6219,298319,443908,535149,5,0,5,1,0,1,82.95,67.20,20.00',
    ].join('\n');
    expect(parseElprof(csv)).toHaveLength(1);
  });

  it('投票率無法解析為數字時要拋錯', () => {
    const csv = '10,005,00,000,0000,0000,292100,6219,298319,443908,535149,5,0,5,1,0,1,82.95,abc,20.00';
    expect(() => parseElprof(csv)).toThrow(/投票率/);
  });

  it('選舉人數無法解析為整數時要拋錯，不可用 parseInt 靜默吞掉', () => {
    const csv = '10,005,00,000,0000,0000,292100,6219,298319,abc,535149,5,0,5,1,0,1,82.95,67.20,20.00';
    expect(() => parseElprof(csv)).toThrow(/選舉人數/);
  });

  it('欄位不足要拋錯', () => {
    const csv = '10,005,00,000,0000,0000,292100,6219,298319';
    expect(() => parseElprof(csv)).toThrow(/欄位不足/);
  });

  it('純空白行不拋錯', () => {
    const csv = ['10,005,00,000,0000,0000,292100,6219,298319,443908,535149,5,0,5,1,0,1,82.95,67.20,20.00', '  '].join('\n');
    expect(() => parseElprof(csv)).not.toThrow();
    expect(parseElprof(csv)).toHaveLength(1);
  });
});
