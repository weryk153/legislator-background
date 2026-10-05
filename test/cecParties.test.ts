import { describe, it, expect } from 'vitest';
import { mergeParties, partyCodeLookup } from '../scraper/lib/cecParties';

describe('mergeParties', () => {
  it('合併多份 elpaty，同代碼同名稱不算衝突', () => {
    const m = mergeParties([
      { path: 'a', csv: '1,中國國民黨\n16,民主進步黨\n' },
      { path: 'b', csv: '16,民主進步黨\n350,台灣民眾黨\n' },
    ]);
    expect(m.get('350')).toBe('台灣民眾黨');
    expect(m.size).toBe(3);
  });
  it('同代碼不同名稱直接拋錯，不任選一個蓋過去', () => {
    expect(() => mergeParties([
      { path: 'a', csv: '16,民主進步黨\n' },
      { path: 'b', csv: '16,別的黨\n' },
    ])).toThrow(/代碼 16/);
  });
});

describe('partyCodeLookup', () => {
  const lookup = partyCodeLookup(new Map([
    ['1', '中國國民黨'], ['16', '民主進步黨'], ['350', '台灣民眾黨'], ['999', '無黨籍及未經政黨推薦'],
  ]));
  it('全名對到代碼', () => expect(lookup('民主進步黨')).toBe('16'));
  it('台／臺 兩種寫法都對得到', () => expect(lookup('臺灣民眾黨')).toBe('350'));
  it('名冊的「無」是無黨籍 999', () => expect(lookup('無')).toBe('999'));
  it('2022 表上沒有的新政黨回 null，不可變成無黨籍', () => {
    expect(lookup('臺灣SoR無法黨')).toBeNull();
  });
});
