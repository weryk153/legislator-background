import { describe, it, expect } from 'vitest';
import { extractSocialPositions } from '../scraper/lib/socialCareerExtract';

describe('extractSocialPositions：從 wikitext 抽社團職位', () => {
  it('infobox past 欄位的條列', () => {
    const wt = `{{Infobox officeholder
| name = 甲
| past = * 救國團澎湖縣團委會主任委員
* 澎湖縣地方自治協會理事長
}}`;
    expect(extractSocialPositions(wt)).toEqual(['救國團澎湖縣團委會主任委員', '澎湖縣地方自治協會理事長']);
  });

  it('剝除 infobox 欄位前綴——朝天宮那筆就卡在這裡', () => {
    const wt = '| office1 = 第9－11屆北港朝天宮董事長\n';
    expect(extractSocialPositions(wt)).toEqual(['第9－11屆北港朝天宮董事長']);
  });

  it('一行多筆以頓號分隔時拆開', () => {
    const wt = '* 台中市何氏宗親會理事長、新民高級中學校友會理事長\n';
    expect(extractSocialPositions(wt)).toEqual(['台中市何氏宗親會理事長', '新民高級中學校友會理事長']);
  });

  it('屆次列舉裡的頓號不是職務分隔——切開會產生沒有機構名的碎片', () => {
    // 「觀音國小第6、7屆家長會長」若在頓號處切開，會得到「觀音國小第6」（無職稱，丟棄）
    // 與「7屆家長會長」（沒有學校名的碎片）——後者會被當成一筆職務寫進資料庫
    expect(extractSocialPositions('* 觀音國小第6、7屆家長會長\n')).toEqual(['觀音國小第6、7屆家長會長']);
    expect(extractSocialPositions('* 蘆竹區第1、2屆張廖簡宗親會理事長\n')).toEqual(['蘆竹區第1、2屆張廖簡宗親會理事長']);
  });

  it('屆次列舉之外的頓號仍要切開', () => {
    expect(extractSocialPositions('* 八德區林姓宗親會理事長、運動協會理事長\n'))
      .toEqual(['八德區林姓宗親會理事長', '運動協會理事長']);
  });

  it('剝除 wiki 標記與參考資料', () => {
    const wt = "* [[北港朝天宮]]董事長<ref>{{cite news|url=https://x}}</ref>\n";
    expect(extractSocialPositions(wt)).toEqual(['北港朝天宮董事長']);
  });

  it('非條列的散文不取——避免把別人的職位當成本人的', () => {
    // 蔣月惠條目裡這句講的是葉奉達，不是本人
    const wt = '屏東縣環境保護聯盟理事長葉奉達（同時也是TVBS記者）表示，該案……\n';
    expect(extractSocialPositions(wt)).toEqual([]);
  });

  it('沒有職稱的條列不取', () => {
    expect(extractSocialPositions('* 土城區體育會柔道角力摔角委員會\n')).toEqual([]);
  });

  it('公職與黨職不取——那是另外兩組', () => {
    const wt = '* 第11屆立法委員\n* 中國國民黨中央委員\n* 臺北市政府法務局局長\n';
    expect(extractSocialPositions(wt)).toEqual([]);
  });

  it('過長與過短的片段不取', () => {
    expect(extractSocialPositions('* 會長\n')).toEqual([]);
    expect(extractSocialPositions('* ' + '協會理事長'.repeat(12) + '\n')).toEqual([]);
  });

  it('同一職位重複出現只取一次', () => {
    const wt = '* 甲乙丙協會理事長\n| past = * 甲乙丙協會理事長\n';
    expect(extractSocialPositions(wt)).toEqual(['甲乙丙協會理事長']);
  });
});
