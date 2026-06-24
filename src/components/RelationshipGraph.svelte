<script lang="ts">
  import { onMount } from 'svelte';
  import type { GraphNode, GraphEdge } from '../lib/types';

  let { nodes, edges, centerKey }: { nodes: GraphNode[]; edges: GraphEdge[]; centerKey: string } = $props();

  // relation_type → 中文標籤 + 是否家族（家族實線、政治虛線）
  const REL_LABEL: Record<string, string> = {
    spouse: '配偶', parent_child: '親子', sibling: '手足', relative: '親屬',
    faction: '派系', mentor: '師徒', party_bloc: '黨團', aide: '助理', backer: '金主', co_case: '同案',
  };
  const FAMILY = new Set(['spouse', 'parent_child', 'sibling', 'relative']);

  let container: HTMLDivElement;

  onMount(async () => {
    const cytoscape = (await import('cytoscape')).default;
    const cy = cytoscape({
      container,
      elements: [
        ...nodes.map((n) => ({ data: { id: n.key, label: n.name, slug: n.slug ?? '', kind: n.kind, center: n.key === centerKey ? 1 : 0 } })),
        ...edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: REL_LABEL[e.type] ?? e.type, fam: FAMILY.has(e.type) ? 1 : 0, dir: e.directed ? 1 : 0 } })),
      ],
      style: [
        { selector: 'node', style: { label: 'data(label)', 'font-size': 12, 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#cbd5e1', 'border-width': 2, 'border-color': '#94a3b8', shape: 'round-rectangle', width: 'label', height: 28, padding: '6px', color: '#0f172a' } },
        { selector: 'node[kind = "official"]', style: { 'background-color': '#1e293b', color: '#f8fafc', 'border-color': '#334155' } },
        { selector: 'node[center = 1]', style: { 'border-color': '#b3261e', 'border-width': 3 } },
        { selector: 'edge', style: { label: 'data(label)', 'font-size': 10, 'curve-style': 'bezier', width: 1.5, 'line-color': '#94a3b8', 'target-arrow-color': '#94a3b8', color: '#475569', 'text-background-color': '#fff', 'text-background-opacity': 1, 'text-background-padding': '2px' } },
        { selector: 'edge[fam = 1]', style: { 'line-color': '#0f766e', 'line-style': 'solid' } },
        { selector: 'edge[fam = 0]', style: { 'line-style': 'dashed' } },
        { selector: 'edge[dir = 1]', style: { 'target-arrow-shape': 'triangle' } },
      ],
      layout: { name: 'concentric', concentric: (n: { data: (k: string) => number }) => n.data('center'), levelWidth: () => 1, minNodeSpacing: 40 },
      userZoomingEnabled: true, autoungrabify: false,
    });
    cy.on('tap', 'node[slug]', (evt: { target: { data: (k: string) => string } }) => {
      const slug = evt.target.data('slug');
      if (slug) window.location.href = `/officials/${slug}`;
    });
  });
</script>

<div bind:this={container} class="graph" role="img" aria-label="人物關係圖"></div>

<style>
  .graph { width: 100%; height: 360px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
</style>
