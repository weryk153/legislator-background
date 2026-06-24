import { describe, it, expect } from 'vitest';
import { buildGraphData, egoSubgraph } from '../src/lib/graph';
import type { RawEntity, RawRelationship, RawSource } from '../src/lib/types';

const src: RawSource = { id: 's1', url: 'https://j', type: 'court', title: '判決', retrieved_at: '2026-06-24' };
const officials = [
  { id: 'a', slug: 'wang', name: '王又民', party: '無', office_type: 'councilor' as const },
  { id: 'b', slug: 'shen', name: '沈宗隆', party: '無', office_type: 'councilor' as const },
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

  it('keeps both directions distinct for directed edges', () => {
    const { data } = buildGraphData(officials, entities, [
      rel({ id: 'r1', from_id: 'a', to_id: 'b', relation_type: 'parent_child', directed: true }),
      rel({ id: 'r2', from_id: 'b', to_id: 'a', relation_type: 'parent_child', directed: true }),
    ]);
    expect(data.edges).toHaveLength(2);
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
