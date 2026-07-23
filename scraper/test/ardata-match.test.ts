import { describe, it, expect } from 'vitest';
import { matchAccount, officeTypeOfElection, type OfficialLite } from '../lib/ardata-match';

const offs: OfficialLite[] = [
  { id: 'L1', name: '王測試', office_type: 'legislator', district: '臺北市第1選舉區', is_incumbent: true },
  { id: 'C1', name: '王測試', office_type: 'councilor', district: '南投縣第02選舉區', is_incumbent: true },
  { id: 'C2', name: '李試驗', office_type: 'councilor', district: '南投縣第02選舉區', is_incumbent: true },
  { id: 'C3', name: '李試驗', office_type: 'councilor', district: '彰化縣第03選舉區', is_incumbent: true },
  { id: 'M1', name: '張首長', office_type: 'mayor_magistrate', district: '基隆市', is_incumbent: true },
  { id: 'X1', name: '陳離任', office_type: 'legislator', district: '新北市第2選舉區', is_incumbent: false },
  { id: 'ZS1', name: '張志豪', office_type: 'councilor', district: '臺北市第06選舉區', is_incumbent: true },
  { id: 'A1', name: '高原民', office_type: 'legislator', district: '山地原住民選舉區', is_incumbent: true },
  { id: 'A2', name: '陳原民', office_type: 'legislator', district: '平地原住民選舉區', is_incumbent: true },
];

describe('officeTypeOfElection', () => {
  it('從選舉名稱推公職類型', () => {
    expect(officeTypeOfElection('113年立法委員選舉')).toBe('legislator');
    expect(officeTypeOfElection('第10屆南投縣立法委員補選')).toBe('legislator');
    expect(officeTypeOfElection('111年臺北市議員選舉')).toBe('councilor');
    expect(officeTypeOfElection('111年新北市議員選舉')).toBe('councilor');
    expect(officeTypeOfElection('第20屆臺東縣議員補選')).toBe('councilor');
    // CSV 內實際欄位格式：per-city 市長/縣長選舉
    expect(officeTypeOfElection('111年臺北市市長選舉')).toBe('mayor_magistrate');
    expect(officeTypeOfElection('111年南投縣縣長選舉')).toBe('mayor_magistrate');
    expect(officeTypeOfElection('113年總統、副總統選舉')).toBeNull();
    expect(officeTypeOfElection('第12屆苗栗縣苗栗市市長補選')).toBeNull(); // 鄉鎮市長補選，非本站範圍
    expect(officeTypeOfElection('第3屆高雄市市長補選')).toBeNull(); // 同上
    expect(officeTypeOfElection('111年鄉(鎮、市)長選舉')).toBeNull();
    expect(officeTypeOfElection('111年村(里)長選舉')).toBeNull();
  });
});

describe('matchAccount', () => {
  it('同名不同職類 → 由選舉類型分離', () => {
    expect(matchAccount({ name: '王測試', electionName: '113年立法委員選舉' }, offs))
      .toEqual({ status: 'matched', officialId: 'L1' });
    expect(matchAccount({ name: '王測試', electionName: '111年南投縣議員選舉' }, offs))
      .toEqual({ status: 'matched', officialId: 'C1' });
  });
  it('同名同職類多人 → ambiguous（選舉名稱不含縣市，未觸發地區過濾）', () => {
    const r = matchAccount({ name: '李試驗', electionName: '111年縣(市)議員選舉' }, offs);
    expect(r.status).toBe('ambiguous');
  });
  it('查無此人 / 選舉類型不明 → none', () => {
    expect(matchAccount({ name: '不存在', electionName: '113年立法委員選舉' }, offs).status).toBe('none');
    expect(matchAccount({ name: '王測試', electionName: '113年總統、副總統選舉' }, offs).status).toBe('none');
  });
  it('非現任不掛', () => {
    expect(matchAccount({ name: '陳離任', electionName: '113年立法委員選舉' }, offs).status).toBe('none');
  });

  // Defect 1: 縣市一致性 — 同名但選舉名稱的縣市與 district 不符時不可誤掛
  it('選舉名稱縣市與 district 不一致 → none（防同名誤掛）', () => {
    expect(matchAccount({ name: '張志豪', electionName: '111年新北市議員選舉' }, offs))
      .toEqual({ status: 'none', reason: '查無同名現任者' });
  });
  it('選舉名稱縣市與 district 一致 → matched', () => {
    expect(matchAccount({ name: '張志豪', electionName: '111年臺北市議員選舉' }, offs))
      .toEqual({ status: 'matched', officialId: 'ZS1' });
  });

  // Defect 2: per-city 市長選舉名稱須能比對到現任市長
  it('市長選舉（per-city 名稱）比對現任市長', () => {
    expect(matchAccount({ name: '張首長', electionName: '111年基隆市市長選舉' }, offs))
      .toEqual({ status: 'matched', officialId: 'M1' });
  });

  // 立委選舉名稱不含縣市（如「113年立法委員選舉」），須靠 area 判斷（含原住民選舉區）
  it('選舉名稱無縣市時以 area 判斷地區（一般縣市）', () => {
    expect(matchAccount({ name: '王測試', electionName: '113年立法委員選舉', area: '臺北市' }, offs))
      .toEqual({ status: 'matched', officialId: 'L1' });
  });
  it('area 為原住民選舉區時比對對應 district', () => {
    expect(matchAccount({ name: '高原民', electionName: '113年立法委員選舉', area: '山地原住民' }, offs))
      .toEqual({ status: 'matched', officialId: 'A1' });
    expect(matchAccount({ name: '陳原民', electionName: '113年立法委員選舉', area: '平地原住民' }, offs))
      .toEqual({ status: 'matched', officialId: 'A2' });
  });
});
