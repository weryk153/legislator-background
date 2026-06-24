<script lang="ts">
  import { onMount } from 'svelte';
  import type { GraphNode, GraphEdge } from '../lib/types';

  let { nodes, edges, centerKey }: { nodes: GraphNode[]; edges: GraphEdge[]; centerKey: string } = $props();

  // relation_type → 白話標籤。家族＝實線、政治＝虛線。
  const REL_LABEL: Record<string, string> = {
    spouse: '配偶', parent_child: '親子', sibling: '手足', relative: '親屬',
    faction: '同派系', mentor: '師徒', party_bloc: '同黨團', aide: '助理', backer: '金主', co_case: '共同被告',
  };
  const FAMILY = new Set(['spouse', 'parent_child', 'sibling', 'relative']);

  let container: HTMLDivElement;

  // 讀網站設計 tokens（隨亮/暗模式變動），餵給 Cytoscape，讓圖與全站同調。
  function readColors() {
    const c = getComputedStyle(document.documentElement);
    const v = (n: string) => c.getPropertyValue(n).trim();
    return {
      bg: v('--bg'), surface: v('--surface'), fg: v('--fg'), muted: v('--muted'),
      faint: v('--faint'), line: v('--line-strong'), accent: v('--accent'),
      accentWash: v('--accent-wash'), serif: v('--serif'), sans: v('--sans'),
    };
  }

  function buildStyle(c: ReturnType<typeof readColors>) {
    return [
      { selector: 'node', style: {
        label: 'data(label)', 'font-family': c.serif, 'font-size': 14, 'font-weight': 600,
        'text-valign': 'center', 'text-halign': 'center', color: c.fg,
        'background-color': c.surface, 'border-width': 1, 'border-color': c.line,
        shape: 'round-rectangle', width: 'label', height: 'label',
        'padding': '11px', 'text-max-width': '120',
      } },
      // 外部公眾人物：虛框、灰字、紙色底，視覺次於公職
      { selector: 'node[kind = "entity"]', style: {
        'background-color': c.bg, 'border-style': 'dashed', 'border-color': c.line,
        color: c.muted, 'font-weight': 500,
      } },
      // 目前所在人物：朱紅框強調（底維持紙色，克制不搶眼）。Cytoscape 會忽略 rgba alpha，故不用淡紅底。
      { selector: 'node[center = 1]', style: {
        'border-color': c.accent, 'border-width': 2.5,
      } },
      { selector: 'edge', style: {
        label: 'data(label)', 'font-family': c.sans, 'font-size': 11, color: c.muted,
        'curve-style': 'bezier', width: 1.4, 'line-color': c.faint, 'target-arrow-color': c.faint,
        'text-background-color': c.bg, 'text-background-opacity': 1, 'text-background-padding': '3px',
      } },
      { selector: 'edge[fam = 1]', style: { 'line-color': c.muted, 'line-style': 'solid' } },
      { selector: 'edge[fam = 0]', style: { 'line-style': 'dashed' } },
      { selector: 'edge[dir = 1]', style: { 'target-arrow-shape': 'triangle', 'arrow-scale': 0.9 } },
      { selector: 'edge.hl', style: { 'line-color': c.accent, 'target-arrow-color': c.accent, color: c.accent, width: 2 } },
    ];
  }

  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

  onMount(async () => {
    const cytoscape = (await import('cytoscape')).default;
    const cy = cytoscape({
      container,
      elements: [
        ...nodes.map((n) => ({ data: { id: n.key, label: n.name, slug: n.slug ?? '', kind: n.kind, center: n.key === centerKey ? 1 : 0 } })),
        ...edges.map((e) => ({ data: {
          id: e.id, source: e.source, target: e.target,
          label: REL_LABEL[e.type] ?? e.type, fam: FAMILY.has(e.type) ? 1 : 0, dir: e.directed ? 1 : 0,
          note: e.note ?? '', sourceUrl: e.sourceUrl ?? '',
        } })),
      ],
      style: buildStyle(readColors()),
      layout: { name: 'preset' },
      userZoomingEnabled: true, autoungrabify: false,
    });

    // 以「目前所在人物」為頂點的由上而下階層：本人在上，關係人在下。
    cy.layout({ name: 'breadthfirst', roots: cy.getElementById(centerKey), directed: false, spacingFactor: 1.35, padding: 24, animate: false }).run();

    // 點公職節點 → 進其檔案頁（entity 無 slug，不觸發）
    cy.on('tap', 'node[slug]', (evt: { target: { data: (k: string) => string } }) => {
      const slug = evt.target.data('slug');
      if (slug) window.location.href = `/officials/${slug}`;
    });

    // hover 連線 → tooltip（關係＋說明＋出處）。tooltip 自身可 hover，方便點出處連結。
    const tip = document.createElement('div');
    tip.className = 'rg-tip';
    container.appendChild(tip);
    let hideTimer: ReturnType<typeof setTimeout>;
    const hideSoon = () => { hideTimer = setTimeout(() => { tip.style.opacity = '0'; tip.style.pointerEvents = 'none'; }, 250); };
    tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    tip.addEventListener('mouseleave', hideSoon);

    cy.on('mouseover', 'edge', (evt: any) => {
      clearTimeout(hideTimer);
      evt.target.addClass('hl');
      const d = evt.target.data();
      const note = d.note ? `<div class="rg-note">${esc(d.note)}</div>` : '';
      const src = d.sourceUrl ? `<a class="rg-src" href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">查看出處 ↗</a>` : '';
      const m = evt.target.renderedMidpoint();
      tip.innerHTML = `<div class="rg-rel">${esc(d.label)}</div>${note}${src}`;
      tip.style.left = `${m.x}px`;
      tip.style.top = `${m.y}px`;
      tip.style.opacity = '1';
      tip.style.pointerEvents = 'auto';
    });
    cy.on('mouseout', 'edge', (evt: any) => { evt.target.removeClass('hl'); hideSoon(); });

    // 跟著亮/暗模式切換重新上色
    const mo = new MutationObserver(() => cy.style(buildStyle(readColors())).update());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => { mo.disconnect(); cy.destroy(); };
  });
</script>

<div bind:this={container} class="graph" role="img" aria-label="人物關係圖"></div>

<style>
  .graph {
    position: relative;
    width: 100%; height: 380px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  :global(.rg-tip) {
    position: absolute;
    transform: translate(-50%, calc(-100% - 12px));
    max-width: 240px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 8px 11px;
    font-family: var(--sans);
    font-size: var(--t-sm);
    color: var(--muted);
    line-height: 1.55;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
    z-index: 5;
  }
  :global(.rg-tip .rg-rel) { font-weight: 700; color: var(--fg); margin-bottom: 2px; }
  :global(.rg-tip .rg-note) { margin-bottom: 4px; }
  :global(.rg-tip .rg-src) { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
</style>
