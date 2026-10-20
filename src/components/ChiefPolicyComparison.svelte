<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ShareActions from './ShareActions.svelte';
  import { chiefPolicyUrl, filterChiefPolicies, readChiefPolicyState, type ChiefPolicyCounty, type ChiefPolicyState } from '../lib/chiefPolicyComparison';
  let { county, canonical }: { county: ChiefPolicyCounty; canonical: string } = $props();
  let state = $state<ChiefPolicyState>({ county: '', left: '', right: '', q: '' });
  let draft = $state('');
  const people = $derived([state.left, state.right].map(id => county?.people.find(p => p.id === id)));
  const shareUrl = $derived(chiefPolicyUrl(canonical, state) + '#policy-comparison');
  const complete = $derived(!!people[0] && !!people[1]);
  let panel: HTMLElement;
  let cardChoices: HTMLInputElement[] = [];
  let cardStatus: HTMLElement | null = null;
  function syncCards() {
    const selected = [state.left, state.right].filter(Boolean);
    for (const input of cardChoices) {
      input.checked = selected.includes(input.value);
      input.disabled = selected.length === 2 && !input.checked;
      const label = input.parentElement?.querySelector('[data-policy-choice-label]');
      if (label) label.textContent = input.checked ? '已加入比較' : '加入比較';
    }
    if (cardStatus) cardStatus.textContent = selected.length === 2
      ? '已選 2 位，政見比較已顯示於下方。取消勾選即可更換人選。'
      : selected.length === 1 ? '已選 1 位，請再勾選 1 位候選人。' : '勾選兩位候選人，即可比較政見。';
  }
  async function toggleCard(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (!county?.people.some(p => p.id === input.value)) return;
    const selected = [state.left, state.right].filter(Boolean);
    const next = input.checked ? [...new Set([...selected, input.value])].slice(0, 2) : selected.filter(id => id !== input.value);
    update({ ...state, left: next[0] ?? '', right: next[1] ?? '' });
    if (input.checked && next.length === 2) {
      await tick();
      panel.focus({ preventScroll: true });
      panel.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
  function returnToCards() {
    const input = cardChoices.find(input => input.checked) ?? cardChoices[0];
    input?.focus({ preventScroll: true });
    input?.closest('.chief-card')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  const sourceTypes = { news: '新聞報導', campaign: '競選資訊', gazette: '選舉公報', civic: '公民團體紀錄' };
  onMount(() => {
    const card = [...document.querySelectorAll<HTMLElement>('[data-policy-county]')].find(el => el.dataset.policyCounty === county.key);
    cardChoices = card ? [...card.querySelectorAll<HTMLInputElement>('[data-chief-policy-choice]')] : [];
    cardStatus = card?.querySelector<HTMLElement>('[data-policy-choice-status]') ?? null;
    cardChoices.forEach(input => input.addEventListener('change', toggleCard));
    const restore = () => {
      state = readChiefPolicyState(location.search, [county], county.key);
      draft = state.q;
      syncCards();
    };
    restore();
    if (state.left && state.right) {
      void tick().then(() => panel.scrollIntoView({ block: 'start', behavior: 'instant' }));
    }
    window.addEventListener('popstate', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      cardChoices.forEach(input => input.removeEventListener('change', toggleCard));
    };
  });
  function update(next: ChiefPolicyState) {
    state = readChiefPolicyState(new URL(chiefPolicyUrl(canonical, next)).search, [county], county.key);
    draft = state.q;
    window.history.pushState(window.history.state, '', chiefPolicyUrl(location.href, state));
    syncCards();
  }
</script>

<section id="policy-comparison" bind:this={panel} tabindex="-1" hidden={!complete} class="policy-comparison" aria-label="同縣市縣市長政見比較">
  <header class="inline-heading"><h3>政見比較</h3><button class="plain" type="button" onclick={returnToCards}>更換人選 ↑</button></header>
    <form class="search" onsubmit={event => { event.preventDefault(); update({ ...state, q: draft }); }}>
      <label for="policy-query">查找政見</label>
      <div class="search-row"><input id="policy-query" class="form-control" type="search" maxlength="80" bind:value={draft} placeholder="輸入關鍵字，留白顯示完整政見" /><button type="submit">查找</button>{#if state.q}<button class="plain" type="button" onclick={() => update({ ...state, q: '' })}>全部政見</button>{/if}</div>
    </form>
    <div class="result-bar">
      <p role="status">{county.name}・{state.q ? `關鍵字「${state.q}」` : '完整政見'}</p>
      <div class="result-actions">{#if state.left || state.right}<button class="plain" type="button" onclick={() => { update({ ...state, left: '', right: '', q: '' }); returnToCards(); }}>清除選擇</button>{/if}
        {#if people[0] && people[1]}<ShareActions title={`${county.name}縣市長政見比較｜${people[0].name}、${people[1].name}`} url={shareUrl} />{/if}
      </div>
    </div>
    <table class="comparison">
      <caption class="sr-only">{county.name}縣市長候選人政見比較</caption>
      <thead><tr>
        {#each people as person, column}
          <th scope="col">
            {#if person}
              <h2>{#if person.slug}<a href={`/officials/${person.slug}/#policies`} aria-label={`${person.name}完整政見與人物資料`}>{person.name}</a>{:else}{person.name}{/if}</h2>
              <p class="party">{person.party}</p>
            {/if}
          </th>
        {/each}
      </tr></thead>
      <tbody><tr>
        {#each people as person}
          <td>
            {#if person}
              {#if person.records.length}
                {#each filterChiefPolicies(person.records, state.q) as record (record.id)}
                  <article class="record">
                    <h3>{record.title}</h3>
                    <ul>{#each record.proposals as proposal}<li><h4>{proposal.topic}</h4><p>{proposal.summary}</p></li>{/each}</ul>
                    <details class="source">
                      <summary>來源與日期</summary>
                      <a href={record.source.url} target="_blank" rel="noopener noreferrer">{record.source.title} ↗</a>
                      <p>{sourceTypes[record.source.type]}</p>
                      <p>發表：{record.announcedOn ?? '來源未載明'}<br />來源刊登：{record.source.publishedOn ?? '未載明'}<br />本站核對：{record.reviewedOn}</p>
                    </details>
                  </article>
                {:else}<p class="empty">已收錄政見中，未找到符合「{state.q}」的內容。</p>{/each}
              {:else}<p class="empty">本站尚未收錄這位候選人的 2026 政見，不代表尚未發表。</p>{/if}
            {:else}<p class="empty">請從上方選擇候選人。</p>{/if}
          </td>
        {/each}
      </tr></tbody>
    </table>
</section>

<style>
  .policy-comparison { margin-top:24px; }
  .inline-heading { display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:14px; }
  .inline-heading h3 { font:700 18px/1.5 var(--serif);margin:0; }
  .inline-heading { justify-content:space-between; }
  h2 { margin-top:0; }
  label { display:block;font-size:13px;font-weight:700;margin-bottom:8px; }
  .search { padding:16px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line); }
  .search-row { display:flex;gap:8px; }.search-row input { flex:1;min-width:0; }
  button { flex:none;min-height:44px;padding:0 16px;border:1px solid var(--control-border);background:var(--block-bg);color:var(--block-fg);font-size:13px;cursor:pointer;border-radius:0; }
  button:disabled { opacity:.5;cursor:default; }
  .plain { background:transparent;color:var(--muted);border-color:transparent;padding:0 8px; }
  .result-bar { display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0;flex-wrap:wrap; }
  .result-bar > p { font-size:13px;color:var(--muted);margin:0;min-width:0;max-width:100%;overflow-wrap:anywhere; }
  .result-actions { display:flex;align-items:flex-start;gap:12px;min-width:0;max-width:100%; }
  .result-actions :global(.share-actions) { margin:0;min-width:0; }
  table { width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0; }
  th,td { width:50%;vertical-align:top;text-align:left;overflow-wrap:anywhere;padding:24px;border-right:1px solid var(--line);border-bottom:1px solid var(--line); }
  th:last-child,td:last-child { border-right:0; }
  th { position:sticky;top:0;z-index:1;background:var(--surface);border-top:2px solid var(--fg);font-weight:400; }
  h2 { font:900 30px/1.5 var(--serif);margin:0 0 4px; }h2 a { text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:5px; }
  .party { font-size:12px;color:var(--muted);margin:0; }
  .record + .record { border-top:1px solid var(--line);padding-top:24px;margin-top:24px; }
  h3 { font:700 21px/1.6 var(--serif);margin:0 0 18px; }
  ul { list-style:none;padding:0;margin:0; }
  li + li { margin-top:20px; }
  h4 { font:700 15px/1.6 var(--sans);margin:0 0 7px;border-left:3px solid var(--accent);padding-left:10px; }
  li p { font-size:15px;line-height:1.9;margin:0; }
  .source { font-size:12px;line-height:1.8;color:var(--muted);margin-top:12px; }
  .source summary { min-height:44px;align-content:center;cursor:pointer;text-decoration:underline;text-underline-offset:3px; }
  .source a { text-decoration:underline;text-underline-offset:3px; }.source p { margin:6px 0; }
  .empty { font-size:14px;line-height:1.8;color:var(--muted);margin:0; }
  @media(max-width:760px) {
    .search-row { flex-wrap:wrap; }.search-row input { flex-basis:calc(100% - 80px); }
    .result-actions { justify-content:space-between;width:100%; }
    th,td { padding:14px 10px; }th:first-child,td:first-child { padding-left:0; }th:last-child,td:last-child { padding-right:0; }
    h2 { font-size:22px; }h3 { font-size:17px; }h4 { font-size:14px;padding-left:7px; }li p { font-size:14px;line-height:1.85; }
    .source { font-size:11px; }.empty { font-size:13px; }
  }
</style>
