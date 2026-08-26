import { describe, it, expect } from 'vitest';
import { categorizeCareer, careerText, careerPeriod, sharedSource } from '../src/lib/careerCategory';

describe('categorizeCareer：公職', () => {
  it('立法院委員會職務', () => {
    expect(categorizeCareer('立法院內政委員會召集委員')).toBe('public');
    expect(categorizeCareer('立法院第十屆第4、5會期經費稽核委員會')).toBe('public');
  });
  it('立法院的國會議員友好協會隨職務而來，仍是公職', () => {
    expect(categorizeCareer('立法院中華民國與新加坡國會議員友好協會會長')).toBe('public');
    expect(categorizeCareer('立法院世界臺商之友會副會長')).toBe('public');
  });
  it('地方議會與政府機關職務', () => {
    expect(categorizeCareer('台中市議會財經委員會副召集人')).toBe('public');
    expect(categorizeCareer('臺北市政府法務局局長')).toBe('public');
  });
  it('中央二級機關的委員會是公職，不因「委員會」三字誤判為社團', () => {
    expect(categorizeCareer('客家委員會副主任委員')).toBe('public');
    expect(categorizeCareer('國家通訊傳播委員會委員2008年8月~2012年7月。')).toBe('public');
    expect(categorizeCareer('衛福部兒少事故委員會委員')).toBe('public');
    expect(categorizeCareer('省原住民事務委員會副主委')).toBe('public');
  });
  it('立法院常設與特種委員會即使沒帶院名也是公職', () => {
    expect(categorizeCareer('修憲委員會召委')).toBe('public');
    expect(categorizeCareer('社會福利及衛生環境委員會召委')).toBe('public');
    expect(categorizeCareer('・交通委員會召集委員')).toBe('public');
  });
  it('國會議員友好協會即使沒帶院名也是公職', () => {
    expect(categorizeCareer('台灣-英國國會議員友好協會會長')).toBe('public');
  });
  it('帶黨名但指明屆別的民代職務算公職', () => {
    expect(categorizeCareer('台灣民眾黨第11屆立法委員')).toBe('public');
  });
  it('中選會的民國年選舉紀錄是公職，不因帶黨名而歸黨職', () => {
    expect(categorizeCareer('111年直轄市議員（桃園市第02選舉區） 無黨籍及未經政黨推薦 當選')).toBe('public');
    expect(categorizeCareer('103年鄉鎮市民代表（雲林縣虎尾鎮虎尾鎮第01選舉區） 民主進步黨 當選')).toBe('public');
    expect(categorizeCareer('111年鄉鎮市長（雲林縣虎尾鎮） 無黨籍及未經政黨推薦 當選')).toBe('public');
  });
  it('黨內職務即使帶西元年與職稱也不誤判為公職', () => {
    expect(categorizeCareer('民進黨2014年市長選舉對策委員會委員')).toBe('party');
    expect(categorizeCareer('民進黨第15~20屆中執委')).toBe('party');
  });
  it('民代屆別', () => {
    expect(categorizeCareer('第8、9屆立法委員')).toBe('public');
    expect(categorizeCareer('苗栗縣第12、13屆縣議員')).toBe('public');
  });
});

describe('categorizeCareer：黨職', () => {
  it('政黨內部職務', () => {
    expect(categorizeCareer('中國國民黨文化傳播委員會主委')).toBe('party');
    expect(categorizeCareer('民進黨代理黨主席、中常委、財務委員會主任委員、政策會執行長')).toBe('party');
    expect(categorizeCareer('中國國民黨黃復興黨部 黃國園委員會副主委')).toBe('party');
  });
  it('立法院黨團職務屬黨職，不算院內公職', () => {
    expect(categorizeCareer('立法院國民黨團總召集人')).toBe('party');
  });
});

