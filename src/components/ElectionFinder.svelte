<script lang="ts">
  import { onMount } from 'svelte';
  import FirstRunBadge from './FirstRunBadge.svelte';
  import { fetchElectionJson } from '../lib/fetchElectionJson';
  import { COUNTY_KEYS } from '../lib/countyKeys';
  import { filterElectionCandidates, groupElectionCandidates, visibleElectionGroups, type ElectionCandidate, type ElectionFinderData } from '../lib/electionFinder';
  import { partyEmblem } from '../lib/partyEmblems';
  import { readFinderLocation, finderLocationHref } from '../lib/electionFinderLocation';
  let { countyCounts, dataUrl }: { countyCounts: Record<string, { chief: number; council: number }>; dataUrl: string } = $props();
  let candidates = $state<ElectionCandidate[]>([]);
  let areas = $state<ElectionFinderData['areas']>({});
  let loaded = $state(false);
  let loading = $state(false);
  let failed = $state(false);
  async function ensureData() {
    if (loaded || loading || failed) return;
    loading = true;
    try {
      const data = await fetchElectionJson<ElectionFinderData>(import.meta.env.DEV ? `${dataUrl}/` : dataUrl);
      candidates = data.candidates; areas = data.areas; loaded = true;
    }
    catch { failed = true; }
    finally { loading = false; }
  }
  function retry() { failed = false; void ensureData(); }
  let county = $state('');
  let office = $state('');
  let districtKey = $state('');
  let query = $state('');
  let limit = $state(24);
  let locationReady = $state(false);
  const active = $derived(!!county || !!office || !!query.trim());
  const districtOptions = $derived(county ? groupElectionCandidates(filterElectionCandidates(candidates, { county, office, query: '' })) : []);
  const results = $derived(filterElectionCandidates(candidates, { county, office, query, districtKey }));
  const groups = $derived(groupElectionCandidates(results));
  const visibleGroups = $derived(visibleElectionGroups(groups, limit));
  const shownCount = $derived(visibleGroups.reduce((count, group) => count + group.candidates.length, 0));
  const selectedCounty = $derived(COUNTY_KEYS.find(c => c.code === county));
  $effect(() => { if (active) void ensureData(); });
  onMount(() => {
    const saved = readFinderLocation(new URL(window.location.href));
    county = saved.county; office = saved.office; districtKey = saved.districtKey;
    query = saved.query; limit = saved.limit; locationReady = true;
  });
  $effect(() => {
    if (loaded && districtKey && !districtOptions.some(group => group.key === districtKey)) districtKey = '';
  });
  $effect(() => {
    if (!locationReady) return;
    const href = finderLocationHref(new URL(window.location.href), { county, office, districtKey, query, limit });
    window.history.replaceState(window.history.state, '', href);
  });
  function reset() { county = ''; office = ''; districtKey = ''; query = ''; limit = 24; }
</script>

