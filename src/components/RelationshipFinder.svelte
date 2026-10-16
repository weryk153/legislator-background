<script lang="ts">
  import { onMount } from 'svelte';
  import type { GraphData, GraphNode } from '../lib/types';
  import { RELATION_LABEL } from '../lib/graph';
  import { relationshipIdentity } from '../lib/relationshipIdentity';
  import { connectionHref, connectionPairs, indexRelationships, pickConnectionPair, publicSourceUrl, shortestRelationshipPath, type RelationshipPath } from '../lib/relationshipPath';
  import { fetchElectionJson } from '../lib/fetchElectionJson';
  import RelationshipPersonPicker from './RelationshipPersonPicker.svelte';
  let { dataUrl }: { dataUrl: string } = $props();
  let data = $state<GraphData | null>(null);
  let loading = $state(true);
  let failed = $state(false);
  let from = $state('');
  let to = $state('');
  let result = $state<RelationshipPath | null>(null);
  let shareHref = $state('');
  let copyMessage = $state('');
  const index = $derived(data ? indexRelationships(data) : null);
  const pairs = $derived(index ? connectionPairs(index) : []);
  const canRandomize = $derived(pairs.some(p => !((p.from === from && p.to === to) || (p.from === to && p.to === from))));
  const people = $derived(data?.nodes.filter(n => n.subtype !== 'organization') ?? []);
  const personLink = (node: GraphNode) => node.slug ? `/officials/${node.slug}/` : node.wikipediaUrl && publicSourceUrl(node.wikipediaUrl) ? node.wikipediaUrl : null;
  const sourceHost = (url: string) => new URL(url).hostname.replace(/^www\./, '');

  function setLocation(href: string) { window.history.replaceState(null, '', href); }
  function selectionChanged() {
    result = null; shareHref = ''; copyMessage = '';
    setLocation('/graph/connect/');
  }
  function search(event?: SubmitEvent) {
    event?.preventDefault();
    if (!index) return;
    // Endpoint choices are people; organizations remain available as intermediates.
    result = index.nodes.get(from)?.subtype === 'organization' || index.nodes.get(to)?.subtype === 'organization'
      ? { kind: 'invalid' } : shortestRelationshipPath(index, from, to);
    shareHref = result.kind === 'invalid' ? '' : connectionHref(from, to);
    copyMessage = '';
    if (shareHref) setLocation(shareHref);
  }
  function randomize() {
    const pair = pickConnectionPair(pairs, from, to);
    if (!pair) return;
    from = pair.from; to = pair.to; search();
  }
  function swap() {
    const previous = from; from = to; to = previous;
    if (from && to) search(); else selectionChanged();
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(new URL(shareHref, window.location.origin).href); copyMessage = '已複製這組查詢連結'; }
    catch { copyMessage = '無法自動複製，可使用旁邊的「這組查詢連結」。'; }
  }
  async function load() {
    loading = true; failed = false;
    try {
      data = await fetchElectionJson<GraphData>(import.meta.env.DEV ? `${dataUrl}/` : dataUrl);
      const params = new URLSearchParams(window.location.search);
      if (params.has('from') || params.has('to')) { from = params.get('from') ?? ''; to = params.get('to') ?? ''; search(); }
    } catch { failed = true; }
    finally { loading = false; }
  }
  onMount(() => { void load(); });
</script>

