<script lang="ts">
  import { onMount } from 'svelte';
  import { electionMargin, selectMarginRace, readMarginLocation, marginSharePath, type MarginDataset } from '../lib/electionMargin';
  import { fetchElectionJson } from '../lib/fetchElectionJson';
  import ShareActions from './ShareActions.svelte';

  let { dataUrl, year, siteUrl }: { dataUrl: string; year: number; siteUrl: string } = $props();
  let data = $state<MarginDataset | null>(null);
  let loading = $state(true);
  let failed = $state(false);
  let countyCode = $state('');
  let townCode = $state('');
  let revealed = $state(false);
  let round = $state(0);
  const county = $derived(data?.counties.find(c => c.code === countyCode));
  const selected = $derived(county ? selectMarginRace(county, townCode) : null);
  const result = $derived(revealed ? selected?.result : null);
  const fmt = (n: number) => n.toLocaleString('zh-TW');
  const percent = (votes: number, total: number) => (votes / total * 100).toFixed(2);

  async function load() {
    loading = true;
    failed = false;
    // Astro's development server applies trailingSlash: always to generated endpoints;
    // the production build emits a regular .json file.
    const url = import.meta.env.DEV ? `${dataUrl}/` : dataUrl;
    try {
      data = await fetchElectionJson<MarginDataset>(url);
      const saved = readMarginLocation(new URL(window.location.href), data);
      if (saved) { countyCode = saved.county; townCode = saved.town; revealed = true; }
    }
    catch { failed = true; }
    finally { loading = false; }
  }
  onMount(() => { void load(); });
  function reveal(event?: SubmitEvent) {
    event?.preventDefault();
    if (county) { revealed = true; round++; }
  }
  function surprise() {
    if (!data) return;
    // Every actual election gets one entry; appointed districts don't repeat the city race.
    const races = data.counties.flatMap(c => [
      { county: c.code, town: '', race: c.race },
      ...c.towns.filter(t => t.chiefOffice === 'elected').map(t => ({ county: c.code, town: t.code, race: t.race })),
    ]).filter(r => electionMargin(r.race).kind !== 'missing'
      && (!revealed || r.county !== countyCode || r.town !== townCode));
    if (!races.length) return;
    const choice = races[Math.floor(Math.random() * races.length)];
    countyCode = choice.county;
    townCode = choice.town;
    revealed = true;
    round++;
  }
</script>

