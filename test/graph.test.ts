import { describe, it, expect } from 'vitest';
import { buildGraphData, egoSubgraph } from '../src/lib/graph';
import type { RawEntity, RawRelationship, RawSource } from '../src/lib/types';

const src: RawSource = { id: 's1', url: 'https://j', type: 'court', title: '判決', retrieved_at: '2026-06-24' };
const officials = [
  { id: 'a', slug: 'wang', name: '王又民', party: '無', office_type: 'councilor' as const, photo_url: '/photos/councilors/a.jpg' },
  { id: 'b', slug: 'shen', name: '沈宗隆', party: '無', office_type: 'councilor' as const, photo_url: null },
];
const entities: RawEntity[] = [
  { id: 'e1', name: '白惠萍', entity_type: 'family_member', description: '配偶', photo_url: null, wikipedia_url: null },
];
const rel = (over: Partial<RawRelationship>): RawRelationship => ({
  id: 'r1', from_type: 'official', from_id: 'a', to_type: 'official', to_id: 'b',
  relation_type: 'co_case', directed: false, note: null, source: src, ...over,
});

describe('buildGraphData', () => {
  it('resolves endpoints to node keys and keeps only nodes with an edge', () => {
    const { data, errors } = buildGraphData(officials, entities, [rel({})]);
    expect(errors).toEqual([]);
    expect(data.edges).toHaveLength(1);
    expect(data.edges[0]).toMatchObject({ source: 'official:a', target: 'official:b', type: 'co_case', sourceUrl: 'https://j' });
    expect(data.nodes.map((n) => n.key).sort()).toEqual(['official:a', 'official:b']);
    expect(data.nodes.find((n) => n.key === 'official:a')).toMatchObject({ name: '王又民', kind: 'official', slug: 'wang', subtype: 'councilor' });
  });

  it('includes an entity endpoint as a node with its description', () => {
    const { data } = buildGraphData(officials, entities,
      [rel({ to_type: 'entity', to_id: 'e1', relation_type: 'spouse' })]);
    expect(data.nodes.find((n) => n.key === 'entity:e1')).toMatchObject({ name: '白惠萍', kind: 'entity', subtype: 'family_member', description: '配偶' });
  });

  it('flags a dangling endpoint', () => {
    const { errors } = buildGraphData(officials, entities, [rel({ to_id: 'zzz' })]);
    expect(errors).toContain('relationship r1: endpoint official:zzz not found');
  });

  it('flags a relationship missing a source', () => {
    const { errors } = buildGraphData(officials, entities, [rel({ source: undefined as unknown as RawSource })]);
    expect(errors).toContain('relationship r1: missing source');
  });

  it('dedupes a symmetric (directed=false) edge declared both ways', () => {
    const { data } = buildGraphData(officials, entities, [
      rel({ id: 'r1', from_id: 'a', to_id: 'b' }),
      rel({ id: 'r2', from_id: 'b', to_id: 'a' }),
    ]);
    expect(data.edges).toHaveLength(1);
  });

  it('去重的倖存者恆為 id 較小者，與傳入順序無關（重跑匯出不會讓邊悄悄換方向／換說明）', () => {
    const pair = [
      rel({ id: 'r2', from_id: 'b', to_id: 'a', note: '乙方寫法' }),
      rel({ id: 'r1', from_id: 'a', to_id: 'b', note: '甲方寫法' }),
    ];
    for (const rows of [pair, [...pair].reverse()]) {
      const { data } = buildGraphData(officials, entities, rows);
      expect(data.edges).toHaveLength(1);
      expect(data.edges[0]).toMatchObject({ id: 'r1', source: 'official:a', target: 'official:b', note: '甲方寫法' });
    }
  });

  it('不改動呼叫端傳入的陣列順序', () => {
    const rows = [rel({ id: 'r2' }), rel({ id: 'r1', from_id: 'b', to_id: 'a' })];
    buildGraphData(officials, entities, rows);
    expect(rows.map((r) => r.id)).toEqual(['r2', 'r1']);
  });

  it('keeps both directions distinct for directed edges', () => {
    const { data } = buildGraphData(officials, entities, [
      rel({ id: 'r1', from_id: 'a', to_id: 'b', relation_type: 'parent_child', directed: true }),
      rel({ id: 'r2', from_id: 'b', to_id: 'a', relation_type: 'parent_child', directed: true }),
    ]);
    expect(data.edges).toHaveLength(2);
  });

  it('帶出 official 的 photoUrl', () => {
    const { data } = buildGraphData(officials, entities, [rel({})]);
    expect(data.nodes.find((n) => n.key === 'official:a')).toMatchObject({ photoUrl: '/photos/councilors/a.jpg' });
  });

  it('photo_url 為 null 的 official 不帶 photoUrl 欄位', () => {
    const { data } = buildGraphData(officials, entities, [rel({})]);
    expect(data.nodes.find((n) => n.key === 'official:b')).not.toHaveProperty('photoUrl');
  });
});

describe('egoSubgraph', () => {
  const data = buildGraphData(officials,
    [{ id: 'e1', name: '李四', entity_type: 'other', description: '', photo_url: null, wikipedia_url: null }],
    [
      rel({ id: 'r1', from_id: 'a', to_id: 'b' }),
      rel({ id: 'r2', from_type: 'official', from_id: 'b', to_type: 'entity', to_id: 'e1', relation_type: 'aide' }),
    ],
  ).data;

  it('returns the center plus neighbours within hops', () => {
    const ego1 = egoSubgraph(data, 'official:a', 1);
    expect(ego1.nodes.map((n) => n.key).sort()).toEqual(['official:a', 'official:b']);
    const ego2 = egoSubgraph(data, 'official:a', 2);
    expect(ego2.nodes.map((n) => n.key).sort()).toEqual(['entity:e1', 'official:a', 'official:b']);
  });

  it('returns empty graph for an unknown center', () => {
    expect(egoSubgraph(data, 'official:zzz', 2)).toEqual({ nodes: [], edges: [] });
  });
});
