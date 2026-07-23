import { describe, it, expect } from 'vitest';
import { matchAccount, officeTypeOfElection, type OfficialLite } from '../lib/ardata-match';

const offs: OfficialLite[] = [
  { id: 'L1', name: '王測試', office_type: 'legislator', district: '臺北市第1選舉區', is_incumbent: true },
  { id: 'C1', name: '王測試', office_type: 'councilor', district: '南投縣第02選舉區', is_incumbent: true },
  { id: 'C2', name: '李試驗', office_type: 'councilor', district: '南投縣第02選舉區', is_incumbent: true },
  { id: 'C3', name: '李試驗', office_type: 'councilor', district: '彰化縣第03選舉區', is_incumbent: true },
  { id: 'M1', name: '張首長', office_type: 'mayor_magistrate', district: '基隆市', is_incumbent: true },
  { id: 'X1', name: '陳離任', office_type: 'legislator', district: '新北市第2選舉區', is_incumbent: false },
];

describe('officeTypeOfElection', () => {
  it('從選舉名稱推公職類型', () => {
    expect(officeTypeOfElection('113年立法委員選舉')).toBe('legislator');
    expect(officeTypeOfElection('第10屆南投縣立法委員補選')).toBe('legislator');
    expect(officeTypeOfElection('111年縣(市)議員選舉')).toBe('councilor');
    expect(officeTypeOfElection('111年直轄市議員選舉')).toBe('councilor');
    expect(officeTypeOfElection('第20屆臺東縣議員補選')).toBe('councilor');
    expect(officeTypeOfElection('111年縣(市)長選舉')).toBe('mayor_magistrate');
    expect(officeTypeOfElection('111年直轄市市長選舉')).toBe('mayor_magistrate');
    expect(officeTypeOfElection('113年總統、副總統選舉')).toBeNull();
    expect(officeTypeOfElection('第12屆苗栗縣苗栗市市長補選')).toBeNull(); // 鄉鎮市長，非本站範圍
    expect(officeTypeOfElection('111年鄉(鎮、市)長選舉')).toBeNull();
    expect(officeTypeOfElection('111年村(里)長選舉')).toBeNull();
  });
});

describe('matchAccount', () => {
  it('同名不同職類 → 由選舉類型分離', () => {
    expect(matchAccount({ name: '王測試', electionName: '113年立法委員選舉' }, offs))
      .toEqual({ status: 'matched', officialId: 'L1' });
    expect(matchAccount({ name: '王測試', electionName: '111年縣(市)議員選舉' }, offs))
      .toEqual({ status: 'matched', officialId: 'C1' });
  });
  it('同名同職類多人 → ambiguous', () => {
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
});
