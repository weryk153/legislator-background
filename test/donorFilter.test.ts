import { describe, it, expect } from 'vitest';
import {
  matchRecipient,
  donorView,
  rankDonors,
  filterOfficials,
  collectParties,
  type Donor,
  type Official,
} from '../src/lib/donorFilter';

const donors: Donor[] = [
  {
    uid: 'A',
    name: '甲公司',
    total: 300,
    recipients: [
      { name: '陳一', election: 'e1', amount: 100, slug: 's1', party: '國民黨', officeType: 'legislator' },
      { name: '林二', election: 'e1', amount: 100, slug: 's2', party: '民進黨', officeType: 'councilor' },
      { name: '無名氏', election: 'e1', amount: 100, slug: null, party: null, officeType: null },
    ],
  },
  {
    uid: 'B',
    name: '乙公司',
    total: 50,
    recipients: [
      { name: '陳一', election: 'e1', amount: 50, slug: 's1', party: '國民黨', officeType: 'legislator' },
    ],
  },
  {
    uid: 'C',
    name: '丙公司',
    total: 400,
    recipients: [
      { name: '王三', election: 'e1', amount: 200, slug: 's3', party: '民進黨', officeType: 'mayor_magistrate' },
      { name: '陳一', election: 'e1', amount: 200, slug: 's1', party: '國民黨', officeType: 'legislator' },
    ],
  },
];

const officials: Official[] = [
  { name: '陳一', slug: 's1', party: '國民黨', officeType: 'legislator', district: '北市', totalIncome: 500 },
  { name: '林二', slug: 's2', party: '民進黨', officeType: 'councilor', district: '北市', totalIncome: 900 },
  { name: '王三', slug: 's3', party: '民進黨', officeType: 'mayor_magistrate', district: '南市', totalIncome: 700 },
];

describe('matchRecipient', () => {
  it('無篩選時一律符合（含落選人）', () => {
    const unlinked = donors[0].recipients[2];
    expect(matchRecipient(unlinked, {})).toBe(true);
    expect(matchRecipient(donors[0].recipients[0], {})).toBe(true);
  });

  it('篩選啟用時排除落選人（slug 為 null）', () => {
    const unlinked = donors[0].recipients[2];
    expect(matchRecipient(unlinked, { party: '國民黨' })).toBe(false);
  });

  it('依政黨篩選', () => {
    expect(matchRecipient(donors[0].recipients[0], { party: '國民黨' })).toBe(true);
    expect(matchRecipient(donors[0].recipients[1], { party: '國民黨' })).toBe(false);
  });

  it('依職務篩選', () => {
    expect(matchRecipient(donors[0].recipients[1], { officeType: 'councilor' })).toBe(true);
    expect(matchRecipient(donors[0].recipients[0], { officeType: 'councilor' })).toBe(false);
  });
});

describe('donorView', () => {
  it('無篩選＝原值（受贈者全列、人數=去重連結數、總額=原始 total）', () => {
    const v = donorView(donors[0], {});
    expect(v.filtered).toBe(false);
    expect(v.recipients).toEqual(donors[0].recipients);
    expect(v.count).toBe(2); // s1, s2
    expect(v.total).toBe(300);
  });

  it('政黨篩選：以符合子集合重新計算人數與總額', () => {
    const v = donorView(donors[0], { party: '國民黨' });
    expect(v.filtered).toBe(true);
    expect(v.recipients.map((r) => r.name)).toEqual(['陳一']);
    expect(v.count).toBe(1);
    expect(v.total).toBe(100);
  });

  it('職務篩選：以符合子集合重新計算人數與總額', () => {
    const v = donorView(donors[0], { officeType: 'councilor' });
    expect(v.recipients.map((r) => r.name)).toEqual(['林二']);
    expect(v.count).toBe(1);
    expect(v.total).toBe(100);
  });

  it('落選人在篩選時排除', () => {
    const v = donorView(donors[0], { party: '國民黨' });
    expect(v.recipients.some((r) => r.slug === null)).toBe(false);
  });
});

describe('rankDonors', () => {
  it('無篩選：≥2 門檻排除人數不足者，依人數 desc / 總額 desc 排序', () => {
    const ranked = rankDonors(donors, {}, { minCount: 2, limit: 50 });
    expect(ranked.map((r) => r.donor.uid)).toEqual(['C', 'A']); // B(count=1) 被門檻排除；C/A 皆 count=2，C 總額較高排前
  });

  it('排序切換為總額：依總額 desc 排序', () => {
    const ranked = rankDonors(donors, { sort: 'total' }, { minCount: 0, limit: 50 });
    expect(ranked.map((r) => r.donor.uid)).toEqual(['C', 'A', 'B']);
  });

  it('篩選後不足者自然消失（子集合重算後低於門檻）', () => {
    const ranked = rankDonors(donors, { party: '國民黨' }, { minCount: 2, limit: 50 });
    expect(ranked).toEqual([]); // 篩選後每家公司的「國民黨」連結人數皆為 1，低於門檻
  });

  it('篩選後以子集合總額排序（不套門檻）', () => {
    const ranked = rankDonors(donors, { party: '國民黨', sort: 'total' }, { minCount: 0, limit: 50 });
    expect(ranked.map((r) => r.donor.uid)).toEqual(['C', 'A', 'B']);
    expect(ranked[0].view.total).toBe(200);
  });
});

describe('filterOfficials', () => {
  it('無篩選時回傳全部，依獻金總收入 desc 排序', () => {
    expect(filterOfficials(officials, {}).map((o) => o.slug)).toEqual(['s2', 's3', 's1']);
  });

  it('依政黨篩選（依 official 本人屬性）', () => {
    expect(filterOfficials(officials, { party: '民進黨' }).map((o) => o.slug)).toEqual(['s2', 's3']);
  });

  it('依職務篩選', () => {
    expect(filterOfficials(officials, { officeType: 'mayor_magistrate' }).map((o) => o.slug)).toEqual(['s3']);
  });

  it('預設限制 30 筆結果', () => {
    const manyOfficials = Array.from({ length: 50 }, (_, i) => ({
      name: `官員${i}`,
      slug: `s${i}`,
      party: '測試黨',
      officeType: 'legislator',
      district: '測試區',
      totalIncome: 5000 - i * 10,
    }));
    const result = filterOfficials(manyOfficials, {});
    expect(result).toHaveLength(30);
  });
});

describe('collectParties', () => {
  it('僅收集有連結受贈者（slug 非 null）的政黨，依出現次數降冪', () => {
    expect(collectParties(donors)).toEqual(['國民黨', '民進黨']);
  });
});
