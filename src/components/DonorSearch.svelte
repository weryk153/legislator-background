<script lang="ts">
  import { onMount } from 'svelte';
  import { rankDonors, filterOfficials, collectParties, collectElectionGroups, ELECTION_GROUP_LABEL, filterOfficialsByName, filterDonorsByName, type DonorSort, type Donor, type Official } from '../lib/donorFilter';

  type Data = { generatedAt: string; elections: string[]; officials: Official[]; donors: Donor[] };

  let data: Data | null = null;
  let failed = false;
  let search = '';
  let expanded: Record<string, boolean> = {};
  let sort: DonorSort = 'count';
  let party = '';
  let officeType = '';
  let election = '';

  onMount(async () => {
    try {
      const res = await fetch('/data/donors.json');
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
      // donors.astro 於建置時預先輸出同一份排行榜的純 HTML（供爬蟲索引，見該檔註解）。
      // 一旦本元件成功接手（互動版可搜尋/篩選），移除靜態版避免重複內容；載入失敗則保留靜態版作為後備內容。
      document.getElementById('static-ranking')?.remove();
    } catch { failed = true; }
  });

  const fmt = (n: number) => new Intl.NumberFormat('zh-Hant').format(n);
  const officeName: Record<string, string> = { legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員' };

  $: q = search.trim();
  $: filterQuery = { party: party || undefined, officeType: officeType || undefined, election: election || undefined, sort };
  $: parties = data ? collectParties(data.donors) : [];
  $: elections = data ? collectElectionGroups(data.donors) : [];
  $: officialHits = data && q.length >= 2 ? filterOfficials(filterOfficialsByName(data.officials, q), filterQuery) : [];
  $: donorHits = data && q.length >= 2
    ? rankDonors(filterDonorsByName(data.donors, q), filterQuery, { limit: 50 })
    : [];
  // 預設排行：捐給最多位現任者前 50（篩選啟用時以符合條件之子集合重新計算並自然剔除不足者）
  $: ranking = data && q.length < 2 ? rankDonors(data.donors, filterQuery, { minCount: 2, limit: 50 }) : [];
  $: totalAmount = data ? data.donors.reduce((s, d) => s + d.total, 0) : 0;
</script>

<input class="ctrl" type="search" placeholder="輸入政治人物姓名，或公司名稱／統一編號" aria-label="搜尋" bind:value={search} />

<div class="controls">
  <select class="ctrl" aria-label="排序方式" bind:value={sort}>
    <option value="count">現任受贈人數</option>
    <option value="total">捐贈總額</option>
  </select>
  <select class="ctrl" aria-label="篩選政黨" bind:value={party}>
    <option value="">全部政黨</option>
    {#each parties as p}<option value={p}>{p}</option>{/each}
  </select>
  <select class="ctrl" aria-label="篩選職務" bind:value={officeType}>
    <option value="">全部職務</option>
    <option value="legislator">立委</option>
    <option value="councilor">議員</option>
    <option value="mayor_magistrate">縣市長</option>
  </select>
  <select class="ctrl" aria-label="篩選選舉" bind:value={election}>
    <option value="">全部選舉</option>
    {#each elections as e}<option value={e}>{ELECTION_GROUP_LABEL[e] ?? e}</option>{/each}
  </select>
</div>

{#if failed}
  <p class="dim">資料載入失敗，請重新整理。</p>
{:else if !data}
  <p class="dim">載入中…</p>
{:else}
  {#if q.length < 2}
    <p class="stats num">收錄營利事業 {fmt(data.donors.length)} 家・捐贈總額 NT$ {fmt(totalAmount)}・{data.elections.length} 場選舉（{data.generatedAt} 匯出）</p>
    {#each ranking as { donor, view } (donor.uid)}
      <article class="card donor">
        <button class="donor-head" aria-expanded={!!expanded[donor.uid]} on:click={() => (expanded[donor.uid] = !expanded[donor.uid])}>
          <span class="donor-name">{donor.name}</span>
          <span class="donor-meta num">{view.count} 位現任・NT$ {fmt(view.total)}</span>
        </button>
        {#if expanded[donor.uid]}
          {#if view.filtered}<p class="filter-note">篩選中：僅列符合條件之受贈者與其金額</p>{/if}
          <ul class="recips">
            {#each view.recipients as r}
              <li>
                {#if r.slug}<a href={`/officials/${r.slug}`}>{r.name}</a><span class="tag">{r.party}・{officeName[r.officeType ?? ''] ?? ''}</span>
                {:else}<span class="plain">{r.name}</span><span class="tag dim2">非本站收錄之現任者</span>{/if}
                <span class="amt num">NT$ {fmt(r.amount)}</span>
                <span class="elec">{r.election}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>
    {/each}
  {:else}
    {#if officialHits.length > 0}
      <h2>政治人物</h2>
      {#each officialHits as o (o.slug)}
        <a class="offrow" href={`/officials/${o.slug}`}>
          <strong>{o.name}</strong>
          <span class="tag">{o.party}・{officeName[o.officeType] ?? ''}・{o.district}</span>
          <span class="amt num">獻金總收入 NT$ {fmt(o.totalIncome)}</span>
        </a>
      {/each}
    {/if}
    {#if donorHits.length > 0}
      <h2>營利事業</h2>
      {#each donorHits as { donor, view } (donor.uid)}
        <article class="card donor">
          <button class="donor-head" aria-expanded={!!expanded[donor.uid]} on:click={() => (expanded[donor.uid] = !expanded[donor.uid])}>
            <span class="donor-name">{donor.name}</span>
            <span class="donor-meta num">{donor.uid.startsWith('name:') ? '' : `統編 ${donor.uid}・`}NT$ {fmt(view.total)}</span>
          </button>
          {#if expanded[donor.uid]}
            {#if view.filtered}<p class="filter-note">篩選中：僅列符合條件之受贈者與其金額</p>{/if}
            <ul class="recips">
              {#each view.recipients as r}
                <li>
                  {#if r.slug}<a href={`/officials/${r.slug}`}>{r.name}</a><span class="tag">{r.party}・{officeName[r.officeType ?? ''] ?? ''}</span>
                  {:else}<span class="plain">{r.name}</span><span class="tag dim2">非本站收錄之現任者</span>{/if}
                  <span class="amt num">NT$ {fmt(r.amount)}</span>
                  <span class="elec">{r.election}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </article>
      {/each}
    {/if}
    {#if officialHits.length === 0 && donorHits.length === 0}
      <p class="dim">查無符合「{q}」的政治人物或營利事業。</p>
    {/if}
  {/if}
{/if}

<style>
  .ctrl { width: 100%; max-width: 480px; padding: 8px 12px; font-size: 1rem; border: 1px solid var(--line-strong); background: transparent; color: var(--fg); }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 10px 0 0; }
  .controls .ctrl { width: auto; max-width: none; padding: 7px 11px; font-size: 0.8125rem; border-radius: 7px; background: var(--surface); transition: border-color var(--ease); }
  .controls .ctrl:hover { border-color: var(--accent); }
  .stats { margin: 14px 0 6px; font-size: 0.8125rem; color: var(--muted); }
  .filter-note { margin: 0 0 6px; font-size: 0.75rem; color: var(--muted); }
  h2 { font-size: 1.0625rem; margin: 22px 0 8px; }
  .donor { margin: 8px 0; }
  .donor-head { display: flex; justify-content: space-between; gap: 12px; width: 100%; padding: 10px 0; background: none; border: none; cursor: pointer; color: var(--fg); font: inherit; text-align: left; }
  .donor-name { font-weight: 700; }
  .donor-meta { color: var(--muted); font-size: 0.8125rem; flex: none; }
  .recips { list-style: none; margin: 0 0 10px; padding: 0; font-size: 0.875rem; }
  .recips li { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; padding: 4px 0; border-top: 1px solid var(--line); }
  .recips a { font-weight: 700; }
  .plain { color: var(--muted); }
  .tag { font-size: 0.75rem; color: var(--muted); }
  .dim2 { color: var(--faint); }
  .amt { margin-left: auto; }
  .elec { flex: none; font-size: 0.75rem; color: var(--faint); }
  .offrow { display: flex; gap: 10px; align-items: baseline; padding: 9px 0; border-bottom: 1px solid var(--line); }
  .offrow .amt { margin-left: auto; font-size: 0.875rem; }
  .dim { color: var(--muted); }
</style>
