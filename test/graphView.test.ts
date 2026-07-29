import { describe, it, expect } from 'vitest';
import { nodeDepths, avatarDataUri, toCytoscapeElements } from '../src/lib/graphView';
import type { GraphData } from '../src/lib/types';

const data: GraphData = {
  nodes: [
    { key: 'official:a', name: '王又民', kind: 'official', subtype: 'councilor', slug: 'wang', party: '無', officeType: 'councilor', photoUrl: '/photos/a.jpg' },
    { key: 'entity:e1', name: '白惠萍', kind: 'entity', subtype: 'family_member', description: '配偶' },
    { key: 'official:c', name: '陳某某', kind: 'official', subtype: 'legislator', slug: 'chen', party: '無', officeType: 'legislator' },
  ],
  edges: [
    { id: 'r1', source: 'official:a', target: 'entity:e1', type: 'spouse', directed: false, note: '2014 結婚', sourceUrl: 'https://x' },
    { id: 'r2', source: 'entity:e1', target: 'official:c', type: 'parent_child', directed: true, note: null, sourceUrl: 'https://y' },
  ],
};

describe('nodeDepths', () => {
  it('中心為 0，逐層遞增', () => {
    const d = nodeDepths(data, 'official:a');
    expect(d.get('official:a')).toBe(0);
    expect(d.get('entity:e1')).toBe(1);
    expect(d.get('official:c')).toBe(2);
  });

  it('中心不存在時回傳空 map', () => {
    expect(nodeDepths(data, 'official:zzz').size).toBe(0);
  });
});

describe('avatarDataUri', () => {
  it('用姓名第一個字產生 SVG data URI', () => {
    const uri = avatarDataUri('白惠萍');
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(uri)).toContain('>白<');
  });

  it('跳脫 XML 特殊字元', () => {
    expect(decodeURIComponent(avatarDataUri('<x'))).toContain('&lt;');
  });

  it('空字串不產生破格 SVG', () => {
    expect(decodeURIComponent(avatarDataUri('  '))).toContain('>·<');
  });

  it('姓名第一個字為 non-BMP 字元（如罕見漢字）不拋錯，且完整保留該字元', () => {
    const name = '\u{20BB7}小明';
    expect(() => avatarDataUri(name)).not.toThrow();
    const uri = avatarDataUri(name);
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(uri)).toContain(`>${[...name][0]}<`);
  });
});

describe('toCytoscapeElements', () => {
  it('有照片的節點用照片，沒照片的用姓氏字頭像', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.find((n) => n.data.id === 'official:a')!.data.avatar).toBe('/photos/a.jpg');
    expect(nodes.find((n) => n.data.id === 'entity:e1')!.data.avatar.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('標籤為兩行：姓名 + 括號職稱／類別', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.find((n) => n.data.id === 'official:a')!.data.label).toBe('王又民\n（議員）');
    expect(nodes.find((n) => n.data.id === 'entity:e1')!.data.label).toBe('白惠萍\n（家屬）');
  });

  it('尺寸依深度遞減：中心 88 / 第一層 64 / 第二層 48', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    const size = (id: string) => nodes.find((n) => n.data.id === id)!.data.size;
    expect(size('official:a')).toBe(88);
    expect(size('entity:e1')).toBe(64);
    expect(size('official:c')).toBe(48);
  });

  it('只有中心節點 center=1', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.filter((n) => n.data.center === 1).map((n) => n.data.id)).toEqual(['official:a']);
  });

  it('entity 節點的 slug 為空字串（不可點）', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.find((n) => n.data.id === 'entity:e1')!.data.slug).toBe('');
    expect(nodes.find((n) => n.data.id === 'official:a')!.data.slug).toBe('wang');
  });

  it('邊帶白話關係詞、家族旗標與方向旗標', () => {
    const { edges } = toCytoscapeElements(data, 'official:a');
    expect(edges[0].data).toMatchObject({ label: '配偶', fam: 1, dir: 0, note: '2014 結婚', sourceUrl: 'https://x' });
    expect(edges[1].data).toMatchObject({ label: '親子', fam: 1, dir: 1, note: '' });
  });

  it('政治類關係 fam=0', () => {
    const pol: GraphData = { ...data, edges: [{ ...data.edges[0], type: 'faction' }] };
    expect(toCytoscapeElements(pol, 'official:a').edges[0].data).toMatchObject({ label: '同派系', fam: 0 });
  });

  it('global 模式（centerKey 為 null）所有節點同尺寸、無中心', () => {
    const { nodes } = toCytoscapeElements(data, null);
    expect(nodes.every((n) => n.data.size === 64)).toBe(true);
    expect(nodes.every((n) => n.data.center === 0)).toBe(true);
  });
});