describe('categorizeCareer：社會團體／財團法人', () => {
  it('財團法人與基金會', () => {
    expect(categorizeCareer('財團法人祥和文教基金會董事')).toBe('social');
    expect(categorizeCareer('財團法人台中市恒心社會福利慈善事業基金會董事長')).toBe('social');
    expect(categorizeCareer('國家政策研究基金會執行長')).toBe('social');
  });
  it('宮廟', () => {
    expect(categorizeCareer('苗栗縣竹南后厝龍鳳宮主任委員')).toBe('social');
    expect(categorizeCareer('大甲鎮瀾宮董事長')).toBe('social');
  });
  it('農漁會、公會、同鄉會、宗親會', () => {
    expect(categorizeCareer('員山鄉農會常務監事')).toBe('social');
    expect(categorizeCareer('台南市醫師公會、牙醫師公會、中醫師公會顧問')).toBe('social');
    expect(categorizeCareer('新北市雲林同鄉會總召集人')).toBe('social');
    expect(categorizeCareer('桃園市中壢區 ( 丘 ) 邱姓宗親會 秘')).toBe('social');
  });
  it('社團與服務團體', () => {
    expect(categorizeCareer('臺中市沙鹿中正獅子會16-17會長')).toBe('social');
    expect(categorizeCareer('臺中市救國團團委會指導委員')).toBe('social');
    expect(categorizeCareer('桃園市五人制足球協會總幹事')).toBe('social');
  });
  it('婦女、青溪、家長會、校友與職業團體', () => {
    expect(categorizeCareer('中壢婦女會顧問')).toBe('social');
    expect(categorizeCareer('南投縣婦工會總會長')).toBe('social');
    expect(categorizeCareer('雲林縣婦聯會主委')).toBe('social');
    expect(categorizeCareer('中華民國婦女聯合會雲林縣分會主委')).toBe('social');
    expect(categorizeCareer('臺中市青溪總會總會長')).toBe('social');
    expect(categorizeCareer('虎尾鎮立仁國小家長會長')).toBe('social');
    expect(categorizeCareer('中興大學校友總會理事長')).toBe('social');
    expect(categorizeCareer('政治大學經濟系友會理事長')).toBe('social');
    expect(categorizeCareer('楊梅國際青年商會會長')).toBe('social');
    expect(categorizeCareer('台南市教師會、教育產業工會、環保局工會顧問')).toBe('social');
  });
  it('社會團體也有屆別，不因「第N屆」三字誤判為公職', () => {
    expect(categorizeCareer('宜蘭縣婦女會(第20屆)理事長')).toBe('social');
    expect(categorizeCareer('救國團宜蘭縣真善美聯誼會第五屆會長')).toBe('social');
    expect(categorizeCareer('南庄鄉農會(第16－17屆)理事長')).toBe('social');
  });
  it('聯盟與策進會', () => {
    expect(categorizeCareer('臺灣醫界聯盟執行委員')).toBe('social');
    expect(categorizeCareer('國家生技醫療產業策進會會長')).toBe('social');
  });
  it('非立法院／議會的委員會是社會團體，不因「委員會」三字誤判為公職', () => {
    expect(categorizeCareer('新北市慢速壘球委員會理事長')).toBe('social');
    expect(categorizeCareer('臺中市體育總會滑冰委員會 主任委員')).toBe('social');
  });
});

describe('categorizeCareer：其他', () => {
  it('學校教職、企業與空字串', () => {
    expect(categorizeCareer('淡江大學國際事務與戰略研究所助理教授')).toBe('other');
    // 校內委員會既非社會團體也非公職；寧可落在「其他」也不要誤標為社團
    expect(categorizeCareer('國立臺灣大學性別平等委員會委員')).toBe('other');
    // 無法從字面辨識性質的委員會一律保守歸「其他」——誤標成社會團體的代價高得多
    expect(categorizeCareer('台南市卡巴迪委員會創會主任委員')).toBe('other');
    expect(categorizeCareer('大友鋼鐵公司董事長')).toBe('other');
    expect(categorizeCareer('')).toBe('other');
  });
});