<section class="margin-feature" aria-labelledby="margin-heading">
  <div class="margin-question">
    <p class="eyebrow">從你住的地方開始 <span>{year} 首長選舉</span></p>
    <h2 id="margin-heading">你這一區，<br />上次差幾票？</h2>
    <p class="intro">選個地方，看看前兩名的距離。</p>
    <form onsubmit={reveal} aria-busy={loading}>
      <div class="selects">
        <label for="margin-county">縣市
          <select class="form-control" id="margin-county" bind:value={countyCode} disabled={!data} required
            onchange={() => { townCode = ''; revealed = false; }}>
            <option value="">{loading ? '載入地區中…' : '選擇縣市'}</option>
            {#each data?.counties ?? [] as c}<option value={c.code}>{c.name}</option>{/each}
          </select>
        </label>
        <label for="margin-town">鄉鎮市區
          <select class="form-control" id="margin-town" bind:value={townCode} disabled={!county}
            onchange={() => { revealed = false; }}>
            <option value="">{county ? `全${county.name.endsWith('縣') ? '縣' : '市'}（縣市長）` : '先選擇縣市'}</option>
            {#each county?.towns ?? [] as t}<option value={t.code}>{t.name}</option>{/each}
          </select>
        </label>
      </div>
      <div class="actions">
        <button class="reveal" type="submit" disabled={!county}>揭曉票差</button>
        <button class="random" type="button" disabled={!data} onclick={surprise}>隨機看一區</button>
      </div>
    </form>
    {#if failed}
      <p class="load-error" role="alert">票差資料暫時載入失敗。<button type="button" onclick={load}>重新載入</button></p>
    {/if}
    <noscript><p>此互動需要 JavaScript。可直接<a href="/elections/2022/#overview-title">查看 2022 縣市結果</a>。</p></noscript>
    <p class="scope">一般區區長為官派，選區後顯示全市市長選舉；鄉鎮市與原住民區可看當地首長。</p>
  </div>

  <div class="margin-answer" aria-live="polite" aria-atomic="true">
    {#key round}
      {#if result && selected && county}
        <div class="answer-content">
          <p class="race-title">{year} · {selected.place}長選舉</p>
          {#if selected.appointed}<p class="fallback-note">{county.towns.find(t => t.code === townCode)?.name}區長為官派。以下是{county.name}全市結果。</p>{/if}
          {#if result.kind === 'missing'}
            <p class="special">尚無完整得票資料</p>
            <p class="answer-note">資料不足，暫不計算票差。</p>
          {:else}
            {#if result.kind === 'single'}
              <p class="answer-label">這場只有一位候選人</p>
              <p class="special">同額競選</p>
              <p class="answer-note">無對手票差，不以 0 票差表示。</p>
            {:else}
              <p class="answer-label">{result.kind === 'tie' ? '前兩名同票' : '前兩名相差'}</p>
              <p class="margin-number"><strong>{fmt(result.votes)}</strong><span>票</span></p>
              <p class="answer-note">得票率差 {result.points.toFixed(2)} 個百分點{result.kind === 'tie' ? ' · 不以票差判定當選者' : ''}</p>
            {/if}
            <ol class="contenders" aria-label="得票最高的候選人">
              {#each result.candidates.slice(0, 2) as c}
                <li>
                  <div class="candidate-line"><span><strong>{c.name}</strong><small>{c.partyName}</small></span><span class="vote-count">{fmt(c.votes)} <small>票</small></span></div>
                  <div class="vote-track" aria-hidden="true"><span style:width={`${c.votes / result.validVotes * 100}%`}></span></div>
                </li>
              {/each}
            </ol>
            <details class="full-result">
              <summary>看完整得票 <span aria-hidden="true">＋</span></summary>
              <div class="vote-table-wrap">
                <table>
                  <caption class="sr-only">{year} {selected.place}長選舉完整得票</caption>
                  <thead><tr><th scope="col">候選人</th><th scope="col">得票數</th><th scope="col">得票率</th></tr></thead>
                  <tbody>{#each result.candidates as c}<tr><th scope="row">{c.name}{#if c.elected}<small>當選</small>{/if}</th><td>{fmt(c.votes)}</td><td>{percent(c.votes, result.validVotes)}%</td></tr>{/each}</tbody>
                </table>
              </div>
              <p class="method">有效票 {fmt(result.validVotes)} 票。票差＝最高票－次高票；得票率差＝票差 ÷ 全部有效票。當選標記依該次選舉資料，不表示目前在職。</p>
              <a class="map-link" href="/elections/2022/#election-map">探索 2022 選舉地圖 →</a>
            </details>
          {/if}
          <ShareActions title={`${year} ${selected.place}長選舉結果｜政治人物背景資料庫`} url={new URL(marginSharePath(countyCode, townCode), siteUrl).href} />
        </div>
      {:else}
        <div class="unrevealed">
          <span class="mystery" aria-hidden="true">？</span>
          <p>你熟悉的地方，<br /><strong>選情有多接近？</strong></p>
          <small>選好地區揭曉，或隨機看一場。</small>
        </div>
      {/if}
    {/key}
  </div>
  <p class="data-note">資料來源：中選會 {year} 地方公職人員選舉得票資料（含嘉義市長重行選舉）。票差描述該次結果，不是下屆選情預測。</p>
</section>

<style>
  .margin-feature { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:36px;row-gap:18px;border:1px solid var(--line-strong);margin:26px 0 0;padding:28px; }
  .margin-question,.margin-answer { min-width:0; }
  .eyebrow { display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--accent); }
  .eyebrow span { color:var(--muted);font-weight:400;letter-spacing:0; }
  h2 { font-size:clamp(28px,3.4vw,42px);font-weight:900;margin:0;line-height:1.22;letter-spacing:-.025em; }
  .intro { margin:10px 0 18px;color:var(--muted);font-size:13px; }
  .selects { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
  label { display:grid;gap:5px;font-size:12px;font-weight:700;min-width:0; }
  .actions { display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;margin-top:14px; }
  button { min-height:44px;cursor:pointer;border-radius:0;font-size:13px;font-weight:700; }
  button:disabled,select:disabled { opacity:.5;cursor:not-allowed; }
  .reveal { display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border:1px solid var(--block-bg);background:var(--block-bg);color:var(--block-fg); }
  .reveal:not(:disabled):hover { border-color:var(--accent); }
  .random { padding:0;background:transparent;color:var(--fg);border:0;text-decoration:underline;text-underline-offset:4px; }
  .random:hover,.map-link:hover { color:var(--accent); }
  .scope,.method,.data-note { color:var(--muted);font-size:11px;line-height:1.7; }
  .scope { margin:14px 0 0;max-width:38em; }
  .margin-answer { border-left:1px solid var(--line);padding-left:36px;display:flex;align-items:center; }
  .answer-content { width:100%;animation:reveal-in .25s ease-out; }
  .race-title { font-size:13px;font-weight:700;margin:0 0 12px; }
  .fallback-note { font-size:11px;color:var(--muted);margin:-6px 0 12px; }
  .answer-label { margin:0;font-size:12px; }
  .margin-number { display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin:0;line-height:1.15;color:var(--accent); }
  .margin-number strong { font:800 clamp(44px,5.5vw,72px)/1.15 var(--sans);letter-spacing:-.055em;font-variant-numeric:tabular-nums; }
  .margin-number > span { font-size:17px;font-weight:700; }
  .answer-note { margin:4px 0 16px;font-size:12px;color:var(--muted); }
  .special { font:900 30px/1.3 var(--serif);margin:8px 0;color:var(--accent); }
  .contenders { list-style:none;padding:0;margin:0;display:grid;gap:12px; }
  .candidate-line { display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:14px; }
  .candidate-line small { display:inline-block;margin-left:8px;font-size:11px;font-weight:400;color:var(--muted); }
  .vote-count { flex-shrink:0;font-variant-numeric:tabular-nums; }
  .vote-count small { margin-left:2px; }
  .vote-track { height:3px;background:var(--line);margin-top:5px; }
  .vote-track span { display:block;height:100%;background:var(--fg); }
  .full-result { margin-top:18px;font-size:12px; }
  summary { display:flex;justify-content:space-between;align-items:center;cursor:pointer;min-height:44px;border-top:1px solid var(--line);font-weight:700;list-style:none; }
  summary::-webkit-details-marker { display:none; }
  details[open] summary > span { transform:rotate(45deg); }
  table { width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums; }
  th,td { text-align:right;padding:6px 0;border-bottom:1px solid var(--line); }
  th:first-child { text-align:left; }
  tbody th small { display:inline-block;margin-left:6px;font-size:10px;font-weight:400;color:var(--muted); }
  .method { margin:10px 0; }
  .map-link { display:inline-flex;align-items:center;min-height:44px;text-decoration:underline;text-underline-offset:3px; }
  .unrevealed { width:100%;text-align:center;padding:14px; }
  .mystery { font:900 110px/1 var(--serif);color:var(--accent); }
  .unrevealed p { font-size:20px;line-height:1.5;margin:14px 0 6px;font-family:var(--serif); }
  .unrevealed small { font-size:12px;color:var(--muted); }
  .data-note { grid-column:1/-1;margin:0;padding-top:14px;border-top:1px solid var(--line); }
  .load-error { font-size:13px;color:var(--accent); }
  .load-error button { color:inherit;background:none;border:0;text-decoration:underline; }
  @keyframes reveal-in { from { opacity:0;transform:translateY(5px); } to { opacity:1;transform:none; } }
  @media (prefers-reduced-motion:reduce) { .answer-content { animation:none; } }
  @media(max-width:760px) {
    .margin-feature { grid-template-columns:1fr;padding:20px;gap:20px;margin-top:22px; }
    h2 br { display:none; }
    h2 { font-size:28px; }
    .margin-answer { border-left:0;border-top:1px solid var(--line);padding:20px 0 0; }
    .unrevealed { display:grid;grid-template-columns:60px 1fr;column-gap:14px;text-align:left;padding:0; }
    .mystery { font-size:64px;grid-row:1/3;align-self:center; }
    .unrevealed p { font-size:16px;margin:0; }
    .unrevealed small { margin-top:6px; }
    .margin-number strong { font-size:56px; }
    .candidate-line > span:first-child { display:flex;flex-wrap:wrap;gap:0 8px; }
    .candidate-line small { margin-left:0; }
    .data-note { padding-top:12px; }
  }
</style>
