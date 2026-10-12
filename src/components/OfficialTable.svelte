<script lang="ts">
  import type { OfficialListRow } from '../lib/types';
  import { queryList, type ListQuery, type SortKey } from '../lib/filterSort';
  import { partyEmblem } from '../lib/partyEmblems';
  import { onMount, tick } from 'svelte';

  export let rows: OfficialListRow[] = [];

  let search = '';
  let region = '';
  let party = '';
  let officeType = '';
  let sort: SortKey = 'judgments';

  // North-to-south + outlying islands, so the 縣市 dropdown reads geographically.
  const REGION_ORDER = [
    '基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣',
    '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣',
    '臺東縣', '澎湖縣', '金門縣', '連江縣', '其他',
  ];
  $: regions = Array.from(new Set(rows.map((r) => r.region)))
    .sort((a, b) => (REGION_ORDER.indexOf(a) + 1 || 99) - (REGION_ORDER.indexOf(b) + 1 || 99));
  $: parties = Array.from(new Set(rows.map((r) => r.party)));
  $: q = { search, region: region || undefined, party: party || undefined, officeType: (officeType || undefined) as ListQuery['officeType'], sort } as ListQuery;
  $: view = queryList(rows, q);

  // 照片卡片分批顯示；篩選或排序改變時，回到第一批。
  const PAGE = 24;
  let limit = PAGE;
  $: q, (limit = PAGE);
  $: shown = view.slice(0, limit);
  let sentinel: HTMLElement;

  async function more() {
    limit += PAGE;
    // 載入後若哨兵仍在可視範圍附近（列表太短或螢幕很高），IntersectionObserver 不會
    // 再觸發——重新觀察一次，讓它重新判斷。
    await tick();
    if (io && sentinel) { io.unobserve(sentinel); io.observe(sentinel); }
  }

  let io: IntersectionObserver | null = null;
  onMount(() => {
    io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && limit < view.length) more();
    }, { rootMargin: '800px 0px' });
    if (sentinel) io.observe(sentinel);
    return () => io?.disconnect();
  });

  const fmt = (n: number | null) => (n === null ? '—' : new Intl.NumberFormat('zh-Hant').format(n));
  const officeName: Record<string, string> = { legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員', candidate: '參選人' };
</script>

<div class="controls">
  <label class="search-field">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
    <input type="search" placeholder="搜尋姓名" aria-label="搜尋姓名" bind:value={search} />
  </label>
  <select class="ctrl" aria-label="篩選縣市" bind:value={region}>
    <option value="">全部縣市</option>
    {#each regions as r}<option value={r}>{r}</option>{/each}
  </select>
  <select class="ctrl" aria-label="篩選政黨" bind:value={party}>
    <option value="">全部政黨</option>
    {#each parties as p}<option value={p}>{p}</option>{/each}
  </select>
  <select class="ctrl" aria-label="篩選職位" bind:value={officeType}>
    <option value="">全部職位</option>
    <option value="legislator">立委</option>
    <option value="mayor_magistrate">縣市首長</option>
    <option value="councilor">議員</option>
  </select>
  <select class="ctrl" aria-label="排序方式" bind:value={sort}>
    <option value="judgments">判決最多</option>
    <option value="controversies">爭議最多</option>
    <option value="assets">財產最高</option>
  </select>
</div>

<div class="result-bar">
  <p class="count" role="status">共 <strong>{view.length.toLocaleString('zh-Hant')}</strong> 位人物</p>
  {#if search || region || party || officeType}
    <button class="reset" type="button" on:click={() => { search = ''; region = ''; party = ''; officeType = ''; }}>清除篩選 ×</button>
  {:else}
    <span class="result-note">點選卡片，查看完整背景與資料出處 ↗</span>
  {/if}
</div>

{#if view.length === 0}
  <div class="empty"><p>查無符合條件的對象。</p><span>試試其他姓名，或清除篩選條件。</span></div>
{/if}

<div class="roster-grid">
  {#each shown as r (r.slug)}
    {@const emblem = partyEmblem(r.party)}
    <a class="person-card" href={`/officials/${r.slug}/`}>
      <div class="card-head">
        <span class="office">{officeName[r.officeType]}</span>
        <span class="region">{r.region}</span>
      </div>
      <div class="portrait">
        {#if r.photoUrl}
          <img src={r.photoUrl} alt="" loading="lazy" width="240" height="258" />
        {:else}
          <div class="no-photo"><span aria-hidden="true">{r.name[0]}</span><small>暫無照片</small></div>
        {/if}
        {#if r.departed}<span class="departed">已解職</span>{/if}
      </div>
      <div class="identity">
        <h3 class="name">{r.name}</h3>
        <p class="party">
          {#if emblem}
            <img class="party-emblem" src={emblem} alt="" width="22" height="22" loading="lazy" />
          {/if}
          <span>{r.party}</span>
        </p>
        <p class="district">{r.district}</p>
      </div>
      <dl class="card-stats">
        <div><dt>判決</dt><dd class:dim={r.judgmentCount === 0}>{r.judgmentCount}<span> 筆</span></dd></div>
        <div><dt>爭議</dt><dd class:dim={r.controversyCount === 0}>{r.controversyCount}<span> 筆</span></dd></div>
        <div class="asset"><dt>申報財產</dt><dd>{fmt(r.latestAssetTotal)}{#if r.latestAssetTotal !== null}<span> 元</span>{/if}</dd></div>
      </dl>
    </a>
  {/each}
</div>

<div class="more" bind:this={sentinel} hidden={shown.length >= view.length}>
  <button type="button" class="more-btn" on:click={more}>載入更多</button>
  <span class="more-count">已顯示 {shown.length}／{view.length} 筆</span>
</div>

<style>
  .controls { display: flex; align-items: stretch; min-height: 62px; border: 1px solid var(--fg); background: var(--surface); }
  .search-field { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 160px; padding: 0 18px; }
  .search-field svg { flex: none; color: var(--muted); }
  .search-field input { width: 100%; min-width: 0; padding: 18px 0; border: 0; border-radius: 0; background: transparent; color: var(--fg); font-size: 13px; }
  .search-field input::placeholder { color: var(--muted); }
  .search-field:focus-within { box-shadow: inset 0 0 0 2px var(--accent); }
  .search-field input:focus-visible { outline: none; }
  .ctrl { min-width: 0; max-width: 180px; padding: 12px 16px; border: 0; border-left: 1px solid var(--line); border-radius: 0; background: var(--surface); color: var(--fg); font-size: 13px; cursor: pointer; }
  .ctrl:hover { background: var(--row-hover); }
  .ctrl:focus-visible { outline-offset: -2px; }
  .result-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; }
  .count { margin: 0; font-size: 12px; color: var(--muted); }
  .count strong { margin: 0 4px; color: var(--fg); font-variant-numeric: tabular-nums; }
  .result-note { font-size: 11px; color: var(--faint); letter-spacing: .04em; }
  .reset { padding: 6px 0; color: var(--accent); background: transparent; border: 0; text-decoration: underline; text-underline-offset: 4px; font-size: 12px; cursor: pointer; }
  .roster-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 22px 16px; }
  .person-card { display: flex; flex-direction: column; position: relative; min-width: 0; padding: 10px 12px; border: 1px solid var(--fg); background: var(--surface); box-shadow: 3px 4px 0 var(--line); transition: transform var(--ease), box-shadow var(--ease), border-color var(--ease); }
  .person-card::before { content: ''; position: absolute; inset: 5px; border: 1px solid var(--line); pointer-events: none; }
  .person-card:hover, .person-card:focus-visible { transform: translateY(-3px); border-color: var(--accent); box-shadow: 4px 6px 0 var(--accent-wash); }
  .person-card:hover::before { border-color: var(--accent); }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 6px; margin-bottom: 8px; border-bottom: 1px solid var(--fg); }
  .office { font: 900 15px/1.4 var(--serif); letter-spacing: .04em; }
  .region { color: var(--muted); font-size: 11px; }
  .portrait { position: relative; aspect-ratio: 5 / 4; max-height: 160px; flex: none; border: 1px solid var(--line); background: var(--row-hover); overflow: hidden; }
  .portrait img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center top; }
  .no-photo { height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; color: var(--faint); }
  .no-photo > span { font: 700 64px/1 var(--serif); }
  .no-photo small { font-size: 11px; letter-spacing: .12em; }
  .departed { position: absolute; right: 0; top: 0; padding: 2px 5px; border: 3px double var(--accent); color: var(--accent); background: var(--surface); font: 900 11px/1.3 var(--serif); letter-spacing: .08em; white-space: nowrap; pointer-events: none; }
  .identity { padding: 8px 0; text-align: center; }
  .name { margin: 0; font: 900 24px/1.4 var(--serif); letter-spacing: .06em; overflow-wrap: anywhere; }
  .party { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 22px; margin: 3px 0 0; color: var(--muted); font-size: 11px; }
  .party-emblem { display: block; flex: none; width: 22px; height: 22px; object-fit: contain; background: #fff; border-radius: 2px; }
  .district { margin: 3px 0 0; color: var(--faint); font-size: 11px; overflow-wrap: anywhere; }
  .card-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: auto 0 0; border-top: 1px solid var(--line); }
  .card-stats > div { display: flex; align-items: baseline; justify-content: space-between; gap: 4px; padding: 6px 0; border-bottom: 1px solid var(--line); }
  .card-stats > div:first-child { padding-right: 8px; }
  .card-stats > div:nth-child(2) { padding-left: 8px; border-left: 1px solid var(--line); }
  .card-stats dt { font-size: 10px; color: var(--muted); letter-spacing: .08em; }
  .card-stats dd { margin: 0; font: 700 18px/1.3 Georgia, var(--serif); font-variant-numeric: tabular-nums; }
  .card-stats dd span { font: 10px var(--sans); color: var(--muted); }
  .card-stats .asset { grid-column: 1 / -1; flex-wrap: wrap; border-bottom: 0; padding-bottom: 0; }
  .asset dd { font: 12px/1.5 var(--sans); overflow-wrap: anywhere; }
  .empty { text-align: center; padding: 48px 20px; border: 1px dashed var(--line); color: var(--muted); }
  .empty p { margin: 0 0 8px; font: 700 20px var(--serif); color: var(--fg); }
  .empty > span { font-size: 13px; }
  .more { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 32px 0; }
  .more[hidden] { display: none; }
  .more-btn { font: inherit; font-size: 14px; padding: 10px 24px; border: 1px solid var(--fg); border-radius: 0; background: var(--surface); color: var(--fg); cursor: pointer; }
  .more-btn:hover { background: var(--fg); color: var(--bg); }
  .more-count { font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; }
  @media (max-width: 1180px) {
    .roster-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (max-width: 1050px) {
    .roster-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .ctrl { padding: 12px 10px; max-width: 155px; }
  }
  @media (max-width: 760px) {
    .roster-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 16px; }
    .controls { flex-wrap: wrap; }
    .search-field { flex: 1 1 100%; border-bottom: 1px solid var(--line); }
    .ctrl { width: 25%; max-width: none; }
    .ctrl:nth-child(2) { border-left: 0; }
  }
  @media (max-width: 520px) {
    .search-field { padding: 0 12px; }
    .search-field input { font-size: 16px; padding: 14px 0; }
    .ctrl { width: 50%; font-size: 16px; padding: 12px; }
    .ctrl:nth-child(n+4) { border-top: 1px solid var(--line); }
    .ctrl:nth-child(4) { border-left: 0; }
    .result-note { display: none; }
    .roster-grid { gap: 18px 12px; }
    .person-card { padding: 9px 10px; }
    .person-card::before { inset: 4px; }
    .card-head { gap: 4px; }
    .office { font-size: 14px; letter-spacing: .04em; }
    .region { font-size: 10px; }
    .name { font-size: 23px; letter-spacing: .04em; }
    .party, .district { font-size: 10px; }
  }
</style>