describe('careerText：organization 與 title 合併', () => {
  it('兩欄不同時合併，機關名才不會漏掉', () => {
    // 立法院委員會列的機關名在 organization、職稱在 title；只看 title（「委員」）會誤判為其他
    expect(careerText('財政委員會', '委員')).toBe('財政委員會 委員');
    expect(categorizeCareer(careerText('財政委員會', '委員'))).toBe('public');
  });
  it('兩欄相同時只取一次，避免字串重複', () => {
    // 立法院開放資料的「經歷」列把 organization 與 title 設為同一字串（scraper/adapters/ly.ts）
    expect(careerText('財團法人祥和文教基金會董事', '財團法人祥和文教基金會董事'))
      .toBe('財團法人祥和文教基金會董事');
  });
  it('任一欄為空時不留下多餘空白', () => {
    expect(careerText('', '委員')).toBe('委員');
    expect(careerText('財政委員會', '')).toBe('財政委員會');
  });
});

describe('careerPeriod：起訖期間', () => {
  it('有起有訖', () => {
    expect(careerPeriod('2024/02/01', '2028/01/31')).toBe('2024/02/01–2028/01/31');
  });
  it('有起無訖才是現任', () => {
    expect(careerPeriod('2024/02/01', null)).toBe('2024/02/01–現任');
  });
  it('起訖皆無時不顯示期間——不可據此宣稱現任', () => {
    // 立法院「經歷」欄位的自由文字列沒有日期（如「臺中市沙鹿中正獅子會16-17會長」），
    // 舊版一律印成「–現任」，等於對一筆早已卸任的職務做出不實陳述。
    expect(careerPeriod('', null)).toBe('');
    expect(careerPeriod('', '')).toBe('');
  });
  it('無起有訖時只顯示結束', () => {
    expect(careerPeriod('', '2020/12/31')).toBe('至 2020/12/31');
  });
});

describe('sharedSource：整組共用同一出處時只印一次', () => {
  const src = (url: string) => ({ id: url, url, type: 'wiki', title: '維基百科', retrievedAt: '2026-08-26' });
  const item = (title: string, url: string) => ({ title, organization: '', startDate: '', endDate: null, source: src(url) });

  it('全組同一出處 → 回傳該出處', () => {
    const items = [item('甲會理事長', 'https://a'), item('乙會顧問', 'https://a'), item('丙宮主委', 'https://a')];
    expect(sharedSource(items)?.url).toBe('https://a');
  });
  it('只要有一筆出處不同 → 回傳 null，維持逐筆顯示', () => {
    const items = [item('甲會理事長', 'https://a'), item('乙會顧問', 'https://b')];
    expect(sharedSource(items)).toBeNull();
  });
  it('單筆不合併——組層級只印一次反而讓版面多一列', () => {
    expect(sharedSource([item('甲會理事長', 'https://a')])).toBeNull();
  });
  it('空陣列回傳 null', () => {
    expect(sharedSource([])).toBeNull();
  });
});

describe('會籍、志工與獎項不是社會團體職位', () => {
  // 「擔任職位」才要揭露。純會籍與志工身分不是職位，獎項更不是——把它們掛在
  // 「社會團體／財團法人」標題下，會讓讀者以為當事人在該組織有職務。
  it('終身義工不算職位', () => {
    expect(categorizeCareer('財團法人肝炎防治基金會終身義工')).toBe('other');
  });
  it('永久會員不算職位', () => {
    expect(categorizeCareer('彰化縣信德慈善會永久會員')).toBe('other');
  });
  it('獎項不算職位', () => {
    expect(categorizeCareer('21世紀基金會國會評鑑第九屆優質立委')).toBe('other');
  });
  it('職稱在會籍字樣之後時仍算職位', () => {
    // 「顧問、伴讀組、交通組志工」以志工結尾，但首要身分是顧問
    expect(categorizeCareer('南陽國小家長會顧問、伴讀組、交通組志工')).toBe('social');
  });
  it('會長不因結尾含「會」而誤判', () => {
    expect(categorizeCareer('基隆市婦女會理事長')).toBe('social');
  });
});
