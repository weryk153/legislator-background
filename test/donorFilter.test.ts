import { describe, it, expect } from 'vitest';
import {
  matchRecipient,
  donorView,
  rankDonors,
  filterOfficials,
  collectParties,
  electionGroup,
  collectElectionGroups,
  matchName,
  filterOfficialsByName,
  filterDonorsByName,
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

// 增補（2026-07-23）：選舉篩選（粗分類）
describe('electionGroup', () => {
  it('含「立法委員」→立委選舉', () => {
    expect(electionGroup('113年立法委員選舉')).toBe('立委選舉');
  });

  it('含「議員」（含補選）一律→議員選舉，不再獨立分類（使用者回饋：議員補選併入議員選舉）', () => {
    expect(electionGroup('第4屆臺中市議員補選')).toBe('議員選舉');
    expect(electionGroup('111年臺北市議員選舉')).toBe('議員選舉');
  });

  it('以「市長選舉」或「縣長選舉」結尾→縣市長選舉', () => {
    expect(electionGroup('111年臺中市市長選舉')).toBe('縣市長選舉');
    expect(electionGroup('111年南投縣縣長選舉')).toBe('縣市長選舉');
  });

  it('皆不符→其他', () => {
    expect(electionGroup('某某其他投票')).toBe('其他');
  });
});

describe('議員補選併入議員選舉（使用者回饋）', () => {
  // 模擬真實資料規模：8 筆「第4屆臺中市議員補選」紀錄，須能在「議員選舉」篩選下被找到。
  const byElectionDonor: Donor = {
    uid: 'BX',
    name: '補選公司',
    total: 800,
    recipients: Array.from({ length: 8 }, (_, i) => ({
      name: `補選候選人${i}`,
      election: '第4屆臺中市議員補選',
      amount: 100,
      slug: `bs${i}`,
      party: '國民黨',
      officeType: 'councilor',
    })),
  };

  it('以「議員選舉」篩選時，全數 8 筆議員補選紀錄皆符合', () => {
    const v = donorView(byElectionDonor, { election: '議員選舉' });
    expect(v.recipients).toHaveLength(8);
    expect(v.count).toBe(8);
    expect(v.total).toBe(800);
  });

  it('選項中不再有「議員補選」獨立分類', () => {
    expect(collectElectionGroups([byElectionDonor])).toEqual(['議員選舉']);
  });
});

const electionDonors: Donor[] = [
  {
    uid: 'D',
    name: '丁公司',
    total: 500,
    recipients: [
      { name: '陳一', election: '113年立法委員選舉', amount: 100, slug: 's1', party: '國民黨', officeType: 'legislator' },
      { name: '林二', election: '111年臺北市議員選舉', amount: 150, slug: 's2', party: '民進黨', officeType: 'councilor' },
      { name: '落選人', election: '113年立法委員選舉', amount: 250, slug: null, party: null, officeType: null },
    ],
  },
];

describe('matchRecipient（選舉篩選，粗分類）', () => {
  const linked = electionDonors[0].recipients[0]; // 陳一, 立委選舉, 國民黨
  const unlinked = electionDonors[0].recipients[2]; // 落選人, 立委選舉, slug null

  it('選舉篩選單獨啟用時不排除落選人，僅依 electionGroup 比對', () => {
    expect(matchRecipient(unlinked, { election: '立委選舉' })).toBe(true);
    expect(matchRecipient(unlinked, { election: '議員選舉' })).toBe(false);
  });

  it('選舉篩選可與政黨/職務 AND 組合；政黨/職務啟用時仍排除落選人', () => {
    expect(matchRecipient(linked, { election: '立委選舉', party: '國民黨' })).toBe(true);
    expect(matchRecipient(linked, { election: '議員選舉', party: '國民黨' })).toBe(false); // 選舉分類不符
    expect(matchRecipient(unlinked, { election: '立委選舉', party: '國民黨' })).toBe(false); // 政黨啟用排除落選人
  });
});

describe('donorView（選舉篩選，粗分類）', () => {
  it('選舉篩選單獨啟用：保留落選人，人數＝連結子集合去重，總額＝子集合全額（含落選人）', () => {
    const v = donorView(electionDonors[0], { election: '立委選舉' });
    expect(v.filtered).toBe(true);
    expect(v.recipients.map((r) => r.name)).toEqual(['陳一', '落選人']);
    expect(v.count).toBe(1); // 僅 陳一 有連結
    expect(v.total).toBe(350); // 100 + 250，落選人金額仍計入
  });

  it('選舉＋政黨 AND 組合：政黨篩選排除落選人與跨分類受贈者', () => {
    const v = donorView(electionDonors[0], { election: '立委選舉', party: '國民黨' });
    expect(v.recipients.map((r) => r.name)).toEqual(['陳一']);
    expect(v.count).toBe(1);
    expect(v.total).toBe(100);
  });

  it('選舉＋政黨 AND 組合：選舉分類不符則整批排除', () => {
    const v = donorView(electionDonors[0], { election: '議員選舉', party: '國民黨' });
    expect(v.recipients).toEqual([]);
    expect(v.count).toBe(0);
    expect(v.total).toBe(0);
  });
});

describe('collectElectionGroups', () => {
  it('依固定順序（立委/議員/縣市長/其他）排列，只列有出現者，不受出現筆數影響；議員補選併入議員選舉', () => {
    // 刻意讓「議員選舉」筆數遠多於「立委選舉」，驗證排序是固定分類順序而非依筆數。
    const ds: Donor[] = [
      {
        uid: 'X',
        name: 'X',
        total: 0,
        recipients: [
          { name: 'a', election: '111年臺北市議員選舉', amount: 1, slug: 's1', party: 'p', officeType: 'councilor' },
          { name: 'b', election: '111年新北市議員選舉', amount: 1, slug: null, party: null, officeType: null },
          { name: 'c', election: '111年桃園市議員選舉', amount: 1, slug: 's2', party: 'p', officeType: 'councilor' },
          { name: 'd', election: '113年立法委員選舉', amount: 1, slug: 's3', party: 'p', officeType: 'legislator' },
        ],
      },
      {
        uid: 'Y',
        name: 'Y',
        total: 0,
        recipients: [{ name: 'e', election: '第4屆臺中市議員補選', amount: 1, slug: 's4', party: 'p', officeType: 'councilor' }],
      },
    ];
    expect(collectElectionGroups(ds)).toEqual(['立委選舉', '議員選舉']);
  });

  it('缺席的分類不出現（如無縣市長/其他資料）', () => {
    const ds: Donor[] = [
      {
        uid: 'Z',
        name: 'Z',
        total: 0,
        recipients: [{ name: 'f', election: '111年宜蘭縣縣長選舉', amount: 1, slug: 's5', party: 'p', officeType: 'mayor_magistrate' }],
      },
    ];
    expect(collectElectionGroups(ds)).toEqual(['縣市長選舉']);
  });
});

// 增補：站內搜尋異體字不敏感（背景：officials.name 訂正為「戴瑋姍」，但使用者常打「戴瑋姗」）
describe('matchName（異體字不敏感搜尋）', () => {
  it('查詢異體字「戴瑋姗」可比對到候選字串「戴瑋姍」', () => {
    expect(matchName('戴瑋姍', '戴瑋姗')).toBe(true);
  });

  it('查詢標準字「戴瑋姍」也可比對到候選異體字「戴瑋姗」（反向亦成立）', () => {
    expect(matchName('戴瑋姗', '戴瑋姍')).toBe(true);
  });

  it('子字串比對維持原有行為', () => {
    expect(matchName('陳一', '陳')).toBe(true);
    expect(matchName('陳一', '林')).toBe(false);
  });
});

describe('filterOfficialsByName', () => {
  const officialsForSearch: Official[] = [
    { name: '戴瑋姍', slug: 'dai', party: '民進黨', officeType: 'legislator', district: '新北市', totalIncome: 100 },
    { name: '陳一', slug: 's1', party: '國民黨', officeType: 'legislator', district: '北市', totalIncome: 50 },
  ];

  it('查詢「戴瑋姗」（異體字）可找到資料中的「戴瑋姍」', () => {
    expect(filterOfficialsByName(officialsForSearch, '戴瑋姗').map((o) => o.slug)).toEqual(['dai']);
  });
});

describe('filterDonorsByName', () => {
  const donorsForSearch: Donor[] = [
    { uid: '12345678', name: '戴瑋姍服務處', total: 0, recipients: [] },
    { uid: '87654321', name: '甲公司', total: 0, recipients: [] },
  ];

  it('查詢「戴瑋姗」（異體字）可找到名稱含「戴瑋姍」的捐贈者', () => {
    expect(filterDonorsByName(donorsForSearch, '戴瑋姗').map((d) => d.uid)).toEqual(['12345678']);
  });

  it('uid 前綴比對維持原始字串，不做異體字正規化', () => {
    expect(filterDonorsByName(donorsForSearch, '1234').map((d) => d.uid)).toEqual(['12345678']);
  });
});
