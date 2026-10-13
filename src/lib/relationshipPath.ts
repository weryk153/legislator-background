import type { GraphData, GraphEdge, GraphNode } from './types';
import { normalizeNameChars } from './nameVariant';

export interface RelationshipIndex {
  nodes: Map<string, GraphNode>;
  adjacent: Map<string, { key: string; edge: GraphEdge }[]>;
}
export type RelationshipPath =
  | { kind: 'invalid' | 'same' | 'disconnected' }
  | { kind: 'found'; nodes: GraphNode[]; edges: GraphEdge[] };

export function publicSourceUrl(value: string): boolean {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); }
  catch { return false; }
}

/** Search connections in either direction; retain the original edge and its explanation. */
export function indexRelationships(data: GraphData): RelationshipIndex {
  const nodes = new Map(data.nodes.map(node => [node.key, node]));
  const adjacent: RelationshipIndex['adjacent'] = new Map([...nodes.keys()].map(key => [key, []]));
  // Sorting makes equal-length alternatives reproducible regardless of export order.
  for (const edge of [...data.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target) || edge.source === edge.target || !publicSourceUrl(edge.sourceUrl)) continue;
    adjacent.get(edge.source)!.push({ key: edge.target, edge });
    adjacent.get(edge.target)!.push({ key: edge.source, edge });
  }
  return { nodes, adjacent };
}

export function shortestRelationshipPath(index: RelationshipIndex, from: string, to: string): RelationshipPath {
  if (!index.nodes.has(from) || !index.nodes.has(to)) return { kind: 'invalid' };
  if (from === to) return { kind: 'same' };
  const parents = new Map<string, { previous: string; edge: GraphEdge }>();
  const seen = new Set([from]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    for (const { key, edge } of index.adjacent.get(queue[head]) ?? []) {
      if (seen.has(key)) continue;
      seen.add(key);
      parents.set(key, { previous: queue[head], edge });
      if (key === to) {
        const keys = [to], edges: GraphEdge[] = [];
        let cursor = to;
        while (cursor !== from) {
          const step = parents.get(cursor)!;
          edges.push(step.edge); keys.push(step.previous); cursor = step.previous;
        }
        return { kind: 'found', nodes: keys.reverse().map(k => index.nodes.get(k)!), edges: edges.reverse() };
      }
      queue.push(key);
    }
  }
  return { kind: 'disconnected' };
}

/** Search names and identity descriptions without merging same-name nodes. */
export function searchRelationshipPeople(nodes: GraphNode[], query: string): GraphNode[] {
  const needle = normalizeNameChars(query.trim()).toLocaleLowerCase();
  if (!needle) return [];
  return nodes.filter(n => n.subtype !== 'organization' && normalizeNameChars(`${n.name} ${n.description ?? ''} ${n.party ?? ''}`).toLocaleLowerCase().includes(needle))
    .sort((a, b) => Number(normalizeNameChars(b.name) === needle) - Number(normalizeNameChars(a.name) === needle)
      || a.name.localeCompare(b.name, 'zh-Hant') || a.key.localeCompare(b.key));
}

export interface RelationshipPair { from: string; to: string; hops: number }
/** A small journey (2–3 steps), with at least one official. Organizations may be intermediates. */
export function connectionPairs(index: RelationshipIndex): RelationshipPair[] {
  const pairs: RelationshipPair[] = [];
  const direct: RelationshipPair[] = [];
  const people = [...index.nodes.values()].filter(n => n.subtype !== 'organization').sort((a, b) => a.key.localeCompare(b.key));
  for (const person of people) {
    const distances = new Map([[person.key, 0]]);
    const queue = [person.key];
    for (let head = 0; head < queue.length; head++) {
      const key = queue[head], depth = distances.get(key)!;
      if (depth >= 3) continue;
      for (const next of index.adjacent.get(key) ?? []) {
        if (distances.has(next.key)) continue;
        const hops = depth + 1;
        distances.set(next.key, hops); queue.push(next.key);
        const other = index.nodes.get(next.key)!;
        if (other.subtype === 'organization' || person.key.localeCompare(other.key) >= 0
          || (person.kind !== 'official' && other.kind !== 'official')) continue;
        const pair = { from: person.key, to: other.key, hops };
        (hops === 1 ? direct : pairs).push(pair);
      }
    }
  }
  return pairs.length ? pairs : direct;
}

export function pickConnectionPair(pairs: RelationshipPair[], from: string, to: string, random = Math.random): RelationshipPair | null {
  const others = pairs.filter(p => !((p.from === from && p.to === to) || (p.from === to && p.to === from)));
  return others.length ? others[Math.min(others.length - 1, Math.max(0, Math.floor(random() * others.length)))] : null;
}

export function connectionHref(from: string, to: string): string {
  return `/graph/connect/?${new URLSearchParams({ from, to })}`;
}
