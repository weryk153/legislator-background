<script lang="ts">
  import type { OfficialListRow } from '../lib/types';
  import { queryList, type ListQuery, type SortKey } from '../lib/filterSort';

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

  const fmt = (n: number | null) => (n === null ? '—' : new Intl.NumberFormat('zh-Hant').format(n));
  const officeName: Record<string, string> = { legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員' };
</script>

<div class="controls">
  <input class="ctrl" type="search" placeholder="搜尋姓名" aria-label="搜尋姓名" bind:value={search} />
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
    <option value="name">姓名</option>
  </select>
  <span class="count">{view.length} 筆</span>
</div>

<div class="thead" aria-hidden="true">
  <span>姓名</span>
  <span class="r">判決</span>
  <span class="r">爭議</span>
  <span class="r">申報財產</span>
</div>

{#if view.length === 0}
  <p class="empty">查無符合條件的對象。</p>
{/if}

{#each view as r}
  <a class="row" href={`/officials/${r.slug}`}>
    <div class="who">
      {#if r.photoUrl}
        <img class="avatar" src={r.photoUrl} alt="" loading="lazy" width="40" height="40" />
      {:else}
        <span class="avatar ph" aria-hidden="true">{r.name[0]}</span>
      {/if}
      <div class="who-text">
        <div class="name">{r.name}<span class="meta">{r.party}・{r.district}</span></div>
        <div class="office">{officeName[r.officeType]}{#if r.departed}<span class="departed"> · 已解職</span>{/if}</div>
      </div>
    </div>
    <div class="stat"><span class="slabel">判決</span>
      <div class="num v" class:accent={r.judgmentCount > 0} class:dim={r.judgmentCount === 0}>{r.judgmentCount}</div>
    </div>
    <div class="stat"><span class="slabel">爭議</span>
      <div class="num v" class:accent={r.controversyCount > 0} class:dim={r.controversyCount === 0}>{r.controversyCount}</div>
    </div>
    <div class="stat"><span class="slabel">申報財產</span>
      <div class="num asset">{fmt(r.latestAssetTotal)}</div>
    </div>
  </a>
{/each}

<style>
  .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 18px; }
  .ctrl {
    padding: 7px 11px; font-size: 0.8125rem;
    border: 1px solid var(--line-strong); border-radius: 7px;
    background: var(--surface); color: inherit;
    transition: border-color var(--ease);
  }
  .ctrl:hover { border-color: var(--accent); }
  input.ctrl { min-width: 140px; }
  .count { margin-left: auto; font-size: 0.8125rem; color: var(--faint); font-variant-numeric: tabular-nums; }

  .grid, .thead, .row { display: grid; grid-template-columns: 1fr 56px 56px 104px; gap: 16px; align-items: baseline; }
  .thead {
    padding: 0 6px 8px; border-bottom: 1px solid var(--line-strong);
    font-size: var(--t-xs); letter-spacing: 0.08em; color: var(--faint);
  }
  .thead .r { text-align: right; }

  .row {
    padding: 15px 6px; border-bottom: 1px solid var(--line);
    transition: background-color var(--ease);
  }
  .row:hover { background: var(--row-hover); }
  .who { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .who-text { min-width: 0; }
  .avatar {
    width: 40px; height: 40px; flex: none; border-radius: 50%;
    object-fit: cover; object-position: center top;
    border: 1px solid var(--line); background: var(--bg);
    transition: border-color var(--ease);
  }
  /* 無照片（議員/首長尚未補）→ 以姓氏首字佔位，維持對齊 */
  .avatar.ph { display: grid; place-items: center; color: var(--faint); font-family: var(--serif); font-size: 1.0625rem; }
  .row:hover .avatar { border-color: var(--accent); }
  .name { font-family: var(--serif); font-size: var(--t-md); font-weight: 700; }
  .name .meta { font-family: var(--sans); font-size: 0.75rem; font-weight: 400; color: var(--faint); margin-left: 9px; }
  .office { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }
  .office .departed { color: #b3261e; }
  .stat { text-align: right; }
  .v { font-size: var(--t-md); font-weight: 800; line-height: 1.1; }
  .asset { font-size: 0.9375rem; font-weight: 700; }
  .slabel { display: none; }
  .empty { color: var(--faint); padding: 28px 6px; text-align: center; }

  /* Mobile: stack each row as a card — name spans the full width, the three stats
     sit in a labelled row below, so the 政黨・選舉區 text no longer wraps awkwardly. */
  @media (max-width: 560px) {
    .thead { display: none; }
    .row {
      grid-template-columns: repeat(3, 1fr);
      gap: 10px 12px; align-items: center; padding: 14px 4px;
    }
    .who { grid-column: 1 / -1; }
    .name .meta { display: block; margin-left: 0; margin-top: 3px; }
    .stat {
      text-align: left; display: flex; flex-direction: column; gap: 1px;
      padding-top: 9px; border-top: 1px solid var(--line);
    }
    .slabel { display: block; font-size: 0.7rem; color: var(--faint); letter-spacing: 0.04em; }
    .v { font-size: 1.05rem; line-height: 1.2; }
    .asset { font-size: 0.9rem; }
  }
</style>
