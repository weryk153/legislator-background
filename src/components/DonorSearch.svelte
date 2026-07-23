<script lang="ts">
  import { onMount } from 'svelte';

  type Recipient = { name: string; election: string; amount: number; slug: string | null; party: string | null; officeType: string | null };
  type Donor = { uid: string; name: string; total: number; recipients: Recipient[] };
  type Off = { name: string; slug: string; party: string; officeType: string; district: string; totalIncome: number };
  type Data = { generatedAt: string; elections: string[]; officials: Off[]; donors: Donor[] };

  let data: Data | null = null;
  let failed = false;
  let search = '';
  let expanded: Record<string, boolean> = {};

  onMount(async () => {
    try {
      const res = await fetch('/data/donors.json');
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch { failed = true; }
  });

  const fmt = (n: number) => new Intl.NumberFormat('zh-Hant').format(n);
  const officeName: Record<string, string> = { legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員' };

  // 現任受贈人數（多方捐贈排行用）：同一位現任只算一次
  const linkedCount = (d: Donor) => new Set(d.recipients.filter((r) => r.slug).map((r) => r.slug)).size;

  $: q = search.trim();
  $: officialHits = data && q.length >= 2 ? data.officials.filter((o) => o.name.includes(q)).slice(0, 30) : [];
  $: donorHits = data && q.length >= 2
    ? data.donors.filter((d) => d.name.includes(q) || d.uid.startsWith(q)).slice(0, 50)
    : [];
  // 預設排行：捐給最多位現任者前 50（次序鍵：人數 desc, 總額 desc）
  $: ranking = data && q.length < 2
    ? [...data.donors].map((d) => ({ d, n: linkedCount(d) })).filter((x) => x.n >= 2)
        .sort((a, b) => b.n - a.n || b.d.total - a.d.total).slice(0, 50)
    : [];
  $: totalAmount = data ? data.donors.reduce((s, d) => s + d.total, 0) : 0;
</script>

<input class="ctrl" type="search" placeholder="輸入政治人物姓名，或公司名稱／統一編號" aria-label="搜尋" bind:value={search} />

{#if failed}
  <p class="dim">資料載入失敗，請重新整理。</p>
{:else if !data}
  <p class="dim">載入中…</p>
{:else}
  {#if q.length < 2}
    <p class="stats num">收錄營利事業 {fmt(data.donors.length)} 家・捐贈總額 NT$ {fmt(totalAmount)}・{data.elections.length} 場選舉（{data.generatedAt} 匯出）</p>
    <h2>捐給最多位現任政治人物的企業</h2>
    {#each ranking as { d, n } (d.uid)}
      <article class="card donor">
        <button class="donor-head" on:click={() => (expanded[d.uid] = !expanded[d.uid])}>
          <span class="donor-name">{d.name}</span>
          <span class="donor-meta num">{n} 位現任・NT$ {fmt(d.total)}</span>
        </button>
        {#if expanded[d.uid]}
          <ul class="recips">
            {#each d.recipients as r}
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
      {#each donorHits as d (d.uid)}
        <article class="card donor">
          <button class="donor-head" on:click={() => (expanded[d.uid] = !expanded[d.uid])}>
            <span class="donor-name">{d.name}</span>
            <span class="donor-meta num">{d.uid.startsWith('name:') ? '' : `統編 ${d.uid}・`}NT$ {fmt(d.total)}</span>
          </button>
          {#if expanded[d.uid]}
            <ul class="recips">
              {#each d.recipients as r}
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
  .stats { margin: 14px 0 6px; font-size: 0.8125rem; color: var(--muted); }
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