<section class="finder" aria-labelledby="finder-title">
  <div class="finder-head"><h2 id="finder-title">找候選人</h2><p>選擇縣市，或直接輸入姓名</p></div>
  <div class="controls" onfocusin={ensureData} oninput={() => { limit = 24; }}>
    <label>縣市<select class="form-control" bind:value={county} onchange={() => { districtKey = ''; }}><option value="">全部縣市</option>{#each COUNTY_KEYS as c}<option value={c.code}>{c.name}</option>{/each}</select></label>
    <label>選舉類別<select class="form-control" bind:value={office} onchange={() => { districtKey = ''; }}><option value="">縣市長與議員</option><option value="chief">縣市長</option><option value="council">縣市議員</option></select></label>
    <label class="district-filter">選區<select class="form-control" bind:value={districtKey} disabled={!county || !loaded}>
      <option value="">{!county ? '先選擇縣市' : !loaded ? '名冊載入後可選' : '全部選區'}</option>
      {#each districtOptions as group}
        <option value={group.key}>{group.district}{areas[group.key]?.towns.length ? ` · ${areas[group.key].towns.join('、')}` : ''}（{group.candidates.length} 人）</option>
      {/each}
    </select></label>
    <label class="search">候選人姓名<input class="form-control" type="search" bind:value={query} placeholder="輸入姓名查詢" /></label>
    <button class="reset" type="button" onclick={reset} disabled={!active}>重設</button>
  </div>
  {#if active && loaded && groups.some(group => group.office === 'council')}<p class="scope area-scope">附公告來源的選區已核對 2026 正式範圍；其餘行政區參考沿用本站 2022 選區對照，2026 範圍以選委會公告為準。</p>{/if}
  {#if !active}
    <nav class="counties" aria-label="選擇縣市查看候選人">
      {#each COUNTY_KEYS as c}
        {@const counts = countyCounts[c.code]}
        <button type="button" onclick={() => { county = c.code; districtKey = ''; limit = 24; }}><strong>{c.name}</strong><span>首長 {counts?.chief ?? 0}・議員 {counts?.council ?? 0}</span><span class="arrow" aria-hidden="true">↗</span></button>
      {/each}
    </nav>
  {:else if failed}
    <div class="empty" role="status"><p>候選人名冊載入失敗，請檢查連線後重試。</p><button type="button" onclick={retry}>重新載入</button></div>
  {:else if !loaded}
    <p role="status">正在載入候選人名冊…</p>
  {:else}
    <div class="result-head"><p role="status">{selectedCounty?.name ?? '全國'}・符合 <strong>{results.length}</strong> 人</p>{#if selectedCounty}<a href={`/elections/2026/${selectedCounty.key}/`}>縣市完整名單 →</a>{/if}</div>
    {#if results.length}
      <div class="result-groups">
        {#each visibleGroups as group, i (group.key)}
          {@const area = areas[group.key]}
          <section class="result-group" aria-labelledby={`candidate-group-${i}`}>
            <header class="group-head">
              <div class="group-title">
                <span class="office-label">{group.office === 'chief' ? '縣市長' : '縣市議員'}</span>
                <div class="group-heading">
                  <h3 id={`candidate-group-${i}`}>{group.office === 'chief' ? group.district : `${group.county}・${group.district}`}</h3>
                  {#if area?.scope}
                    {#if area.scope.length > 60}<details class="group-area"><summary>公告選區範圍（展開里名）</summary><p>{area.scope}</p></details>
                    {:else}<p class="group-area">公告範圍：{area.scope}</p>{/if}
                    {#if area.source}<p class="group-area"><a href={`${area.source.pdfUrl}#page=${area.source.pages[0]}`} target="_blank" rel="noopener noreferrer">中選會 2026 正式公告</a>・{area.source.publishedOn}</p>{/if}
                  {:else if area?.towns.length}<p class="group-area">行政區參考：{area.towns.join('、')}</p>{/if}
                  {#if area?.note}<p class="group-area">{area.note}</p>{/if}
                </div>
              </div>
              <p class="group-count"><strong>{group.candidates.length}</strong> {query.trim() ? '人符合' : '人'}</p>
            </header>
            <ul class="results">
              {#each group.candidates as c}
                {@const emblem = partyEmblem(c.party)}
                <li class:has-profile={!!c.slug}>
                  <h4>{#if c.number !== null}<small>{c.number} 號</small>{/if}{#if c.slug}<a href={`/officials/${c.slug}/`}>{c.name}</a>{:else}{c.name}{/if}<FirstRunBadge evidence={c.firstRun} name={c.name} /></h4>
                  <p class="party">{#if emblem}<img src={emblem} alt="" width="18" height="18" loading="lazy" />{/if}<span>{c.party}</span></p>
                  {#if !c.slug}<p class="profile-status">尚未收錄個人檔案</p>{/if}
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
      {#if results.length > shownCount}<div class="load-more"><p>已顯示 {shownCount}／{results.length} 人，每次顯示完整分組。</p><button class="more" type="button" onclick={() => { limit = shownCount + 24; }}>載入更多分組 <span aria-hidden="true">↓</span></button></div>{/if}
    {:else}
      <div class="empty"><p>沒有符合條件的候選人，試試其他姓名或放寬縣市、選舉類別。</p><button type="button" onclick={reset}>清除查詢條件</button></div>
    {/if}
  {/if}
  <p class="scope">依縣市、選舉類別與選區分組，組內保留名冊順序。「首次參選」僅標示有公開來源確認者，可點標記查看；未標示不代表曾參選。名單階段與製表日期見頁首；有個人檔案者可點整張卡片查看背景。</p>
  <noscript>姓名搜尋需啟用 JavaScript，亦可使用下方完整名冊與縣市頁連結。</noscript>
</section>

<style>
  .finder { margin: 26px 0; border-top: 4px solid var(--fg); }
  .finder-head { display:flex;align-items:baseline;gap:16px;margin:16px 0; }
  h2 { font:900 28px var(--serif);margin:0; }
  .finder-head p,.scope { color:var(--muted);font-size:13px; }
  .finder-head p { margin:0; }
  .controls { display:grid;grid-template-columns:1fr 1fr 1.8fr 1.2fr auto;gap:12px;align-items:end;margin-bottom:20px; }
  select:disabled { color:var(--muted);background:var(--row-hover); }
  label { display:grid;gap:6px;font-size:13px;font-weight:600;min-width:0; }
  button { cursor:pointer;color:var(--fg);background:var(--surface);border:1px solid var(--line-strong);font:inherit; }
  .reset { height:44px;padding:0 16px; }
  .reset:disabled { opacity:.4;cursor:default; }
  .counties { display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border-top:1px solid var(--line);border-left:1px solid var(--line); }
  .counties button { position:relative;text-align:left;border:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:14px 12px;display:grid;gap:5px; }
  .counties strong { font:900 20px var(--serif); }
  .counties span { color:var(--muted);font-size:11px; }
  .counties .arrow { position:absolute;right:12px;top:15px;color:var(--accent);font-size:16px; }
  .counties button:hover,.counties button:focus-visible { background:var(--row-hover); }
  .result-head { display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:18px 0;font-size:14px; }
  .result-head p { margin:0; }
  .result-groups { display:grid;gap:32px; }
  .result-group { min-width:0; }
  .group-head { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-top:3px solid var(--fg);border-bottom:1px solid var(--line); }
  .group-title { display:flex;align-items:center;gap:12px;min-width:0; }
  .group-heading { min-width:0; }
  .group-area { font-size:13px;line-height:1.6;color:var(--muted);margin:4px 0 0;overflow-wrap:anywhere; }
  .office-label { flex:none;background:var(--block-bg);color:var(--block-fg);padding:4px 8px;font-size:12px;font-weight:700; }
  h3 { font:900 21px/1.5 var(--serif);margin:0;overflow-wrap:anywhere; }
  .group-count { flex:none;margin:0;font-size:13px;color:var(--muted); }
  .group-count strong { color:var(--fg);font-size:18px;font-variant-numeric:tabular-nums; }
  .results { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:24px;list-style:none;padding:0;margin:0; }
  .results li { position:relative;isolation:isolate;display:flex;flex-direction:column;align-items:flex-start;padding:18px 0;min-width:0;border-bottom:1px solid var(--line); }
  .results li.has-profile:hover { background:var(--row-hover); }
  .results :global(.first-run) { position:relative;z-index:2; }
  h4 { font:900 24px/1.5 var(--serif);margin:0;overflow-wrap:anywhere; }
  h4 a { text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px; }
  h4 a::after { content:'';position:absolute;inset:0;z-index:1; }
  h4 a:focus-visible { outline:none; }
  h4 a:focus-visible::after { outline:2px solid var(--accent);outline-offset:3px; }
  h4 a:hover { text-decoration-thickness:2px; }
  h4 small { font:500 12px var(--sans);margin-right:6px; }
  .party { display:flex;align-items:flex-start;gap:6px;font-size:13px;line-height:1.5;margin:6px 0 0;overflow-wrap:anywhere; }
  .party img { object-fit:contain;flex:none;margin-top:1px; }
  .profile-status { font-size:12px;line-height:1.5;color:var(--muted);margin:12px 0 0; }
  .load-more { display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px 20px;margin:24px 0; }
  .load-more p { margin:0;color:var(--muted);font-size:13px; }
  .more { padding:12px 20px; }
  .empty { padding:24px;background:var(--surface); }
  .empty button { padding:10px 16px; }
  .scope { margin:14px 0 0;line-height:1.7; }
  .area-scope { margin:-8px 0 16px;font-size:12px; }
  @media(max-width:900px) { .controls { grid-template-columns:1fr 1fr; }.district-filter { grid-column:1/-1; }.reset { align-self:end; }.counties { grid-template-columns:repeat(4,minmax(0,1fr)); }.results { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @media(max-width:600px) {
    .finder-head { display:block; }.finder-head p { margin-top:6px; }
    .controls { grid-template-columns:1fr 1fr;gap:10px; }.search { grid-column:1/-1; }.reset { grid-column:1/-1;height:44px; }
    .counties { grid-template-columns:repeat(3,minmax(0,1fr)); }.counties button { padding:12px 8px; }.counties strong { font-size:18px; }.counties .arrow { display:none; }
    .result-groups { gap:28px; }.group-head { align-items:flex-start; }.group-title { align-items:flex-start;flex-direction:column;gap:8px; }h3 { font-size:20px; }
    .results { grid-template-columns:repeat(2,minmax(0,1fr));column-gap:20px; }h4 { font-size:22px; }
  }
</style>
