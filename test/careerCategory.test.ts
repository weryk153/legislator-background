import { describe, it, expect } from 'vitest';
import { categorizeCareer, careerText } from '../src/lib/careerCategory';

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
