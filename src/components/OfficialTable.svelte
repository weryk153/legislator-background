<script lang="ts">
  import type { OfficialListRow } from '../lib/types';
  import { queryList, type ListQuery, type SortKey } from '../lib/filterSort';

  export let rows: OfficialListRow[] = [];

  let search = '';
  let party = '';
  let officeType = '';
  let sort: SortKey = 'judgments';

  $: parties = Array.from(new Set(rows.map((r) => r.party)));
  $: q = { search, party: party || undefined, officeType: (officeType || undefined) as ListQuery['officeType'], sort } as ListQuery;
  $: view = queryList(rows, q);

  const fmt = (n: number | null) => (n === null ? '—' : new Intl.NumberFormat('zh-Hant').format(n));
  const officeName: Record<string, string> = { legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員' };
</script>

<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;font-size:13px">
  <input placeholder="搜尋姓名" bind:value={search}
    style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit" />
  <select bind:value={party} style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit">
    <option value="">全部政黨</option>
    {#each parties as p}<option value={p}>{p}</option>{/each}
  </select>
  <select bind:value={officeType} style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit">
    <option value="">全部職位</option>
    <option value="legislator">立委</option>
    <option value="mayor_magistrate">縣市首長</option>
  </select>
  <select bind:value={sort} style="padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit">
    <option value="judgments">判決最多</option>
    <option value="controversies">爭議最多</option>
    <option value="assets">財產最高</option>
    <option value="name">姓名</option>
  </select>
  <span style="margin-left:auto;color:var(--muted)">{view.length} 筆</span>
</div>

{#each view as r}
  <a href={`/officials/${r.id}`} style="display:grid;grid-template-columns:1fr auto auto auto;gap:14px;align-items:baseline;padding:14px 4px;border-bottom:1px solid var(--line);text-decoration:none">
    <div>
      <div style="font-family:var(--serif);font-size:18px;font-weight:700">{r.name}
        <span style="font-size:12px;color:var(--muted);font-family:var(--sans);margin-left:8px">{r.party}・{r.district}</span>
      </div>
      <div style="font-size:12px;color:var(--muted)">{officeName[r.officeType]}</div>
    </div>
    <div style="text-align:right;min-width:52px">
      <div class="num" style="font-size:19px;font-weight:800" class:accent={r.judgmentCount > 0} class:dim={r.judgmentCount === 0}>{r.judgmentCount}</div>
      <div style="font-size:10px;color:var(--muted)">判決</div>
    </div>
    <div style="text-align:right;min-width:52px">
      <div class="num" style="font-size:19px;font-weight:800" class:accent={r.controversyCount > 0} class:dim={r.controversyCount === 0}>{r.controversyCount}</div>
      <div style="font-size:10px;color:var(--muted)">爭議</div>
    </div>
    <div style="text-align:right;min-width:90px">
      <div class="num" style="font-size:15px;font-weight:700">{fmt(r.latestAssetTotal)}</div>
      <div style="font-size:10px;color:var(--muted)">申報財產</div>
    </div>
  </a>
{/each}
