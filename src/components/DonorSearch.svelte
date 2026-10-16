<script lang="ts">
  import { rankDonors, filterOfficials, collectParties, collectElectionGroups, ELECTION_GROUP_LABEL, filterOfficialsByName, filterDonorsByName, type DonorSort, type Donor, type Official, type DonorCardEntry } from '../lib/donorFilter';
  import DonorCard from './DonorCard.svelte';
  import RecipientCard from './RecipientCard.svelte';
  import { rankRecipients } from '../lib/donorFilter';

  export let initialRanking: DonorCardEntry[] = [];
  export let initialParties: string[] = [];
  export let initialElections: string[] = [];
  type Data = { generatedAt: string; elections: string[]; officials: Official[]; donors: Donor[] };
  let data: Data | null = null;
  let failed = false;
  let requested = false;
  let search = '';
  let sort: DonorSort = 'count';
  let party = '';
  let officeType = '';
  let election = '';
  let mode: 'donors' | 'recipients' = 'donors';

  // 初始排行由 Astro 傳入並 SSR；完整資料僅在讀者搜尋／篩選時下載。
  async function ensureData() {
    if (requested) return;
    requested = true;
    failed = false;
    try {
      const res = await fetch('/data/donors.json');
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch { failed = true; }
  }
  function retry() { requested = false; ensureData(); }
  function reset() { search = ''; party = ''; officeType = ''; election = ''; sort = mode === 'recipients' ? 'total' : 'count'; }
  function changeMode(next: typeof mode) { mode = next; search = ''; sort = next === 'recipients' ? 'total' : 'count'; ensureData(); }
  $: if (search || party || officeType || election || sort !== 'count') ensureData();
  const fmt = (n: number) => new Intl.NumberFormat('zh-Hant').format(n);
  const officeName: Record<string, string> = { legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員', candidate: '參選人' };
  $: q = search.trim();
  $: active = Boolean(q || party || officeType || election || sort !== (mode === 'recipients' ? 'total' : 'count'));
  $: filterQuery = { party: party || undefined, officeType: officeType || undefined, election: election || undefined, sort };
  $: parties = data ? collectParties(data.donors) : initialParties;
  $: elections = data ? collectElectionGroups(data.donors) : initialElections;
  $: officialHits = data && q.length >= 2 ? filterOfficials(filterOfficialsByName(data.officials, q), filterQuery) : [];
  $: donorHits = data && q.length >= 2 ? rankDonors(filterDonorsByName(data.donors, q), filterQuery, { limit: 50 }) : [];
  $: ranking = data ? rankDonors(data.donors, filterQuery, { minCount: 2, limit: 50 }) : initialRanking;
  $: recipientRanking = data && mode === 'recipients' ? rankRecipients(data.donors, filterQuery, { search: q.length >= 2 ? q : undefined, limit: 50 }) : [];
</script>

<div class="view-switch" role="group" aria-label="查詢方向">
  <button class:chosen={mode === 'donors'} aria-pressed={mode === 'donors'} on:click={() => changeMode('donors')}>看捐贈企業</button>
  <button class:chosen={mode === 'recipients'} aria-pressed={mode === 'recipients'} on:click={() => changeMode('recipients')}>看誰收最多</button>
</div>
<section class="search-area" aria-label="政治獻金搜尋與篩選" on:focusin={ensureData}>
  <div class="search-top"><label for="donor-search">{mode === 'recipients' ? '查詢受贈者' : '查詢獻金流向'}</label><span>{mode === 'recipients' ? '輸入受贈者姓名，反查捐贈企業' : '政治人物姓名／營利事業名稱／統一編號'}</span></div>
  <div class="search-field control-with-icon">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
    <input id="donor-search" class="form-control" type="search" placeholder="輸入至少 2 個字或數字" aria-describedby="search-help" bind:value={search} />
  </div>
  <div class="controls">
    <label>排序方式<select class="form-control" aria-label="排序方式" bind:value={sort}><option value="count">{mode === 'recipients' ? '捐贈企業家數' : '現任受贈人數'}</option><option value="total">{mode === 'recipients' ? '企業受贈總額' : '捐贈總額'}</option></select></label>
    <label>受贈者政黨<select class="form-control" aria-label="篩選政黨" bind:value={party}><option value="">全部政黨</option>{#each parties as p}<option value={p}>{p}</option>{/each}</select></label>
    <label>受贈者職務<select class="form-control" aria-label="篩選職務" bind:value={officeType}><option value="">全部職務</option><option value="legislator">立委</option><option value="councilor">議員</option><option value="mayor_magistrate">縣市長</option></select></label>
    <label>選舉範圍<select class="form-control" aria-label="篩選選舉" bind:value={election}><option value="">全部選舉</option>{#each elections as e}<option value={e}>{ELECTION_GROUP_LABEL[e] ?? e}</option>{/each}</select></label>
    <button class="reset" on:click={reset} disabled={!active}>重設條件 ↺</button>
  </div>
  <p class="search-help" id="search-help">{q.length === 1 ? '再輸入 1 個字或數字即可搜尋。' : mode === 'recipients' ? '依企業捐贈紀錄彙總，包含未連結本站現任者資料的受贈者；政黨與職務篩選僅適用已連結者。' : '依受贈者條件篩選，企業金額與人數會一併重新計算。'}</p>
</section>

<div class="load-state" aria-live="polite">
  {#if failed}<p>查詢資料載入失敗。<button on:click={retry}>重新載入</button></p>
  {:else if requested && !data}<p>正在載入完整查詢資料…</p>{/if}
</div>

{#if data || (!active && mode === 'donors')}
{#if mode === 'recipients'}
  <div class="result-head"><h2><span>受贈者排行</span></h2><p aria-live="polite">{data ? `${recipientRanking.length} 筆` : '載入中'}</p></div>
  <p class="result-note">依{sort === 'total' ? '企業受贈總額' : '捐贈企業家數'}由多到少排序，最多顯示 50 筆。同一人在不同選舉分列；金額僅包含本頁收錄的營利事業捐贈，並非含個人捐贈的專戶總收入。展開可查看捐贈企業。</p>
  {#if data}
    <div class="donor-list">{#each recipientRanking as entry, index (entry.key)}<RecipientCard {entry} rank={index + 1} />{/each}</div>
    {#if recipientRanking.length === 0}<p class="empty">找不到符合{q.length >= 2 ? `「${q}」及` : ''}目前篩選條件的受贈者，請調整姓名或重設條件。</p>{/if}
  {/if}
{:else if q.length < 2 || !data}
  <div class="result-head"><h2><span>營利事業捐贈一覽</span></h2><p>{data ? ranking.length : initialRanking.length} 家企業</p></div>
  <p class="result-note">列出捐贈予至少 2 位本站收錄現任者的企業，依{sort === 'count' ? '現任受贈人數' : '捐贈總額'}排序，最多顯示 50 家。展開可查看受贈明細。</p>
  <div class="donor-list">
    {#each ranking as entry, index (entry.donor.uid)}<DonorCard {entry} rank={index + 1} />{/each}
  </div>
  {#if data && ranking.length === 0}<p class="empty">目前條件下，沒有符合至少 2 位現任受贈者的企業。可調整篩選，或直接搜尋公司名稱。</p>{/if}
{:else}
  <p class="result-status" aria-live="polite">「{q}」的搜尋結果：政治人物 {officialHits.length} 位・營利事業 {donorHits.length} 家（各最多顯示 30 位／50 家）</p>
  {#if officialHits.length > 0}
    <div class="result-head"><h2><span>政治人物</span></h2><p>{officialHits.length} 位</p></div>
    <p class="result-note">獻金總收入為個人專戶彙總，包含各類捐贈；此區依政黨、職務篩選，不套用選舉範圍。</p>
    <div class="official-list">{#each officialHits as official (official.slug)}
      <a class="offrow" href={`/officials/${official.slug}/`}>
        <span><strong>{official.name}</strong><span class="tag">{official.party}・{officeName[official.officeType] ?? ''}・{official.district}</span></span>
        <span class="off-amount"><span class="tag">獻金總收入</span><span class="num">NT$ {fmt(official.totalIncome)}</span></span><span class="arrow" aria-hidden="true">↗</span>
      </a>
    {/each}</div>
  {/if}
  {#if donorHits.length > 0}
    <div class="result-head"><h2><span>營利事業</span></h2><p>{donorHits.length} 家</p></div>
    <div class="donor-list">{#each donorHits as entry, index (entry.donor.uid)}<DonorCard {entry} rank={index + 1} />{/each}</div>
  {/if}
  {#if officialHits.length === 0 && donorHits.length === 0}<div class="empty"><strong>沒有符合「{q}」的資料</strong><p>請試試姓名、公司名稱的一部分或統一編號，也可以重設篩選條件。</p><button class="reset" on:click={reset}>重設條件 ↺</button></div>{/if}
{/if}
{/if}

<style>
  .view-switch { display: flex; gap: 0; margin-bottom: 14px; }
  .view-switch button { flex: 0 1 180px; padding: 12px 16px; border: 1px solid var(--fg); background: var(--bg); color: var(--fg); font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; }
  .view-switch button + button { border-left: 0; }
  .view-switch .chosen { background: var(--block-bg); color: var(--block-fg); }
  .view-switch button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .search-area { padding: 24px; background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--fg); }
  .search-top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; margin-bottom: 12px; }
  .search-top label { font-weight: 700; font-size: 16px; }
  .search-top span { color: var(--muted); font-size: 12px; }
  .controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.35fr) auto; gap: 14px; align-items: end; margin-top: 18px; }
  .controls select { margin-top: 6px; }
  .controls label { min-width: 0; font-size: 12px; color: var(--muted); }
  .reset { min-height: 44px; border: 1px solid var(--control-border); background: var(--surface); color: var(--muted); padding: 8px 12px; cursor: pointer; font: inherit; font-size: 13px; }
  .reset:disabled { opacity: .4; cursor: default; }
  .reset:not(:disabled):hover { background: var(--row-hover); color: var(--fg); }
  .reset:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .search-help { margin: 12px 0 0; color: var(--muted); font-size: 12px; }
  .load-state { color: var(--accent); font-size: 13px; }
  .load-state button { background: none; border: 0; color: inherit; text-decoration: underline; cursor: pointer; }
  .result-head { display: flex; align-items: center; gap: 18px; margin: 32px 0 12px; }
  h2 { display: flex; flex: 1; align-items: center; margin: 0; font-size: 25px; font-weight: 900; line-height: 1.2; }
  h2 span { background: var(--block-bg); color: var(--block-fg); padding: 5px 10px; }
  h2::after { content: ''; flex: 1; border-top: 3px solid var(--fg); }
  .result-head p { flex: none; color: var(--muted); font-size: 12px; margin: 0; }
  .result-note, .result-status { color: var(--muted); font-size: 13px; margin: 12px 0 16px; }
  .donor-list, .official-list { border-top: 1px solid var(--fg); }
  .offrow { display: flex; align-items: center; gap: 18px; padding: 18px 16px; border-bottom: 1px solid var(--line); }
  .offrow:hover { background: var(--row-hover); }
  .offrow strong { font-size: 20px; font-family: var(--serif); }
  .tag { display: block; color: var(--muted); font-size: 12px; margin-top: 4px; }
  .off-amount { margin-left: auto; flex: none; text-align: right; font-size: 18px; }
  .off-amount .tag { margin: 0 0 4px; }
  .arrow { color: var(--accent); }
  .empty { padding: 32px 20px; margin-top: 16px; border: 1px dashed var(--line); color: var(--muted); text-align: center; font-size: 14px; }
  @media (max-width: 900px) { .controls { grid-template-columns: repeat(2, minmax(0, 1fr)); } .reset { justify-self: start; } }
  @media (max-width: 540px) {
    .search-area { padding: 16px 12px; }
    .controls { gap: 12px 10px; }
    .search-top span { font-size: 11px; }
    h2 { font-size: 20px; }
    .result-head { gap: 8px; }
    .offrow { flex-wrap: wrap; padding: 16px 8px; gap: 8px; }
    .offrow > span:first-child { flex: 1 1 100%; }
    .off-amount { margin-left: 0; text-align: left; font-size: 17px; }
    .arrow { margin-left: auto; }
  }
</style>
