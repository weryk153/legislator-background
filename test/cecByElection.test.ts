import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseByElection, parseByElectionDir } from '../scraper/lib/cecByElection';

const CEC = 'scraper/out-roster/cec';

describe('parseByElection：由分號次得票推出當選者', () => {
  const cand = [
    '﻿號次,名字,政黨名稱',
    '1,甲,中國國民黨',
    '2,乙,無',
  ].join('\n');
  const prof = [
    '﻿行政區別,村里別,投開票所別,號次1,號次2,有效票數A,無效票數B',
    '東區,短竹里,1,100,50,150,0',
    '東區,蘭潭里,2,30,90,120,0',
  ].join('\n');

  it('跨投開票所加總後取最高票——單一票所的領先不代表當選', () => {
    expect(parseByElection(cand, prof)).toEqual({ name: '乙', partyName: '無', votes: 140, totalVotes: 270 });
  });

  it('BOM 不可留在第一個欄位名裡，否則標頭對不到', () => {
    expect(parseByElection(cand, prof)?.name).toBe('乙');
  });

  it('資料不全時回 null，不硬猜當選者', () => {
    expect(parseByElection('', '')).toBeNull();
  });
});

describe('parseByElectionDir：由目錄名解析選區', () => {
  it('嘉義市長重行選舉', () => {
    expect(parseByElectionDir('2022年_嘉義市長重行選舉'))
      .toEqual({ countyName: '嘉義市', districtNo: null, office: 'countyChief' });
  });
  it('議員缺額補選帶選舉區號', () => {
    expect(parseByElectionDir('2024宜蘭縣議會第20屆議員第4選舉區缺額補選'))
      .toEqual({ countyName: '宜蘭縣', districtNo: 4, office: 'councilSeat' });
    expect(parseByElectionDir('2024臺中市議會第4屆議員第15選舉區缺額補選'))
      .toEqual({ countyName: '臺中市', districtNo: 15, office: 'councilSeat' });
  });
  it('認不出的目錄名回 null，由呼叫端列報而非默默略過', () => {
    expect(parseByElectionDir('某某其他選舉')).toBeNull();
  });
});

describe('parseByElection：對真實資料', () => {
  const load = (dir: string) => parseByElection(
    readFileSync(`${CEC}/${dir}/cand.csv`, 'utf8'),
    readFileSync(`${CEC}/${dir}/prof.csv`, 'utf8'));

  it('嘉義市長重行選舉由黃敏惠當選', () => {
    expect(load('2022年_嘉義市長重行選舉')?.name).toBe('黃敏惠');
  });

  it('四場議員缺額補選的當選者', () => {
    const base = '鄉鎮市長及議員補選(2023年後)';
    expect(load(`${base}/2024宜蘭縣議會第20屆議員第4選舉區缺額補選`)?.name).toBe('黃雯如');
    expect(load(`${base}/2024新竹縣議會第20屆議員第7選舉區缺額補選`)?.name).toBe('陳星宏');
    expect(load(`${base}/2024臺中市議會第4屆議員第15選舉區缺額補選`)?.name).toBe('吳建德');
    expect(load(`${base}/2024臺東縣議會第20屆議員第16選舉區缺額補選`)?.name).toBe('董昌華');
  });
});
