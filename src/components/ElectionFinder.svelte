<script lang="ts">
  import { COUNTY_KEYS } from '../lib/countyKeys';
  import { filterElectionCandidates, type ElectionCandidate } from '../lib/electionFinder';
  import { partyEmblem } from '../lib/partyEmblems';
  let { candidates }: { candidates: ElectionCandidate[] } = $props();
  let county = $state('');
  let office = $state('');
  let query = $state('');
  let limit = $state(24);
  const active = $derived(!!county || !!office || !!query.trim());
  const results = $derived(filterElectionCandidates(candidates, { county, office, query }));
  const selectedCounty = $derived(COUNTY_KEYS.find(c => c.code === county));
  $effect(() => { county; office; query; limit = 24; });
  function reset() { county = ''; office = ''; query = ''; }
</script>

<section class="finder" aria-labelledby="finder-title">
  <div class="finder-head"><h2 id="finder-title">找候選人</h2><p>選擇縣市，或直接輸入姓名</p></div>
  <div class="controls">
    <label>縣市<select bind:value={county}><option value="">全部縣市</option>{#each COUNTY_KEYS as c}<option value={c.code}>{c.name}</option>{/each}</select></label>
    <label>選舉類別<select bind:value={office}><option value="">縣市長與議員</option><option value="chief">縣市長</option><option value="council">縣市議員</option></select></label>
    <label class="search">候選人姓名<input type="search" bind:value={query} placeholder="輸入姓名查詢" /></label>
    <button class="reset" type="button" onclick={reset} disabled={!active}>重設</button>
  </div>
  {#if !active}
    <nav class="counties" aria-label="選擇縣市查看候選人">
      {#each COUNTY_KEYS as c}
        {@const rows = candidates.filter(row => row.countyCode === c.code)}
        <button type="button" onclick={() => { county = c.code; }}><strong>{c.name}</strong><span>首長 {rows.filter(r => r.office === 'chief').length}・議員 {rows.filter(r => r.office === 'council').length}</span><span class="arrow" aria-hidden="true">↗</span></button>
      {/each}
    </nav>
  {:else}
    <div class="result-head"><p role="status">{selectedCounty?.name ?? '全國'}・符合 <strong>{results.length}</strong> 人</p>{#if selectedCounty}<a href={`/elections/2026/${selectedCounty.key}/`}>縣市完整名單 →</a>{/if}</div>
    {#if results.length}
      <ul class="results">
        {#each results.slice(0, limit) as c}
          {@const emblem = partyEmblem(c.party)}
          <li>
            <p class="district">{c.county}・{c.office === 'chief' ? '縣市長' : c.district}</p>
            <h3>{#if c.number !== null}<small>{c.number} 號</small>{/if}{#if c.slug}<a href={`/officials/${c.slug}/`}>{c.name}<span aria-hidden="true"> →</span></a>{:else}{c.name}{/if}</h3>
            <p class="party">{#if emblem}<img src={emblem} alt="" width="18" height="18" loading="lazy" />{/if}{c.party}</p>
            {#if !c.slug}<p class="no-profile">尚未收錄個人檔案・<a href={c.countyHref}>查看選區名單</a></p>{/if}
          </li>
        {/each}
      </ul>
      {#if results.length > limit}<button class="more" type="button" onclick={() => { limit += 24; }}>再顯示 {Math.min(24, results.length - limit)} 人（尚有 {results.length - limit} 人）</button>{/if}
    {:else}
      <div class="empty"><p>沒有符合條件的候選人，試試其他姓名或放寬縣市、選舉類別。</p><button type="button" onclick={reset}>清除查詢條件</button></div>
    {/if}
  {/if}
  <p class="scope">依本站收錄名冊順序呈現；名單階段與製表日期見頁首，有個人檔案者可點姓名查看背景。</p>
  <noscript>姓名搜尋需啟用 JavaScript，亦可使用下方完整名冊與縣市頁連結。</noscript>
</section>

<style>
  .finder { margin: 26px 0; border-top: 4px solid var(--fg); }
  .finder-head { display:flex;align-items:baseline;gap:16px;margin:16px 0; }
  h2 { font:900 28px var(--serif);margin:0; }
  .finder-head p,.scope { color:var(--muted);font-size:13px; }
  .finder-head p { margin:0; }
  .controls { display:grid;grid-template-columns:1fr 1fr 2fr auto;gap:12px;align-items:end;margin-bottom:20px; }
  label { display:grid;gap:6px;font-size:13px;font-weight:600;min-width:0; }
  input,select { width:100%;min-width:0;height:44px;border:1px solid var(--line-strong);border-radius:0;padding:8px 10px;background:var(--surface);color:var(--fg);font:inherit; }
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
  .results { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));list-style:none;padding:0;margin:0;border-top:1px solid var(--line-strong); }
  .results li { padding:16px 14px 16px 0;min-width:0;border-bottom:1px solid var(--line); }
  .district { color:var(--muted);font-size:12px;margin:0 0 8px; }
  h3 { font:900 23px/1.5 var(--serif);margin:0;overflow-wrap:anywhere; }
  h3 a { text-decoration:none; }
  h3 small { font:500 12px var(--sans);margin-right:6px; }
  .party { display:flex;align-items:center;gap:6px;font-size:13px;margin:8px 0 0; }
  .party img { object-fit:contain; }
  .no-profile { font-size:11px;color:var(--muted);margin:8px 0 0; }
  .more { display:block;margin:20px auto;padding:12px 24px; }
  .empty { padding:24px;background:var(--surface); }
  .empty button { padding:10px 16px; }
  .scope { margin:14px 0 0;line-height:1.7; }
  @media(max-width:900px) { .counties { grid-template-columns:repeat(4,minmax(0,1fr)); }.results { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @media(max-width:600px) {
    .finder-head { display:block; }.finder-head p { margin-top:6px; }
    .controls { grid-template-columns:1fr 1fr;gap:10px; }.search { grid-column:1/-1; }.reset { grid-column:1/-1;height:36px; }
    .counties { grid-template-columns:repeat(3,minmax(0,1fr)); }.counties button { padding:12px 8px; }.counties strong { font-size:18px; }.counties .arrow { display:none; }
    .results { grid-template-columns:repeat(2,minmax(0,1fr)); }h3 { font-size:21px; }
  }
</style>
