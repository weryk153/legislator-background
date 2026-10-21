<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchElectionJson } from '../lib/fetchElectionJson';
  import {
    RANKING_METRICS, DEFAULT_RANKING_QUERY, rankingMetric, queryRankings, rankingPeriods,
    rankingQueryFromParams, rankingQueryParams, formatRankingValue,
    type RankingMetric, type RankingPerson, type RankingQuery, type RankingResult,
  } from '../lib/rankings';
  export let dataUrl: string;
  export let initialResult: RankingResult;
  export let options: { regions: string[]; parties: string[]; years: string[] };
  const groups = [...new Set(RANKING_METRICS.map(m=>m.group))];
  const offices: Record<string,string> = { legislator:'立委', mayor_magistrate:'縣市首長', councilor:'議員', candidate:'參選人' };
  let people: RankingPerson[] = [];
  let q: RankingQuery = { ...DEFAULT_RANKING_QUERY };
  let loaded = false, loading = false, failed = false;
  let limit = 20;
  let copied = false;
  let copyMessage = '';
  let copyTimer: ReturnType<typeof setTimeout>;
  $: metric = rankingMetric(q.metric);
  $: periods = loaded ? rankingPeriods(people,q.metric) : options.years;
  $: result = loaded ? queryRankings(people,q) : initialResult;
  $: shown = result.rows.slice(0,limit);
  $: signature = rankingQueryParams(q);
  $: signature, (limit = 20);
  $: if (loaded) syncUrl(signature);

  function syncUrl(params: string) {
    // Replace keeps normal back navigation intact; full query travels with a copied link.
    if (window.location.search.slice(1) !== params) window.history.replaceState(null,'',`${window.location.pathname}?${params}`);
  }
  async function load() {
    if (loading) return;
    loading = true; failed = false;
    try {
      people = await fetchElectionJson<RankingPerson[]>(dataUrl);
      q = rankingQueryFromParams(new URLSearchParams(window.location.search),people);
      loaded = true;
    } catch { failed = true; }
    finally { loading = false; }
  }
  function selectMetric(id: RankingMetric) {
    const nextPeriods = rankingPeriods(people,id);
    q = { ...q, metric:id, period:nextPeriods.includes(q.period) ? q.period : nextPeriods[0] ?? 'all' };
  }
  function clearFilters() { q = { ...q, office:'', region:'', party:'', search:'' }; }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copied = true; copyMessage = '已複製目前排行連結';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(()=>{copied=false;copyMessage='';},2500);
    } catch { copyMessage = '無法自動複製，請複製瀏覽器網址列。'; }
  }
  onMount(() => {
    void load();
    const restore = () => { if (loaded) q = rankingQueryFromParams(new URLSearchParams(window.location.search),people); };
    window.addEventListener('popstate',restore);
    return () => { window.removeEventListener('popstate',restore);clearTimeout(copyTimer); };
  });
</script>

