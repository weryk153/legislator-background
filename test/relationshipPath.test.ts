import { describe, expect, it } from 'vitest';
import { indexRelationships, shortestRelationshipPath, searchRelationshipPeople, connectionPairs, pickConnectionPair, connectionHref } from '../src/lib/relationshipPath';
import { loadGraph } from '../src/lib/loadGraph';
import type { GraphData, GraphEdge, GraphNode } from '../src/lib/types';
const node = (key: string, name = key, subtype = 'legislator'): GraphNode => ({ key, name, kind: subtype === 'legislator' ? 'official' : 'entity', subtype });
const edge = (id: string, source: string, target: string, directed = false): GraphEdge => ({ id, source, target, directed, type: 'mentor', note: `${source} 原始說明 ${target}`, sourceUrl: 'https://example.org/source' });
const data: GraphData = { nodes: ['a', 'b', 'c', 'd', 'e'].map(k => node(k)), edges: [edge('ab','a','b'),edge('bc','b','c',true),edge('ac','a','c'),edge('cd','c','d')] };

describe('relationship paths', () => {
  it('finds the fewest edges, even with cycles; retains original directed evidence when searched backwards', () => {
    const index = indexRelationships(data);
    expect(shortestRelationshipPath(index,'a','d')).toMatchObject({ kind:'found', nodes:[{key:'a'},{key:'c'},{key:'d'}], edges:[{id:'ac'},{id:'cd'}] });
    const reverse = shortestRelationshipPath(index,'c','b');
    expect(reverse).toMatchObject({kind:'found', nodes:[{key:'c'},{key:'b'}], edges:[data.edges[1]]});
    expect(data.edges[1].source).toBe('b');
  });
  it('distinguishes same person, invalid links, disconnected components and empty data', () => {
    const index = indexRelationships(data);
    expect(shortestRelationshipPath(index,'a','a').kind).toBe('same');
    expect(shortestRelationshipPath(index,'a','unknown').kind).toBe('invalid');
    expect(shortestRelationshipPath(index,'a','e').kind).toBe('disconnected');
    expect(shortestRelationshipPath(indexRelationships({nodes:[],edges:[]}),'a','b').kind).toBe('invalid');
  });
  it('uses reproducible tie breaking, skips unsourced and dangling edges, and permits organizations as intermediates', () => {
    const graph = { nodes:[node('a'),node('b'),node('org','組織','organization'),node('c')], edges:[edge('z','a','c'),edge('zc','c','b'),edge('a','a','org'),edge('ab','org','b'),{...edge('unsafe','a','b'),sourceUrl:'javascript:alert(1)'},edge('dangling','a','unknown')] };
    for (const edges of [graph.edges,[...graph.edges].reverse()]) {
      expect(shortestRelationshipPath(indexRelationships({...graph,edges}),'a','b')).toMatchObject({kind:'found',nodes:[{key:'a'},{key:'org'},{key:'b'}]});
    }
  });
  it('does not collapse homonyms, supports known name variants and searches identity descriptions', () => {
    const people = [{...node('one','李傑','other'),description:'教授'}, {...node('two','李傑','other'),description:'海軍上將'}, node('three','戴瑋姍'),node('org','李傑組織','organization')];
    expect(searchRelationshipPeople(people,'李傑').map(n=>n.key)).toEqual(['one','two']);
    expect(searchRelationshipPeople(people,' 海軍 ').map(n=>n.key)).toEqual(['two']);
    expect(searchRelationshipPeople(people,'戴瑋姗').map(n=>n.key)).toEqual(['three']);
    expect(searchRelationshipPeople(people,' ')).toEqual([]);
  });
  it('random suggestions are connected, exclude organizations as endpoints and do not repeat the selected unordered pair', () => {
    const graph = { nodes:[node('a'),node('org','組織','organization'),node('b'),node('c')], edges:[edge('a-org','a','org'),edge('org-b','org','b'),edge('b-c','b','c')] };
    const index=indexRelationships(graph),pairs=connectionPairs(index);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) { expect([p.from,p.to]).not.toContain('org');expect(shortestRelationshipPath(index,p.from,p.to)).toMatchObject({kind:'found'});expect([2,3]).toContain(p.hops); }
    const first=pairs[0];
    const next=pickConnectionPair(pairs,first.to,first.from,()=>0);
    expect(next).not.toEqual(first);
    expect(pickConnectionPair([first],first.from,first.to)).toBeNull();
    expect(connectionPairs(indexRelationships({nodes:[],edges:[]}))).toEqual([]);
  });
  it('round-trips stable identity keys in share URLs', () => {
    const link=new URL(connectionHref('official:a&b','entity:中文'),'https://example.org');
    expect(link.searchParams.get('from')).toBe('official:a&b');expect(link.searchParams.get('to')).toBe('entity:中文');
  });
  it('uses existing published source records and preserves same-name identities', () => {
    const graph=loadGraph(),index=indexRelationships(graph);
    const from=graph.nodes.find(n=>n.name==='林佳龍')!,to=graph.nodes.find(n=>n.name==='卓冠廷')!;
    const path=shortestRelationshipPath(index,from.key,to.key);
    expect(path.kind).toBe('found');
    if(path.kind==='found'){expect(path.edges).toHaveLength(2);expect(path.nodes[1].subtype).toBe('organization');expect(path.edges.every(e=>graph.edges.some(original=>original===e))).toBe(true);}
    expect(searchRelationshipPeople(graph.nodes,'李佳芬')).toHaveLength(2);
    expect(searchRelationshipPeople(graph.nodes,'李傑')).toHaveLength(2);
  });
});
