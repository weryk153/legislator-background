import { describe, it, expect } from 'vitest';
import { findInfobox, splitTopLevel, parseInfoboxRelations, cleanWikitextInline, extractRelationSentences, FAMILY_KEYWORDS, POLITICAL_KEYWORDS } from '../scraper/lib/wikiRelations';

const page = `{{Infobox officeholder
| name = 柯文哲
| image = Ko.jpg
| spouse = [[陳佩琪]]（1991年結婚）
| parents = 柯承發（父）<br />何瑞英（母）
| children = 2子1女
| relatives = {{ubl|[[柯承發|柯承發]]|[[何瑞英]]}}
| party = {{TPP}}
}}
'''柯文哲'''（{{bd|1959年|8月6日}}）是-{zh-tw:臺灣;zh-cn:台湾}-政治人物。<ref>x</ref>
== 家庭 ==
柯文哲之妻[[陳佩琪]]為醫師。`;

describe('findInfobox', () => {
  it('取出最外層 Infobox 模板（含巢狀模板）', () => {
    const box = findInfobox(page)!;
    expect(box.startsWith('{{Infobox officeholder')).toBe(true);
    expect(box.endsWith('}}')).toBe(true);
    expect(box).toContain('{{ubl|[[柯承發|柯承發]]|[[何瑞英]]}}');
    expect(box).not.toContain("'''柯文哲'''");
  });
  it('中文信息框名稱也算', () => {
    expect(findInfobox('{{政治人物信息框\n| 配偶 = 甲\n}}')).not.toBeNull();
  });
  it('沒有 infobox → null', () => {
    expect(findInfobox('純文字')).toBeNull();
  });
});

describe('splitTopLevel', () => {
  it('不切巢狀模板／連結內的分隔字元', () => {
    expect(splitTopLevel('a|{{x|y}}|[[b|c]]|d', '|')).toEqual(['a', '{{x|y}}', '[[b|c]]', 'd']);
  });
});

describe('cleanWikitextInline', () => {
  it('去 ref／模板／粗體，連結取顯示文字，-{}- 取 zh-tw', () => {
    expect(cleanWikitextInline("'''甲'''<ref>r</ref>是-{zh-tw:臺灣;zh-cn:台湾}-[[乙|丙]]{{fact}}")).toBe('甲是臺灣丙');
  });
});

describe('parseInfoboxRelations', () => {
  const rels = parseInfoboxRelations(page);
  it('配偶：取連結標題，附註括號從 name 去掉、raw 保留', () => {
    expect(rels).toContainEqual({ field: 'spouse', name: '陳佩琪', wikilinkTitle: '陳佩琪', raw: '[[陳佩琪]]（1991年結婚）' });
  });
  it('<br> 分隔的多值各成一筆；無連結者無 wikilinkTitle', () => {
    expect(rels).toContainEqual({ field: 'parents', name: '柯承發', raw: '柯承發（父）' });
    expect(rels).toContainEqual({ field: 'parents', name: '何瑞英', raw: '何瑞英（母）' });
  });
  it('{{ubl}} 內的項目各成一筆', () => {
    expect(rels.filter((r) => r.field === 'relatives').map((r) => r.name)).toEqual(['柯承發', '何瑞英']);
  });
  it('純數字描述（2子1女）不當人名', () => {
    expect(rels.find((r) => r.field === 'children')).toBeUndefined();
  });
  it('非關係欄位（party、image）不出現', () => {
    expect(rels.some((r) => r.field === 'party' || r.field === 'image')).toBe(false);
  });
  it('無 infobox → []', () => {
    expect(parseInfoboxRelations('沒有')).toEqual([]);
  });
  it('{{ubl}} 內含巢狀模板（如 {{le|…}}）不產生殘缺片段', () => {
    const nested = parseInfoboxRelations('{{Infobox officeholder\n| relatives = {{ubl|[[小明]]|{{le|小華|Xiao Hua}}}}\n}}');
    const names = nested.filter((r) => r.field === 'relatives').map((r) => r.name);
    expect(names.every((n) => !n.includes('{{') && n !== '}}')).toBe(true);
    expect(names).toContain('小明');
  });
  it('parents：<br> 帶屬性（clear="all"）也視為分隔', () => {
    const withAttr = parseInfoboxRelations('{{Infobox officeholder\n| parents = 父親甲<br clear="all">母親乙\n}}');
    expect(withAttr.filter((r) => r.field === 'parents').map((r) => r.name)).toEqual(['父親甲', '母親乙']);
  });
  it('{{ubl|class=x|…}} 的具名參數（class=／style=）不當人名', () => {
    const withClass = parseInfoboxRelations('{{Infobox officeholder\n| relatives = {{ubl|class=x|[[甲]]|style=color:red|[[乙]]}}\n}}');
    expect(withClass.filter((r) => r.field === 'relatives').map((r) => r.name)).toEqual(['甲', '乙']);
  });
});

