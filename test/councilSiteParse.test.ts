import { describe, it, expect } from 'vitest';
import { parseCareerBlock } from '../scraper/lib/councilSiteParse';

describe('parseCareerBlock：從議會個人頁純文字抽經歷條列', () => {
  it('屏東式：「經歷：」後每行一筆', () => {
    const t = `梁育慈\n經歷：\n台灣大學政治學系\n高雄女中\n台北市議員梁文傑辦公室主任\n民進黨台北市黨部第18屆市代\n聯絡方式\n電話 08-1234567`;
    expect(parseCareerBlock(t)).toEqual([
      '台灣大學政治學系', '高雄女中', '台北市議員梁文傑辦公室主任', '民進黨台北市黨部第18屆市代',
    ]);
  });

  it('臺南式：「學歷」與「經歷」兩段，只取經歷', () => {
    const t = `學歷\n新營國小\n文化大學法律系財經組\n經歷\n北臺南家扶中心扶幼委員\n救國團南市指導委員\n政見\n一、推動…`;
    expect(parseCareerBlock(t)).toEqual(['北臺南家扶中心扶幼委員', '救國團南市指導委員']);
  });

  it('桃園式：阿拉伯數字編號', () => {
    const t = `經歷\n1. 桃園市議會第1、2屆議長\n2. 桃園縣中壢市丘（邱）姓宗親會理事長\n3. 桃園市機車商業同會公會顧問\n政見`;
    expect(parseCareerBlock(t)).toEqual([
      '桃園市議會第1、2屆議長', '桃園縣中壢市丘（邱）姓宗親會理事長', '桃園市機車商業同會公會顧問',
    ]);
  });

  it('彰化式：中文數字編號、句號結尾，且標題不叫「經歷」', () => {
    const t = `簡介\n五、台灣體育總會籃球協會會長。\n六、彰化縣警察局北斗分局警友會顧問。\n七、中華民國縣市體育會聯合總會常務監事。\n網站錯誤回報`;
    expect(parseCareerBlock(t)).toEqual([
      '台灣體育總會籃球協會會長', '彰化縣警察局北斗分局警友會顧問', '中華民國縣市體育會聯合總會常務監事',
    ]);
  });

  it('遇到頁尾導覽字樣就停止', () => {
    const t = `經歷\n某某協會理事長\n回上頁\n到上面\n網站導覽`;
    expect(parseCareerBlock(t)).toEqual(['某某協會理事長']);
  });

  it('沒有可辨識的經歷段落時回空陣列', () => {
    expect(parseCareerBlock('姓名 選區 電話 傳真')).toEqual([]);
  });

  it('過短、過長與純數字的行不取', () => {
    const t = `經歷\n甲\n${'很長的職務名稱'.repeat(12)}\n2022\n正常的某某協會理事長`;
    expect(parseCareerBlock(t)).toEqual(['正常的某某協會理事長']);
  });
});
