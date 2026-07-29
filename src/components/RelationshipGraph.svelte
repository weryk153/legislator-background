<!-- 人物關係圖。ego（檔案頁，以本人為中心）與 global（/graph 全圖）共用同一套視覺。
     資料轉換在 src/lib/graphView.ts，本檔只負責掛載 Cytoscape 與樣式。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { GraphData } from '../lib/types';
  import { toCytoscapeElements } from '../lib/graphView';

  let { data, centerKey = null, mode = 'ego' }:
    { data: GraphData; centerKey?: string | null; mode?: 'ego' | 'global' } = $props();

  let container: HTMLDivElement;

  // 讀網站設計 tokens（隨亮/暗模式變動），餵給 Cytoscape，讓圖與全站同調。
  function readColors() {
    const c = getComputedStyle(document.documentElement);
    const v = (n: string) => c.getPropertyValue(n).trim();
    return {
      bg: v('--bg'), surface: v('--surface'), fg: v('--fg'), muted: v('--muted'),
      faint: v('--faint'), line: v('--line-strong'), accent: v('--accent'),
      serif: v('--serif'), sans: v('--sans'),
    };
  }

  function buildStyle(c: ReturnType<typeof readColors>) {
    return [
      { selector: 'node', style: {
        shape: 'ellipse',
        width: 'data(size)', height: 'data(size)',
        'background-color': c.surface,
        'background-image': 'data(avatar)',
        'background-fit': 'cover',
        'background-clip': 'node',
        'border-width': 1.5, 'border-color': c.line,
        label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '110',
        'text-valign': 'bottom', 'text-margin-y': 7,
        'font-family': c.serif, 'font-size': 13, 'font-weight': 700,
        'line-height': 1.35, color: c.fg,
      } },
      // 外部公眾人物：虛框、灰字，視覺次於本站收錄的公職（沿用文字清單的 .rel-name.plain 語彙）
      { selector: 'node[kind = "entity"]', style: {
        'border-style': 'dashed', color: c.muted, 'font-weight': 500,
      } },
      // 第二層＝關係人的關係人，與本人無直接關係，故縮小並淡化以免誤讀
      { selector: 'node[depth = 2]', style: { opacity: 0.6, 'border-width': 1 } },
      // 中心人物：姓名加淡紅底色塊。Cytoscape 忽略色彩的 rgba alpha，
      // 故用實色 --accent 搭配獨立的 text-background-opacity 做出 --accent-wash 效果。
      { selector: 'node[center = 1]', style: {
        'border-width': 2.5, 'border-color': c.line,
        'text-background-color': c.accent, 'text-background-opacity': 0.1,
        'text-background-padding': '5px', 'text-background-shape': 'roundrectangle',
      } },
      { selector: 'edge', style: {
        label: 'data(label)', 'font-family': c.sans, 'font-size': 11, color: c.muted,
        'curve-style': 'bezier', width: 1.2,
        'line-color': c.faint, 'target-arrow-color': c.faint,
        'text-background-color': c.bg, 'text-background-opacity': 1, 'text-background-padding': '3px',
      } },
      // 家族實線、政治虛線（沿用 FAMILY_RELATIONS 分類）
      { selector: 'edge[fam = 0]', style: { 'line-style': 'dashed' } },
      { selector: 'edge[dir = 1]', style: { 'target-arrow-shape': 'triangle', 'arrow-scale': 0.85 } },
      { selector: 'edge.hl', style: {
        'line-color': c.accent, 'target-arrow-color': c.accent, color: c.accent, width: 2,
      } },
    ];
  }

  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

  onMount(() => {
    let cy: { destroy: () => void; style: (s: unknown) => { update: () => void };
             layout: (o: unknown) => { run: () => void }; on: (...a: unknown[]) => void } | null = null;
    let mo: MutationObserver | null = null;
    let tip: HTMLDivElement | null = null;
    let hideTimer: ReturnType<typeof setTimeout>;
    let disposed = false;

    // Cytoscape 走動態 import（避免 SSR），因此設定過程是非同步的；
    // 但 Svelte 5 只認同步回傳的 cleanup，故把非同步設定包進 IIFE，
    // cleanup 先同步回傳，之後再由 IIFE 補上 cy / mo / tip。
    void (async () => {
      try {
        const cytoscape = (await import('cytoscape')).default;
        // 元件在動態 import 完成前就卸載了 → 不要再建立任何資源，
        // 否則 cleanup 已經跑過，掛在 document 上的 MutationObserver 會永遠留著。
        if (disposed) return;
        const elements = toCytoscapeElements(data, centerKey);

        cy = cytoscape({
          container,
          elements: [...elements.nodes, ...elements.edges],
          style: buildStyle(readColors()),
          layout: { name: 'preset' },
          userZoomingEnabled: mode === 'global',
          autoungrabify: false,
        }) as unknown as typeof cy;

        // ego：本人置中的同心圓（越靠中心 depth 越小）。global：力導向。
        const layout = mode === 'ego'
          ? { name: 'concentric', concentric: (n: { data: (k: string) => number }) => 10 - n.data('depth'),
              levelWidth: () => 1, minNodeSpacing: 44, padding: 28, animate: false }
          : { name: 'cose', padding: 30, animate: false, nodeRepulsion: 9000, idealEdgeLength: 110 };
        cy!.layout(layout).run();

        // 點本站收錄的節點 → 進其檔案頁（entity 的 slug 為空字串，不觸發）
        cy!.on('tap', 'node', (evt: { target: { data: (k: string) => string } }) => {
          const slug = evt.target.data('slug');
          if (slug) window.location.href = `/officials/${slug}`;
        });

        // hover 連線 → tooltip（關係＋說明＋出處）。tooltip 自身可 hover，方便點出處連結。
        tip = document.createElement('div');
        tip.className = 'rg-tip';
        container.appendChild(tip);
        const hideSoon = () => {
          hideTimer = setTimeout(() => { tip!.style.opacity = '0'; tip!.style.pointerEvents = 'none'; }, 250);
        };
        tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
        tip.addEventListener('mouseleave', hideSoon);

        cy!.on('mouseover', 'edge', (evt: any) => {
          clearTimeout(hideTimer);
          evt.target.addClass('hl');
          const d = evt.target.data();
          const note = d.note ? `<div class="rg-note">${esc(d.note)}</div>` : '';
          const src = d.sourceUrl
            ? `<a class="rg-src" href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">查看出處 ↗</a>` : '';
          const m = evt.target.renderedMidpoint();
          tip!.innerHTML = `<div class="rg-rel">${esc(d.label)}</div>${note}${src}`;
          tip!.style.left = `${m.x}px`;
          tip!.style.top = `${m.y}px`;
          tip!.style.opacity = '1';
          tip!.style.pointerEvents = 'auto';
        });
        cy!.on('mouseout', 'edge', (evt: any) => { evt.target.removeClass('hl'); hideSoon(); });

        // 跟著亮/暗模式切換重新上色
        mo = new MutationObserver(() => cy!.style(buildStyle(readColors())).update());
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      } catch {
        // Cytoscape 載入或初始化失敗 → 整區隱藏。下方的文字關係清單為 SSG 靜態 HTML，
        // 不依賴本元件，仍可正常閱讀。
        container.style.display = 'none';
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(hideTimer);
      mo?.disconnect();
      cy?.destroy();
      tip?.remove();
    };
  });
</script>

<div bind:this={container} class="graph" class:global={mode === 'global'} role="img" aria-label="人物關係圖"></div>

<style>
  .graph {
    position: relative;
    width: 100%; height: 420px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  .graph.global { height: 78vh; min-height: 520px; }
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