describe('extractRelationSentences', () => {
  const wt = `{{Infobox officeholder|name=甲}}
'''甲'''是政治人物。<ref>r</ref>其妻[[乙 (醫師)|乙]]為醫師，兩人育有二子。
2014年甲在[[丙]]力挺下參選。[[File:x.jpg|thumb|說明]]
甲喜歡騎腳踏車。
== 家庭 ==
甲之弟[[丁]]曾任[[戊市]]市議員；師承[[己]]。`;
  const out = extractRelationSentences(wt);
  it('只留命中關鍵字的句子，並附上句內連結標題（排除 File）', () => {
    expect(out).toContainEqual({ sentence: '其妻乙為醫師，兩人育有二子', keywords: ['妻'], wikilinks: ['乙 (醫師)'] });
    expect(out).toContainEqual({ sentence: '2014年甲在丙力挺下參選', keywords: ['力挺'], wikilinks: ['丙'] });
    expect(out).toContainEqual({ sentence: '甲之弟丁曾任戊市市議員；師承己', keywords: ['之弟', '師承'], wikilinks: ['丁', '戊市', '己'] });
  });
  it('沒關鍵字的句子不出現；infobox 與 ref 內容不出現', () => {
    expect(out.some((s) => s.sentence.includes('腳踏車'))).toBe(false);
    expect(out.some((s) => s.sentence.includes('name=甲'))).toBe(false);
  });
  it('File 說明文字內的巢狀連結不會外洩到句子或 wikilinks', () => {
    const wt2 = '甲之妻[[乙]]與其合影，[[File:x.jpg|thumb|甲與[[丙]]合影於婚禮]]傳為佳話。';
    const out2 = extractRelationSentences(wt2);
    expect(out2).toContainEqual({ sentence: '甲之妻乙與其合影，傳為佳話', keywords: ['妻'], wikilinks: ['乙'] });
    expect(out2.some((s) => s.sentence.includes(']]') || s.sentence.includes('合影於婚禮'))).toBe(false);
    expect(out2.some((s) => s.wikilinks.includes('丙'))).toBe(false);
  });
  it('換行不會攔腰截斷句子：關鍵字與其後緊接的連結仍在同一句', () => {
    const out4 = extractRelationSentences('甲之妻為\n[[乙]]，育有二子。');
    expect(out4).toContainEqual({ sentence: '甲之妻為 乙，育有二子', keywords: ['妻'], wikilinks: ['乙'] });
  });
  it('外部呼叫關鍵字正規表達式的 .test() 弄髒 lastIndex 後，extractRelationSentences 仍正確抽取', () => {
    FAMILY_KEYWORDS.test('甲甲甲甲甲妻'); // 模擬外部誤用：讓 lastIndex 停在非 0 處
    POLITICAL_KEYWORDS.test('甲甲甲甲師承'); // 同上，弄髒 POLITICAL_KEYWORDS 的 lastIndex
    const out3 = extractRelationSentences('其妻[[乙]]為醫師，師承[[己]]。');
    expect(out3).toContainEqual({ sentence: '其妻乙為醫師，師承己', keywords: ['妻', '師承'], wikilinks: ['乙', '己'] });
  });
});
