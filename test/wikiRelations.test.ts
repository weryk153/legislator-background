import { describe, it, expect } from 'vitest';
import { findInfobox, splitTopLevel, parseInfoboxRelations, cleanWikitextInline } from '../scraper/lib/wikiRelations';

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
});
