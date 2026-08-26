import { describe, it, expect } from 'vitest';
import { nodeDepths, avatarDataUri, toCytoscapeElements, entityRole, wrapRole } from '../src/lib/graphView';
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

  it('顯式寬高屬性防止瀏覽器使用預設 150×150 尺寸（修正 Cytoscape 高倍放大時裁切問題）', () => {
    const uri = avatarDataUri('李');
    const svg = decodeURIComponent(uri);
    expect(svg).toContain('width="100"');
    expect(svg).toContain('height="100"');
  });
});

describe('entityRole', () => {
  it('優先用描述，沒有描述才退回類別標籤', () => {
    expect(entityRole('民宿經營者', 'family_member')).toBe('民宿經營者');
    expect(entityRole(undefined, 'family_member')).toBe('家屬');
    expect(entityRole('', 'religious')).toBe('宗教界');
  });

  it('不截斷（/graph 的伺服器清單用，版面容得下完整描述）', () => {
    const long = '前雲林縣議員、維多利亞學校財團法人董事長';
    expect(entityRole(long, 'family_member')).toBe(long);
  });

  it('未知類別退回「其他公眾人物」', () => {
    expect(entityRole(undefined, 'nonsense')).toBe('其他公眾人物');
  });
});

describe('wrapRole', () => {
  it('8 字以內不動', () => {
    expect(wrapRole('民宿經營者')).toBe('民宿經營者');
    expect(wrapRole('立委')).toBe('立委');
  });

  it('超過 8 字自行斷行（Cytoscape 的 text-wrap 不會在中文斷行）', () => {
    expect(wrapRole('前國民黨主席、前中華民國副總統')).toBe('前國民黨主席、前\n中華民國副總統');
  });

  it('超過兩行即截斷，末字換成省略號', () => {
    const r = wrapRole('前雲林縣議員、維多利亞學校財團法人董事長');
    expect(r).toBe('前雲林縣議員、維\n多利亞學校財團…');
    expect(r.split('\n')).toHaveLength(2);
    expect(r.split('\n').every((l) => [...l].length <= 8)).toBe(true);
  });
});

describe('toCytoscapeElements', () => {
  it('有照片的節點用照片，沒照片的用姓氏字頭像', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.find((n) => n.data.id === 'official:a')!.data.avatar).toBe('/photos/a.jpg');
    expect(nodes.find((n) => n.data.id === 'entity:e1')!.data.avatar.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('標籤為兩行：姓名 + 括號職稱（公職）／描述（外部人物）', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.find((n) => n.data.id === 'official:a')!.data.label).toBe('王又民\n（議員）');
    expect(nodes.find((n) => n.data.id === 'entity:e1')!.data.label).toBe('白惠萍\n（配偶）');
  });

  it('同名不同人的 entity 因描述不同而標籤可區分（不可再顯示為兩個一模一樣的節點）', () => {
    const dup: GraphData = {
      nodes: [
        { key: 'entity:x', name: '李佳芬', kind: 'entity', subtype: 'family_member', description: '民宿經營者' },
        { key: 'entity:y', name: '李佳芬', kind: 'entity', subtype: 'family_member', description: '前雲林縣議員' },
        // 兩人的第二行不同 → 節點在圖上可區分
      ],
      edges: [],
    };
    const labels = toCytoscapeElements(dup, null).nodes.map((n) => n.data.label);
    expect(labels).toEqual(['李佳芬\n（民宿經營者）', '李佳芬\n（前雲林縣議員）']);
  });

  it('沒有描述的 entity 退回通用類別標籤', () => {
    const noDesc: GraphData = {
      nodes: [{ key: 'entity:z', name: '某人', kind: 'entity', subtype: 'businessperson', description: '  ' }],
      edges: [],
    };
    expect(toCytoscapeElements(noDesc, null).nodes[0].data.label).toBe('某人\n（企業界）');
  });

  it('圖上的長描述會斷行並截斷（避免單行橫跨畫面蓋掉邊標籤）', () => {
    const long: GraphData = {
      nodes: [{
        key: 'entity:l', name: '李傑', kind: 'entity', subtype: 'other',
        description: '前國防部長、前海軍總司令、海軍上將',
      }],
      edges: [],
    };
    expect(toCytoscapeElements(long, null).nodes[0].data.label).toBe('李傑\n（前國防部長、前海\n軍總司令、海軍…）');
  });

  it('name 為純姓名，不含職稱與換行，供搜尋比對', () => {
    const { nodes } = toCytoscapeElements(data, 'official:a');
    expect(nodes.find((n) => n.data.id === 'official:a')!.data.name).toBe('王又民');
    expect(nodes.find((n) => n.data.id === 'entity:e1')!.data.name).toBe('白惠萍');
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

describe('toCytoscapeElements：entity 照片與 tooltip 資料', () => {
  const withPhoto: GraphData = {
    nodes: [
      { key: 'official:a', name: '王又民', kind: 'official', subtype: 'councilor', slug: 'wang', party: '無', officeType: 'councilor' },
      { key: 'entity:k', name: '柯文哲', kind: 'entity', subtype: 'other', description: '台灣民眾黨創黨主席',
        photoUrl: '/photos/entities/柯文哲.jpg', photoCredit: '王小明／CC BY-SA 4.0',
        photoSourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
        wikipediaUrl: 'https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2' },
    ],
    edges: [{ id: 'r1', source: 'official:a', target: 'entity:k', type: 'mentor', directed: false, note: null, sourceUrl: 'https://x' }],
  };
  it('entity 有 photoUrl 時 avatar 為該 URL', () => {
    const { nodes } = toCytoscapeElements(withPhoto, 'official:a');
    expect(nodes.find((n) => n.data.id === 'entity:k')!.data.avatar).toBe('/photos/entities/柯文哲.jpg');
  });
  it('entity 帶 description / wikipediaUrl / photoCredit / photoSourceUrl；official 為空字串', () => {
    const { nodes } = toCytoscapeElements(withPhoto, 'official:a');
    expect(nodes.find((n) => n.data.id === 'entity:k')!.data).toMatchObject({
      description: '台灣民眾黨創黨主席',
      wikipediaUrl: 'https://zh.wikipedia.org/wiki/%E6%9F%AF%E6%96%87%E5%93%B2',
      photoCredit: '王小明／CC BY-SA 4.0',
      photoSourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
    });
    expect(nodes.find((n) => n.data.id === 'official:a')!.data).toMatchObject({
      description: '', wikipediaUrl: '', photoCredit: '', photoSourceUrl: '',
    });
  });
});