<section class="finder" aria-label="雙人人物關係查詢" aria-busy={loading}>
  <form onsubmit={search} class="search-form">
    <div class="people-inputs">
      <RelationshipPersonPicker id="connection-from" label="第一位人物" nodes={people} bind:value={from} disabled={!data} onchange={selectionChanged} />
      <button class="swap" type="button" onclick={swap} disabled={!from && !to} aria-label="交換兩位人物">⇄</button>
      <RelationshipPersonPicker id="connection-to" label="第二位人物" nodes={people} bind:value={to} disabled={!data} onchange={selectionChanged} />
    </div>
    <div class="form-actions"><button class="primary" type="submit" disabled={!data || !from || !to}>查詢關係 <span aria-hidden="true">→</span></button><button class="random" type="button" onclick={randomize} disabled={!canRandomize}>換一組看看 <span aria-hidden="true">↗</span></button><span class="scope">只查詢本站已收錄、附來源的關係。</span></div>
  </form>
  {#if failed}<p class="load-error" role="alert">關係資料暫時無法載入。<button type="button" onclick={load}>重新載入</button></p>{/if}
  <noscript><p>此查詢需要 JavaScript。可前往<a href="/graph/#graph-people">圖中人物文字清單</a>瀏覽。</p></noscript>

  <div class="result-status" role="status" aria-atomic="true">
    {#if loading}<p>正在載入人物與關係資料…</p>
    {:else if result?.kind === 'found'}<p><strong>{result.nodes[0].name}</strong> 與 <strong>{result.nodes.at(-1)?.name}</strong>，找到一條由 <strong>{result.edges.length} 段紀錄</strong>連接的最短路徑。</p>
    {:else if result?.kind === 'disconnected'}<h2>本站尚未收錄可連接的關係</h2><p>目前資料無法連接這兩位人物，不表示兩人沒有關係。可以更換人物或試試另一組。</p>
    {:else if result?.kind === 'same'}<h2>你選到了同一位人物</h2><p>請選擇兩位不同人物，再查詢彼此的關係路徑。</p>
    {:else if result?.kind === 'invalid'}<h2>無法辨識這組人物</h2><p>連結中的人物不在目前的可選名單，請從搜尋結果重新選擇兩位人物。</p>
    {/if}
  </div>

  {#if result?.kind === 'found'}
    <section class="path-result" aria-labelledby="path-title">
      <header class="path-heading"><div><p class="eyebrow">循著公開紀錄</p><h2 id="path-title">{result.edges.length === 1 ? '一段紀錄，直接相連' : '從這個人，連到那個人'}</h2></div><p class="hop-count"><strong>{result.edges.length.toString().padStart(2, '0')}</strong><span>段關係</span></p></header>
      <p class="path-caveat">這是本站資料中的一條最短路徑；段數不代表親疏或影響力。間接相連不代表兩人有直接往來。</p>
      <ol class="path-chain" class:long={result.nodes.length > 4} aria-label="最短關係路徑">
        {#each result.nodes as node, i}
          <li>
            <div class="route-person"><span class="node-position">{i === 0 ? '起點' : i === result.nodes.length - 1 ? '終點' : node.subtype === 'organization' ? '中間組織' : '中間人物'}</span>
              <strong>{node.name}</strong><small>{relationshipIdentity(node)}</small>
              {#if personLink(node)}<a href={personLink(node)!} target={node.slug ? undefined : '_blank'} rel={node.slug ? undefined : 'noopener noreferrer'}>{node.slug ? '人物檔案' : '公開介紹'} ↗</a>{/if}
            </div>
            {#if i < result.edges.length}
              <a class="route-connection" href={`#connection-evidence-${i + 1}`} aria-label={`第 ${i + 1} 段：${RELATION_LABEL[result.edges[i].type]}，查看出處`}><span aria-hidden="true"></span><b>{RELATION_LABEL[result.edges[i].type]}</b><small>出處 {i + 1} ↓</small></a>
            {/if}
          </li>
        {/each}
      </ol>
      <div class="share-row"><button type="button" onclick={copyLink}>複製這組連結</button><a href={shareHref}>這組查詢連結 ↗</a><span role="status">{copyMessage}</span></div>
    </section>
    <section class="evidence" aria-labelledby="evidence-title">
      <header><h2 id="evidence-title">每一段，都有出處。</h2><p>逐段核對原始說明；親屬、任職與政治關係可能記錄不同時期。</p></header>
      <ol>
        {#each result.edges as edge, i}
          <li id={`connection-evidence-${i + 1}`}>
            <span class="evidence-number" aria-hidden="true">{(i + 1).toString().padStart(2, '0')}</span>
            <div><p class="relation-type">{RELATION_LABEL[edge.type]}</p><h3>{index?.nodes.get(edge.source)?.name}<span aria-hidden="true"> — </span><span class="sr-only">與</span>{index?.nodes.get(edge.target)?.name}</h3>
              <p class="original-note">{edge.note || '此筆來源未附補充說明，請直接查閱原始出處。'}</p>
              <a class="source-link" href={edge.sourceUrl} target="_blank" rel="noopener noreferrer">查閱原始出處 ↗ <span>{sourceHost(edge.sourceUrl)}</span></a>
            </div>
          </li>
        {/each}
      </ol>
    </section>
  {:else if !loading && !failed && !result}
    <div class="empty-state">
      <div class="empty-path" aria-hidden="true"><span>第一位</span><i></i><span>公開紀錄</span><i></i><span>第二位</span></div>
      <h2>兩個名字，一條查證路徑。</h2><p>輸入你想知道的兩位人物，或按「換一組看看」，<br class="desktop-break" />從已有資料的組合開始探索。</p>
    </div>
  {/if}
  <details class="how-it-works"><summary>怎麼找出這條路徑？</summary><p>以每一段已收錄的關係為一步，找出步數最少的一條路徑；相同長度可能有其他路徑。查詢可雙向沿線尋找，關係意義保留各段原始說明，不會把路徑方向解讀為支持、從屬或因果方向。</p><p>資料中的組織可作為中間連接。只使用附有公開來源連結的紀錄，不依同名、同黨或推測補上新關係。查無路徑表示本站資料尚不足，並非認定兩人沒有關係。</p></details>
</section>

<style>
  .finder { margin-top:28px; }
  .search-form { border:1px solid var(--line-strong);padding:24px; }
  .people-inputs { display:grid;grid-template-columns:minmax(0,1fr) 44px minmax(0,1fr);gap:20px;align-items:start; }
  button { min-height:44px;border:1px solid var(--line-strong);border-radius:0;background:var(--bg);color:var(--fg);font:700 13px var(--sans);cursor:pointer; }
  button:disabled { opacity:.45;cursor:not-allowed; }
  .swap { color:var(--muted);background:var(--surface); border:1px solid var(--control-border); margin-top:28px;font-size:24px; }
  .swap:not(:disabled):hover { color:var(--accent); }
  .form-actions { display:flex;align-items:center;flex-wrap:wrap;gap:12px 24px;margin-top:20px; }
  .primary { padding:0 20px;display:flex;align-items:center;gap:44px;background:var(--block-bg);color:var(--block-fg);border-color:var(--block-bg); }
  .primary span { color:var(--block-accent);font-size:20px; }
  .random { border:1px solid var(--control-border); padding:8px 12px;background:var(--surface);color:var(--muted);font-weight:400; }
  .random:hover { color:var(--fg);background:var(--row-hover); }
  .scope { font-size:11px;color:var(--muted);margin-left:auto; }
  .result-status { font-size:13px; }
  .result-status > p { margin:20px 0;color:var(--muted); }
  .result-status h2 { font-size:25px;margin:36px 0 12px; }
  .result-status h2 + p { max-width:60ch;margin-bottom:40px; }
  .path-result { padding:26px 28px;border:1px solid var(--line-strong);border-top:4px solid var(--fg); }
  .path-heading { display:flex;gap:20px;align-items:center;justify-content:space-between; }
  .eyebrow { font-size:11px;color:var(--accent);letter-spacing:.12em;font-weight:700;margin:0 0 8px; }
  h2 { font-weight:900; }
  .path-heading h2 { font-size:28px;margin:0; }
  .hop-count { display:flex;align-items:baseline;gap:8px;flex:none;margin:0; }
  .hop-count strong { color:var(--accent);font:800 54px/1 var(--sans);letter-spacing:-.055em; }
  .hop-count span { font-size:11px;color:var(--muted); }
  .path-caveat { font-size:12px;line-height:1.8;color:var(--muted);max-width:80ch;margin:12px 0 26px; }
  .path-chain { list-style:none;display:flex;flex-wrap:wrap;align-items:flex-start;row-gap:20px;margin:0;padding:0; }
  .path-chain > li { display:flex;align-items:center;min-width:0;max-width:100%;flex:1 0 230px; }
  .path-chain > li:last-child { flex:1 0 155px; }
  .route-person { flex:1;min-width:0;border:1px solid var(--line-strong);padding:18px 16px;min-height:160px;background:var(--surface); }
  .node-position { display:block;font-size:10px;letter-spacing:.12em;color:var(--muted);margin-bottom:8px; }
  .route-person strong { display:block;font:900 22px/1.4 var(--serif);overflow-wrap:anywhere; }
  .route-person small { display:block;font-size:11px;line-height:1.6;color:var(--muted);margin-top:7px;overflow-wrap:anywhere; }
  .route-person > a { display:inline-flex;align-items:center;min-height:34px;font-size:11px;text-decoration:underline;text-underline-offset:3px;margin-top:8px; }
  .route-connection { flex:0 0 86px;display:flex;flex-direction:column;align-items:center;position:relative;text-align:center;padding:24px 4px;font-size:12px; }
  .route-connection > span { position:absolute;width:100%;top:50%;left:0;height:1px;background:var(--fg); }
  .route-connection b { background:var(--bg);position:relative;padding:3px 7px;font-size:12px;font-weight:700; }
  .route-connection small { font-size:10px;color:var(--muted);position:relative;background:var(--bg);padding:2px 4px; }
  a:hover { color:var(--accent); }
  .path-chain.long { display:block;max-width:640px;margin-inline:auto; }
  .path-chain.long > li { display:block;width:100%; }
  .path-chain.long .route-person { min-height:0; }
  .path-chain.long .route-connection { min-height:72px;padding:12px 0; }
  .path-chain.long .route-connection > span { width:1px;height:100%;top:0;left:50%; }
  .path-chain.long .route-connection b { padding:2px 10px; }
  .share-row { border-top:1px solid var(--line);margin-top:24px;padding-top:14px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;font-size:12px; }
  .share-row button { border:1px solid var(--control-border); font-size:13px;font-weight:400;padding:0 12px;background:var(--surface);color:var(--muted); }
  .share-row button:hover { color:var(--fg);background:var(--row-hover); }
  .share-row > a { text-decoration:underline;text-underline-offset:3px;min-height:44px;display:flex;align-items:center; }
  .share-row > span { font-size:11px;color:var(--muted); }
  .evidence { margin-top:32px; }
  .evidence header h2 { font-size:26px;margin:0; }
  .evidence header p { font-size:12px;color:var(--muted);margin:10px 0 20px; }
  .evidence ol { list-style:none;margin:0;padding:0;border-top:1px solid var(--fg); }
  .evidence li { display:grid;grid-template-columns:56px minmax(0,1fr);gap:16px;padding:24px 0;border-bottom:1px solid var(--line);scroll-margin-top:24px; }
  .evidence-number { font:700 28px/1 var(--sans);color:var(--accent); }
  .relation-type { font-size:11px;color:var(--muted);margin:0 0 6px; }
  .evidence h3 { font-size:20px;font-weight:900;margin:0;line-height:1.6; }
  .evidence h3 > span[aria-hidden] { color:var(--faint);font-family:var(--sans); }
  .original-note { font-size:14px;line-height:1.85;max-width:80ch;margin:10px 0;overflow-wrap:anywhere; }
  .source-link { display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px 12px;min-height:44px;font-size:12px;text-decoration:underline;text-underline-offset:4px; }
  .source-link span { font-size:11px;color:var(--muted); }
  .empty-state { padding:50px 20px;text-align:center;border-bottom:1px solid var(--line); }
  .empty-path { display:flex;justify-content:center;align-items:center;margin-bottom:20px; }
  .empty-path span { font-size:11px;padding:8px 12px;border:1px solid var(--line-strong); }
  .empty-path span:nth-of-type(2) { color:var(--accent); }
  .empty-path i { width:40px;height:1px;background:var(--fg); }
  .empty-state h2 { font-size:26px;margin:0 0 12px; }
  .empty-state p { font-size:13px;color:var(--muted);line-height:1.8;margin:0; }
  .how-it-works { margin-top:26px;font-size:12px;color:var(--muted); }
  .how-it-works summary { cursor:pointer;min-height:44px;line-height:44px;font-weight:700;color:var(--fg); }
  .how-it-works p { max-width:85ch;line-height:1.85; }
  .load-error { color:var(--accent);font-size:13px; }
  .load-error button { margin-left:10px;background:none;color:inherit;border:0;text-decoration:underline; }
  @media(max-width:760px) {
    .finder { margin-top:20px; }
    .search-form { padding:20px; }
    .people-inputs { grid-template-columns:1fr 44px;gap:16px 12px; }
    .people-inputs :global(.picker) { grid-column:1; }
    .swap { grid-column:2;grid-row:1/3;align-self:center;margin:0; }
    .form-actions { gap:8px 20px;margin-top:18px; }
    .scope { width:100%;margin-left:0;margin-top:6px; }
    .path-result { padding:22px 20px; }
    .path-heading { align-items:flex-start;gap:12px; }
    .path-heading h2 { font-size:23px; }
    .hop-count { flex-direction:column;gap:4px;align-items:center; }
    .hop-count strong { font-size:42px; }
    .path-caveat { font-size:11px;margin-bottom:20px; }
    .path-chain { display:block; }
    .path-chain > li { display:block;width:100%; }
    .route-person { min-height:0;padding:14px 16px; }
    .route-person strong { font-size:21px; }
    .route-connection { min-height:72px;padding:12px 0; }
    .route-connection > span { width:1px;height:100%;top:0;left:50%; }
    .route-connection b { padding:2px 10px; }
    .evidence li { grid-template-columns:32px minmax(0,1fr);gap:12px;padding:20px 0; }
    .evidence-number { font-size:22px; }
    .evidence h3 { font-size:18px; }
    .original-note { font-size:13px; }
    .empty-state { padding:38px 0; }
    .empty-state h2 { font-size:23px; }
    .empty-path i { width:24px; }
    .desktop-break { display:none; }
  }
</style>
