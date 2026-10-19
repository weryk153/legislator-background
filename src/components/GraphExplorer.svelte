<script lang="ts">
  import type { Core } from 'cytoscape';
  import type { GraphData, GraphNode } from '../lib/types';
  import RelationshipGraph from './RelationshipGraph.svelte';
  import { filterGraph } from '../lib/graphFilter';
  import { FAMILY_RELATIONS, RELATION_LABEL, OFFICE_LABEL } from '../lib/graph';
  import { entityRole } from '../lib/graphView';
  import { normalizeNameChars } from '../lib/nameVariant';
  import { onMount } from 'svelte';
  import { packGraphComponents } from '../lib/graphPacking';

  export let data: GraphData;
  export let positions: Record<string, { x: number; y: number }>;
  let cy: Core | null = null;
  let failed = false;
  let query = '';
  let family = true;
  let political = true;
  let focusKey: string | null = null;
  let selectedKey: string | null = null;
  let selectedEdgeId: string | null = null;
  $: byKey = new Map(data.nodes.map(node => [node.key, node]));
  $: view = filterGraph(data, { query, family, political, focusKey });
  $: selectedNode = selectedKey ? byKey.get(selectedKey) : undefined;
  $: selectedEdge = data.edges.find(edge => edge.id === selectedEdgeId);
  $: relations = view.edges.filter(edge => edge.source === selectedKey || edge.target === selectedKey);
  $: suggestions = query.trim() ? data.nodes.filter(node => normalizeNameChars(node.name).includes(normalizeNameChars(query.trim()))).slice(0, 8) : [];
  $: starters = data.nodes.filter(node => node.kind === 'official').map(node => ({ node, count: data.edges.filter(edge => edge.source === node.key || edge.target === node.key).length })).sort((a, b) => b.count - a.count).slice(0, 5);
  $: if (cy) applyView(cy, view);
  $: if (cy) highlight(cy, selectedKey, selectedEdgeId);
  $: if (selectedKey && !view.nodes.some(node => node.key === selectedKey)) selectedKey = null;
  $: if (selectedEdgeId && !view.edges.some(edge => edge.id === selectedEdgeId)) selectedEdgeId = null;

  function fit(graph: Core) {
    const visible = graph.nodes().filter(node => node.style('display') !== 'none');
    if (!visible.length) return;
    graph.minZoom(.001);
    graph.fit(visible, 30);
    graph.minZoom(Math.min(graph.zoom(), 1.3));
    if (graph.zoom() > 1.3) graph.zoom({ level: 1.3, renderedPosition: { x: graph.width() / 2, y: graph.height() / 2 } });
  }
  function applyView(graph: Core, visible: GraphData) {
    const nodes = new Set(visible.nodes.map(node => node.key));
    const edges = new Set(visible.edges.map(edge => edge.id));
    const packed = packGraphComponents(visible, positions, graph.width() / graph.height());
    graph.batch(() => {
      graph.nodes().forEach(node => {
        node.style('display', nodes.has(node.id()) ? 'element' : 'none');
        if (packed[node.id()]) node.position(packed[node.id()]);
      });
      graph.edges().forEach(edge => { edge.style('display', edges.has(edge.id()) ? 'element' : 'none'); });
    });
    fit(graph);
  }
  function highlight(graph: Core, nodeKey: string | null, edgeKey: string | null) {
    graph.elements().removeClass('inspected');
    if (nodeKey) graph.getElementById(nodeKey).addClass('inspected');
    if (edgeKey) graph.getElementById(edgeKey).addClass('inspected');
  }
  function inspect(selection: { nodeKey: string } | { edgeKey: string } | null) {
    selectedKey = selection && 'nodeKey' in selection ? selection.nodeKey : null;
    selectedEdgeId = selection && 'edgeKey' in selection ? selection.edgeKey : null;
  }
  function focusPerson(key: string) { query = ''; focusKey = key; selectedKey = key; selectedEdgeId = null; }
  function searchChanged() { focusKey = null; selectedKey = null; selectedEdgeId = null; }
  function reset() { query = ''; family = true; political = true; focusKey = null; selectedKey = null; selectedEdgeId = null; if (cy) fit(cy); }
  function zoom(factor: number) { if (cy) cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }
  const role = (node: GraphNode) => node.kind === 'official' ? `${node.party ?? ''}・${OFFICE_LABEL[node.officeType!] ?? ''}` : entityRole(node.description, node.subtype);

  onMount(() => {
    let observer: ResizeObserver | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let lastWidth = 0, lastHeight = 0;
    // 容器改寬（含側欄、旋轉與手機斷點）時重排群組，不在縮放／平移時改動位置。
    const watch = () => {
      if (!cy?.container()) return;
      observer?.disconnect();
      observer = new ResizeObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!cy || cy.destroyed()) return;
          cy.resize();
          const width = cy.width(), height = cy.height();
          if (width === lastWidth && height === lastHeight) return;
          lastWidth = width; lastHeight = height;
          applyView(cy, view);
        }, 100);
      });
      observer.observe(cy.container()!);
    };
    // 父層 onMount 早於圖的非同步 import；由 ready callback 安裝 observer。
    startResizeWatch = watch;
    watch();
    return () => { clearTimeout(timer); observer?.disconnect(); startResizeWatch = () => {}; };
  });
  let startResizeWatch = () => {};
  function ready(graph: Core) { cy = graph; startResizeWatch(); }