<div class="ranking-layout">
  <aside aria-label="選擇排行指標">
    <div class="index-head"><span>指標目錄</span><span>01—14</span></div>
    {#each groups as group}
      <div class="metric-group">
        <h2>{group}</h2>
        <div class="metric-buttons">
          {#each RANKING_METRICS.filter(m=>m.group===group) as item}
            <button class:chosen={q.metric===item.id} type="button" disabled={!loaded} aria-pressed={q.metric===item.id} on:click={()=>selectMetric(item.id)}>
              {item.label}<span aria-hidden="true">↗</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </aside>
  <section aria-labelledby="ranking-heading" class="ranking-main" aria-busy={loading}>
    <div class="ranking-heading">
      <div><p class="eyebrow">{metric.group}</p><h2 id="ranking-heading">{metric.label}</h2></div>
      <button class="action" type="button" disabled={!loaded} on:click={copyLink}>{copied ? '已複製' : '複製排行連結'}</button>
    </div>
    {#if copyMessage}<p class="feedback" role="status">{copyMessage}</p>{/if}
    <p class="metric-note">{metric.note}</p>
    <fieldset disabled={!loaded}>
      <legend class="sr-only">排行篩選條件</legend>
      <div class="filters">
        {#if metric.group === '財產申報' || metric.group === '政治獻金'}
          <label class="period">{metric.group === '財產申報' ? '申報年度' : '選舉場次'}
            <select class="form-control" bind:value={q.period}>
              {#each periods as period}<option value={period}>{period === 'latest' ? '各人最新申報（年份可能不同）' : period}{period!=='latest' && metric.group==='財產申報' ? ' 年' : ''}</option>{/each}
            </select>
          </label>
        {/if}
        <label>職位<select class="form-control" bind:value={q.office}><option value="">全部職位</option>{#each Object.entries(offices) as [key,label]}<option value={key}>{label}</option>{/each}</select></label>
        <label>縣市<select class="form-control" bind:value={q.region}><option value="">全部縣市</option>{#each options.regions as r}<option value={r}>{r}</option>{/each}</select></label>
        <label>政黨<select class="form-control" bind:value={q.party}><option value="">全部政黨</option>{#each options.parties as p}<option value={p}>{p}</option>{/each}</select></label>
        <label>排列方式<select class="form-control" bind:value={q.order}><option value="desc">由高到低</option><option value="asc">由低到高</option></select></label>
      </div>
      <div class="search-bar">
        <label class="search"><span class="sr-only">搜尋姓名</span><input class="form-control" type="search" maxlength="100" placeholder="搜尋姓名，查看在此範圍的名次" bind:value={q.search} /></label>
        {#if q.office || q.region || q.party || q.search}<button class="action" type="button" on:click={clearFilters}>清除篩選</button>{/if}
      </div>
    </fieldset>
    {#if failed}
      <div class="load-error" role="alert">完整排行載入失敗，目前保留預設存款排行。<button class="action" type="button" on:click={load}>重新載入</button></div>
    {:else if loading}
      <p class="feedback" role="status">正在載入完整排行，完成後可切換指標與篩選條件…</p>
    {/if}
    <div class="coverage" role="status">
      <p><strong>{result.eligibleCount.toLocaleString('zh-Hant')}</strong> 人可比較 <span>／ 篩選範圍 {result.scopeCount.toLocaleString('zh-Hant')} 人</span></p>
      <p>{result.excludedCount.toLocaleString('zh-Hant')} 人無可比較資料，未列入</p>
    </div>
    {#if metric.group === '財產申報'}
      <p class="context-note">{q.period === 'latest' ? '各人最新申報年份不同；可指定同一年比較。' : '僅列所選年度，不以其他年份補值。'} 缺少該欄位不當成零。金額由公報解析，請核對原始出處。</p>
    {:else if metric.group === '政治獻金'}
      <p class="context-note">僅比較所選選舉；未取得專戶、分類缺值或同場申報版本未能確認者不列入。不分區立委無個人專戶。</p>
    {:else}
      <p class="context-note">收錄多寡受資料涵蓋程度影響。沒有收錄不代表沒有紀錄；這是資料筆數比較，並非人物評分。</p>
    {/if}
    {#if shown.length}
      <div class="table-scroll">
        <table>
          <caption class="sr-only">{metric.label}排行，{q.order==='desc' ? '由高到低' : '由低到高'}，同值並列名次</caption>
          <thead><tr><th scope="col" class="rank">名次</th><th scope="col">人物／資料期間</th><th scope="col" class="number">{metric.unit}</th><th scope="col" class="source">出處</th></tr></thead>
          <tbody>
            {#each shown as row (row.id)}
              <tr>
                <td class="rank"><span class="rank-value">{String(row.rank).padStart(2,'0')}</span></td>
                <td class="person">
                  <a class="person-name" href={`/officials/${row.slug}/#${metric.section}`}>{row.name}</a>
                  {#if row.departed}<span class="departed">離任／解職</span>{/if}
                  <div class="identity">{row.party} · {offices[row.officeType]} · {row.district}</div>
                  <div class="period-label">{row.period}</div>
                </td>
                <td class="number"><span class="value">{formatRankingValue(row.value,q.metric)}</span>{#if metric.unit==='%'}<span class="percent">%</span>{/if}</td>
                <td class="source"><a href={`/officials/${row.slug}/#${metric.section}`} aria-label={`查看${row.name}的${metric.label}資料與出處`}>查看<span aria-hidden="true"> ↗</span></a></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty" role="status"><h3>沒有符合條件的排行資料</h3><p>{result.eligibleCount ? '此範圍沒有符合姓名搜尋的人物，試試清除搜尋。' : '試試其他年份、選舉場次或篩選條件。缺資料不代表數值為零。'}</p></div>
    {/if}
    <div class="list-footer">
      <span>{loaded ? `顯示 ${shown.length}／${result.rows.length} 人` : `顯示前 ${shown.length} 人`} · 同值並列，後續名次跳號</span>
      {#if loaded && shown.length < result.rows.length}<button class="action" type="button" on:click={()=>limit+=20}>載入更多</button>{/if}
    </div>
    <details class="method">
      <summary>排行怎麼算？</summary>
      <p>先依職位、縣市、政黨限定比較範圍，再按指標數值排序。搜尋姓名保留該人物在此範圍的名次。同值採 1、1、3 的並列方式；百分比用未四捨五入數值排序。</p>
      <p>職位與政黨依本站人物檔案，可能與歷史申報時不同。「各人最新」採最新一份申報，該份缺少欄位時不回填舊年數字。零值僅在資料明確記載或可計算時列入。</p>
      <p>本站未建立完整的未收錄原因分類，未列入可能是尚未收錄、欄位缺值、不適用或資料無法比較。請從人物頁核對原始資料。</p>
    </details>
  </section>
</div>
<style>
  .ranking-layout { display:grid;grid-template-columns:228px minmax(0,1fr);gap:36px;align-items:start; }
  .index-head { display:flex;justify-content:space-between;border-top:4px solid var(--fg);padding:12px 0;font-size:12px;font-weight:700; }
  .index-head span:last-child { color:var(--faint);font-variant-numeric:tabular-nums; }
  .metric-group { border-top:1px solid var(--line);padding:14px 0; }
  .metric-group h2 { font-size:12px;color:var(--muted);margin:0 0 8px; }
  .metric-buttons { display:grid;gap:4px; }
  .metric-buttons button { text-align:left;display:flex;justify-content:space-between;gap:8px;min-height:44px;padding:10px 12px;border:1px solid transparent;background:transparent;color:var(--fg);font:inherit;font-size:13px;cursor:pointer; }
  .metric-buttons button:hover { background:var(--row-hover); }
  .metric-buttons button.chosen { background:var(--block-bg);color:var(--block-fg); }
  .metric-buttons button span { visibility:hidden; }.metric-buttons button.chosen span { visibility:visible;color:var(--block-accent); }
  button:disabled { cursor:wait; }.metric-buttons button:disabled:not(.chosen) { opacity:.55; }
  .ranking-main { border-top:4px solid var(--fg);min-width:0; }
  .ranking-heading { display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:18px; }
  .eyebrow { color:var(--accent);font-size:11px;font-weight:700;margin:0 0 8px; }
  .ranking-heading h2 { margin:0;font:900 30px/1.4 var(--serif); }
  .metric-note { font-size:13px;color:var(--muted);line-height:1.8;margin:12px 0 20px; }
  fieldset { padding:0;margin:0;border:0;min-width:0; }
  .filters { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px; }
  .filters label { display:grid;gap:6px;font-size:11px;color:var(--muted);min-width:0; }
  .filters .period { grid-column:1/-1; }
  .form-control { width:100%;min-width:0; }
  .search-bar { display:flex;gap:12px;margin-top:12px; }.search { flex:1;min-width:0; }
  .action { min-height:44px;padding:8px 12px;background:var(--surface);color:var(--fg);border:1px solid var(--control-border);font:inherit;font-size:12px;cursor:pointer;flex-shrink:0; }
  .action:hover { background:var(--row-hover); }.action:disabled { opacity:.55; }
  .coverage { display:flex;align-items:baseline;justify-content:space-between;gap:8px 20px;flex-wrap:wrap;margin-top:24px;padding:14px 0;border-top:1px solid var(--line-strong); }
  .coverage p { margin:0;font-size:12px;color:var(--muted); }.coverage strong { font-size:24px;color:var(--fg);font-variant-numeric:tabular-nums; }
  .context-note { font-size:12px;line-height:1.7;color:var(--muted);margin:0 0 16px; }
  .table-scroll { overflow-x:auto; }
  table { width:100%;border-collapse:collapse; }
  th { font-size:11px;color:var(--muted);font-weight:500;text-align:left;padding:10px 8px;border-top:2px solid var(--fg);border-bottom:1px solid var(--fg);white-space:nowrap; }
  td { padding:18px 8px;border-bottom:1px solid var(--line); }
  tbody tr:hover { background:var(--row-hover); }
  .rank { width:58px;padding-left:0; }.rank-value { font-size:24px;font-weight:700;letter-spacing:-.04em;font-variant-numeric:tabular-nums; }
  .person-name { font:900 21px/1.5 var(--serif); }.person-name:hover { text-decoration:underline; }
  .identity,.period-label { font-size:11px;color:var(--muted);line-height:1.7;margin-top:3px; }
  .period-label { color:var(--faint); }.departed { display:inline-block;color:var(--accent);font-size:10px;margin-left:8px; }
  .number { text-align:right;white-space:nowrap; }.value { font-size:21px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.025em; }.percent { font-size:12px;margin-left:2px; }
  .source { width:64px;text-align:right;padding-right:0; }.source a { display:inline-flex;align-items:center;min-height:44px;font-size:12px;text-decoration:underline;text-underline-offset:4px;white-space:nowrap; }
  .list-footer { display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 0;color:var(--muted);font-size:11px; }
  .method { margin-top:12px;border-top:1px solid var(--line);padding-top:16px;font-size:12px;color:var(--muted);line-height:1.8; }.method summary { cursor:pointer;min-height:44px; }.method p { margin:8px 0; }
  .empty { padding:36px 20px;background:var(--row-hover);text-align:center; }.empty h3 { font:700 20px var(--serif); }.empty p { font-size:13px;color:var(--muted); }
  .load-error { padding:12px;border:1px solid var(--accent);display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;margin-top:16px; }
  .feedback { color:var(--muted);font-size:12px;line-height:1.7; }
  @media(max-width:1000px) { .ranking-layout { grid-template-columns:196px minmax(0,1fr);gap:24px; }.value { font-size:18px; }.rank { width:42px; } }
  @media(max-width:760px) {
    .ranking-layout { grid-template-columns:1fr;gap:24px; }.index-head { padding:8px 0; }.metric-group { padding:10px 0; }.metric-buttons { display:flex;overflow-x:auto;gap:6px;padding-bottom:4px; }.metric-buttons button { border-color:var(--line);flex-shrink:0;font-size:12px;padding:8px 10px; }.metric-buttons button span { display:none; }
    .ranking-heading h2 { font-size:26px; }.ranking-heading { gap:10px; }.filters { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .rank-value { font-size:20px; }.person-name { font-size:19px; }.source { display:none; }.person-name { text-decoration:underline;text-underline-offset:4px; }
    td { padding:14px 6px; }.rank { width:32px; }.number { padding-right:0; }.value { font-size:17px; }.identity { max-width:190px; }.coverage { margin-top:20px; }
  }
  @media(max-width:380px) { .ranking-heading h2 { font-size:22px; }.ranking-heading .action { padding:8px;font-size:11px; }.value { font-size:15px; }.identity { max-width:145px; }.person-name { font-size:18px; } }
</style>