</script>

<section class="explorer" aria-label="探索人物關係">
  <div class="toolbar">
    <div class="search"><label for="graph-search">從姓名查關係</label><input class="form-control" id="graph-search" type="search" placeholder="輸入姓名，查看直接相連的人物" bind:value={query} on:input={searchChanged} /></div>
    <fieldset><legend>顯示關係</legend><label><input type="checkbox" bind:checked={family} /><span class="line fam"></span>家族</label><label><input type="checkbox" bind:checked={political} /><span class="line pol"></span>政治</label></fieldset>
    <button class="reset" on:click={reset}>重設全部</button>
  </div>
  {#if suggestions.length}<div class="suggestions" aria-label="姓名搜尋結果">{#each suggestions as node}<button on:click={() => focusPerson(node.key)}><strong>{node.name}</strong><span>{role(node)}</span></button>{/each}</div>{/if}
  <div class="view-status"><p aria-live="polite">{#if focusKey}<strong>{byKey.get(focusKey)?.name} 的直接關係</strong><span>／</span>{/if}目前顯示 <b>{view.nodes.length}</b> 位人物・<b>{view.edges.length}</b> 條關係</p><a href="#graph-detail">查看人物與出處 ↓</a></div>
  <div class="workspace">
    <div class="canvas-area">
      <div class="canvas-tools"><span>拖曳平移・滾輪／雙指縮放</span><div role="group" aria-label="關係圖縮放"><button aria-label="放大關係圖" disabled={!cy} on:click={() => zoom(1.3)}>＋</button><button aria-label="縮小關係圖" disabled={!cy} on:click={() => zoom(1 / 1.3)}>－</button><button disabled={!cy} on:click={() => cy && fit(cy)}>符合畫面</button></div></div>
      <div class="canvas">
        <RelationshipGraph {data} {positions} mode="global" onReady={ready} onInspect={inspect} onError={() => failed = true} />
        {#if failed}<div class="canvas-message"><strong>關係圖暫時無法載入</strong><a href="#graph-people">查看下方人物文字清單 ↓</a></div>
        {:else if !cy}<div class="canvas-message"><strong>正在載入關係圖…</strong><span>下方另有完整人物文字清單</span></div>
        {:else if view.nodes.length === 0}<div class="canvas-message"><strong>{!family && !political ? '尚未選擇關係類型' : '沒有符合條件的關係'}</strong><span>請調整姓名或勾選家族、政治關係。</span><button on:click={reset}>重設全部</button></div>{/if}
      </div>
      <div class="legend"><span><i class="node-symbol"></i>本站政治人物</span><span><i class="node-symbol entity"></i>其他公眾人物</span><span><i class="line fam"></i>家族關係</span><span><i class="line pol"></i>政治關係</span></div>
    </div>
    <aside class="inspector" id="graph-detail" aria-label="人物與關係明細">
      <h2><span>人物與出處</span><small>關係明細</small></h2>
      <div class="inspector-body">
      {#if selectedNode}
        <div class="person-head">{#if selectedNode.photoUrl}<img src={selectedNode.photoUrl} alt={selectedNode.name} width="72" height="90" />{:else}<span class="no-photo" aria-hidden="true">{[...selectedNode.name][0]}</span>{/if}<div><h3>{selectedNode.name}</h3><p>{role(selectedNode)}</p></div></div>
        {#if selectedNode.photoCredit}<p class="photo-credit">照片：{#if selectedNode.photoSourceUrl}<a href={selectedNode.photoSourceUrl} target="_blank" rel="noopener">{selectedNode.photoCredit}</a>{:else}{selectedNode.photoCredit}{/if}（本站縮圖）</p>{/if}
        <div class="person-actions"><button on:click={() => focusPerson(selectedNode!.key)}>以此人為中心</button>{#if selectedNode.slug}<a href={`/officials/${selectedNode.slug}/`}>個人檔案 →</a>{:else if selectedNode.wikipediaUrl}<a href={selectedNode.wikipediaUrl} target="_blank" rel="noopener">維基百科 ↗</a>{/if}</div>
        <p class="section-label">目前圖中的直接關係 <b>{relations.length}</b></p>
        <ul class="relations">{#each relations as edge}
          {@const other = byKey.get(edge.source === selectedKey ? edge.target : edge.source)!}
          <li><span class="relation-kind">{RELATION_LABEL[edge.type]}</span><button class="person-link" on:click={() => focusPerson(other.key)}>{other.name}</button>
            {#if edge.directed}<p class="direction">{byKey.get(edge.source)?.name} → {byKey.get(edge.target)?.name}</p>{/if}
            {#if edge.note}<p>{edge.note}</p>{/if}
            {#if edge.sourceUrl}<a class="source" href={edge.sourceUrl} target="_blank" rel="noopener">查看出處 ↗</a>{/if}
          </li>
        {/each}</ul>
      {:else if selectedEdge}
        <span class="relation-kind">{FAMILY_RELATIONS.has(selectedEdge.type) ? '家族關係' : '政治關係'}</span><h3 class="edge-title">{RELATION_LABEL[selectedEdge.type]}</h3>
        <div class="edge-people"><button on:click={() => focusPerson(selectedEdge!.source)}>{byKey.get(selectedEdge.source)?.name}</button><span>{selectedEdge.directed ? '→' : '—'}</span><button on:click={() => focusPerson(selectedEdge!.target)}>{byKey.get(selectedEdge.target)?.name}</button></div>
        {#if selectedEdge.note}<p class="edge-note">{selectedEdge.note}</p>{/if}
        {#if selectedEdge.sourceUrl}<a class="source" href={selectedEdge.sourceUrl} target="_blank" rel="noopener">查看公開資料出處 ↗</a>{/if}
      {:else}
        <p class="empty-title">從一個人，開始查閱。</p><p class="hint">搜尋姓名，或點選圖中的人物與連線，這裡會顯示關係說明及公開出處。</p>
        <p class="section-label">從人物開始</p><div class="starters">{#each starters as { node, count }}<button on:click={() => focusPerson(node.key)}><span>{node.name}</span><small>{count} 條關係</small></button>{/each}</div>
        <p class="hint small">以上依收錄關係筆數排序。圖上距離與關係筆數不代表影響力或關係強弱。</p>
      {/if}
      </div>
    </aside>
  </div>
</section>

<style>
  .explorer { margin-top: 24px; }
  button { font: inherit; }
  button, a { -webkit-tap-highlight-color: transparent; }
  button { cursor: pointer; color: var(--fg); background: var(--bg); border: 1px solid var(--line-strong); border-radius: 0; }
  button:hover { border-color: var(--fg); background: var(--row-hover); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button:disabled { opacity: .4; cursor: default; }
  .toolbar { display: flex; gap: 24px; align-items: end; padding: 20px; border: 1px solid var(--line); border-top: 3px solid var(--fg); background: var(--surface); }
  .search { flex: 1; min-width: 0; }
  .search > label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 8px; }
  fieldset { display: flex; gap: 14px; border: 0; padding: 0 0 12px; margin: 0; flex: none; }
  legend { font-size: 12px; color: var(--muted); margin-bottom: 13px; padding: 0; }
  fieldset label { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
  input[type=checkbox] { accent-color: var(--fg); width: 15px; height: 15px; margin: 0; }
  .line { display: inline-block; width: 20px; border-top: 2px solid var(--fg); vertical-align: middle; }
  .line.pol { border-top-style: dashed; }
  .reset { border:1px solid var(--control-border); min-height:44px;padding:8px 12px;font-size:13px;flex:none;color:var(--muted);background:var(--surface); }
  .reset:hover { color:var(--fg);border-color:var(--control-border); }
  .suggestions { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 0 0; }
  .suggestions button { padding: 7px 10px; text-align: left; }
  .suggestions strong { font-size: 14px; }
  .suggestions span { display: block; font-size: 11px; color: var(--muted); max-width: 220px; }
  .view-status { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; padding: 14px 0; font-size: 12px; color: var(--muted); }
  .view-status p { margin: 0; }
  .view-status strong { color: var(--fg); }
  .view-status p > span { padding: 0 10px; }
  .view-status a { text-decoration: underline; text-underline-offset: 3px; }
  .workspace { display: grid; grid-template-columns: minmax(0, 1fr) 310px; align-items: start; border-top: 3px solid var(--fg); }
  .canvas-area { min-width: 0; --global-graph-height: 580px; --global-graph-min-height: 400px; }
  .canvas-tools { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 12px; border-inline: 1px solid var(--line); background: var(--surface); }
  .canvas-tools > span { font-size: 11px; color: var(--muted); }
  .canvas-tools > div { display: flex; gap: 4px; }
  .canvas-tools button { color:var(--muted);background:var(--surface); border:1px solid var(--control-border); min-width: 34px; height: 34px; padding: 0 10px; font-size: 13px; }
  .canvas { position: relative; min-height: var(--global-graph-height); }
  .canvas-message { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; background: var(--bg); padding: 20px; text-align: center; font-size: 13px; color: var(--muted); }
  .canvas-message strong { color: var(--fg); font-size: 18px; font-family: var(--serif); }
  .canvas-message button { padding: 8px 12px; }
  .canvas-message a { text-decoration: underline; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px 18px; padding: 13px 12px; border: 1px solid var(--line); border-top: 0; font-size: 11px; color: var(--muted); }
  .legend > span { display: flex; align-items: center; gap: 7px; }
  .node-symbol { width: 13px; height: 13px; border: 1px solid var(--fg); border-radius: 50%; }
  .node-symbol.entity { border-style: dashed; }
  .inspector { min-width: 0; border: 1px solid var(--line); border-top: 0; border-left: 0; scroll-margin-top: 16px; }
  .inspector h2 { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; margin: 0; background: var(--block-bg); color: var(--block-fg); font-size: 20px; line-height: 1.5; }
  .inspector h2 small { font-family: var(--sans); font-size: 10px; font-weight: 400; opacity: .65; }
  .inspector-body { padding: 20px 16px; max-height: 616px; overflow-y: auto; overflow-wrap: anywhere; }
  .empty-title { font-family: var(--serif); font-weight: 900; font-size: 21px; margin: 0 0 14px; }
  .hint { color: var(--muted); font-size: 13px; line-height: 1.8; }
  .hint.small { font-size: 11px; margin-bottom: 0; }
  .section-label { padding-top: 16px; margin: 20px 0 10px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  .section-label b { color: var(--accent); margin-left: 5px; }
  .starters { display: flex; flex-direction: column; }
  .starters button { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border: 0; border-bottom: 1px solid var(--line); text-align: left; }
  .starters span { font-family: var(--serif); font-size: 17px; font-weight: 700; }
  .starters small { font-size: 11px; color: var(--muted); }
  .person-head { display: flex; align-items: center; gap: 14px; }
  .person-head img { object-fit: contain; flex: none; background: var(--surface); border: 1px solid var(--line); }
  .person-head h3 { margin: 0; font-size: 26px; font-weight: 900; }
  .person-head p { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
  .no-photo { display: grid; place-items: center; flex: 0 0 72px; height: 90px; background: var(--surface); font: 900 40px var(--serif); color: var(--faint); }
  .photo-credit { color: var(--faint); font-size: 10px; line-height: 1.5; }
  .photo-credit a { text-decoration: underline; }
  .person-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 16px 0; font-size: 12px; }
  .person-actions button { color:var(--muted);background:var(--surface); border:1px solid var(--control-border); padding: 8px; }
  .person-actions a { text-decoration: underline; text-underline-offset: 3px; }
  .relations { list-style: none; margin: 0; padding: 0; }
  .relations li { padding: 14px 0; border-bottom: 1px solid var(--line); }
  .relation-kind { font-size: 11px; padding: 2px 5px; border: 1px solid var(--fg); display: inline-block; }
  .person-link { border: 0; padding: 0; margin-left: 8px; font-weight: 700; font-size: 14px; }
  .relations p, .edge-note { font-size: 13px; line-height: 1.75; margin: 8px 0; color: var(--muted); }
  .relations p.direction { font-size: 11px; color: var(--faint); }
  .source { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; font-size: 12px; }
  .edge-title { font-size: 30px; margin: 14px 0; }
  .edge-people { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .edge-people button { font-weight: 700; font-size: 16px; padding: 7px; }
  @media (max-width: 1000px) { .workspace { grid-template-columns: minmax(0, 1fr) 270px; } .toolbar { gap: 16px; } }
  @media (max-width: 760px) {
    .toolbar { flex-wrap: wrap; padding: 16px 12px; gap: 16px; }
    .search { flex: 1 1 100%; }
    fieldset { flex: 1; padding-bottom: 0; }
    legend { margin-bottom: 8px; }
    .workspace { grid-template-columns: minmax(0, 1fr); }
    .canvas-area { --global-graph-height: 450px; --global-graph-min-height: 380px; }
    .canvas-tools { flex-wrap: wrap; }
    .canvas-tools > span { font-size: 10px; }
    .canvas-tools button { padding: 0 8px; }
    .inspector { border-left: 1px solid var(--line); }
    .inspector-body { max-height: none; overflow: visible; padding: 18px; }
    .legend { gap: 10px 12px; }
  }
</style>
