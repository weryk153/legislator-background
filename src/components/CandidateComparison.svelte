<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ShareActions from './ShareActions.svelte';
  import { MAX_COMPARISON, readComparison, comparisonUrl, toggleComparison, swapComparison, readComparisonTopic, type ComparisonTopic, type ComparisonCandidate } from '../lib/candidateComparison';
  import type { Source } from '../lib/types';
  import { groupCareerSources } from '../lib/careerCategory';
  let { candidates, canonical, heading }: { candidates: ComparisonCandidate[]; canonical: string; heading: string } = $props();
  let ids = $state<string[]>([]);
  let ready = $state(false);
  let selecting = $state(false);
  let notice = $state('');
  let topic = $state<ComparisonTopic>('education');
  const selected = $derived(ids.flatMap(id => candidates.find(c => c.id === id) ?? []));
  const shareUrl = $derived(comparisonUrl(canonical, ids, topic));
  const money = (value: number) => Number.isFinite(value) ? `NT$ ${value.toLocaleString('zh-TW')}` : '金額待核對';
  const groups = [{ id: 'education', label: '學歷', short: '學歷' }, { id: 'careers', label: '經歷', short: '經歷' }, { id: 'policies', label: '2026 政見', short: '政見' }, { id: 'donations', label: '政治獻金', short: '獻金' }] as const;
  const policyTypes = { news: '新聞報導', campaign: '候選人／政黨競選資訊', gazette: '選舉公報', civic: '公民團體公開紀錄' };
  onMount(() => {
    const restore = () => {
      const state = readComparison(window.location.search, candidates);
      ids = state.ids;
      selecting = ids.length === 1;
      topic = readComparisonTopic(window.location.search);
      notice = state.adjusted ? '連結含重複、不屬於本區或超過 4 人的選擇，已僅保留本區可比較的人物。' : '';
      if (state.adjusted) {
        const url = new URL(window.location.href);
        url.searchParams.delete('compare');
        ids.forEach(id => url.searchParams.append('compare', id));
        window.history.replaceState(window.history.state, '', url);
      }
    };
    restore(); ready = true;
    // The shared result does not exist in static HTML until URL state is restored.
    void tick().then(() => {
      const target = window.location.hash.slice(1);
      if (target === 'comparison-results' || groups.some(group => `comparison-${group.id}` === target)) {
        const section = document.getElementById(target);
        const visible = section && section.getClientRects().length > 0;
        (visible ? section : document.getElementById(ids.length >= 2 ? 'comparison-results' : 'compare'))?.scrollIntoView();
      }
    });
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  });
  async function showComparison() {
    if (ids.length < 2) return;
    selecting = false;
    await tick();
    document.getElementById('comparison-results')?.focus({ preventScroll: true });
    document.getElementById('comparison-results')?.scrollIntoView({ block: 'start' });
  }
  async function finishComparison() {
    update([], 'education');
    selecting = false;
    await tick();
    document.getElementById('comparison-entry')?.focus();
  }
  async function changeMobile(next: string[], nextTopic: ComparisonTopic = topic) {
    update(next, nextTopic);
    await tick();
    // A shorter section must not leave the reader stranded in the roster below.
    document.querySelector('.mobile-comparison')?.scrollIntoView({ block: 'start' });
  }
  function update(next: string[], nextTopic: ComparisonTopic = topic) {
    ids = next; topic = nextTopic; notice = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('compare');
    ids.forEach(id => url.searchParams.append('compare', id));
    url.searchParams.delete('topic');
    if (ids.length >= 2 && topic !== 'education') url.searchParams.set('topic', topic);
    // Keep scroll position when changing a checkbox; only the explicit anchor jumps.
    if (ids.length < 2 && url.hash.startsWith('#comparison-')) url.hash = 'compare';
    window.history.pushState(window.history.state, '', url);
  }
</script>

{#snippet sourceLink(source: Source)}
  <p class="source"><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>{#if source.retrievedAt}<span>收錄／核對 {source.retrievedAt}</span>{/if}</p>
{/snippet}

{#snippet educationContent(person: ComparisonCandidate)}
              {#if person.education.length}{#each person.education as record (record.id)}
                <div class="record"><ul>{#each record.items as item}<li>{item}</li>{/each}</ul>
                  {#if record.sourceYear}<p class="meta">{record.sourceYear} 年資料</p>{/if}
                </div>
              {/each}{:else}<p class="empty">尚未收錄可核對的學歷資料。</p>{/if}
{/snippet}

{#snippet careersContent(person: ComparisonCandidate)}
              {#if person.careers.length}
                {#each person.careers.slice(0, 3) as career}<div class="record"><p>{career.text}</p></div>{/each}
                {#if person.careers.length > 3}<details><summary>展開其餘 {person.careers.length - 3} 項經歷</summary>
                  {#each person.careers.slice(3) as career}<div class="record"><p>{career.text}</p></div>{/each}
                </details>{/if}
              {:else}<p class="empty">尚未收錄可核對的經歷資料。</p>{/if}
{/snippet}

{#snippet policiesContent(person: ComparisonCandidate)}
              {#if person.policies.length}{#each person.policies as record (record.id)}
                <div class="record"><h5>{record.title}</h5><p class="meta">發表：{record.announcedOn ?? '來源未載明確日期'}・{policyTypes[record.source.type]}</p>
                  <ul>{#each record.proposals as proposal}<li><strong>{proposal.topic}</strong>：{proposal.summary}</li>{/each}</ul>
                </div>
              {/each}{:else}<p class="empty">尚未收錄這位候選人的 2026 政見，不代表尚未發表。</p>{/if}
{/snippet}

{#snippet donationsContent(person: ComparisonCandidate)}
              {#if person.donations.length}{#each person.donations as report (report.id)}
                <div class="record"><h5>{report.electionName}</h5><p class="meta">申報別：{report.reportSeq || '來源未載明'}</p>
                  <dl><dt>收入總額</dt><dd>{money(report.totalIncome)}</dd><dt>支出總額</dt><dd>{money(report.totalExpense)}</dd></dl>
                </div>
              {/each}{:else}<p class="empty">本站尚未取得其政治獻金申報資料，不代表收入或支出為零。</p>{/if}
{/snippet}

<div id="compare" class="compare">
  <div class="roster-toolbar">
    <h2 id="candidates-title">本區候選人 <span>{candidates.length} 人</span></h2>
    {#if candidates.length >= 2}
      <div class="toolbar-actions">
        {#if ids.length > 0 && !selecting}<button class="end-comparison" type="button" onclick={finishComparison}>結束比較</button>{/if}
        <button id="comparison-entry" class="comparison-entry" type="button" disabled={!ready} aria-expanded={selecting} aria-controls="comparison-picker" onclick={() => selecting = !selecting}>
          {#if !selecting}<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="5" height="11" stroke="currentColor" /><rect x="9.5" y="2.5" width="5" height="11" stroke="currentColor" /></svg>{/if}
          {selecting ? '收起選單' : selected.length >= 2 ? '更換人物' : '比較候選人'}
        </button>
      </div>
    {/if}
  </div>
  {#if candidates.length < 2}
    <p class="intro">本區名冊目前共 {candidates.length} 人，不足 2 人，尚無法進行同區比較。可閱讀下方名單與人物資料。</p>
  {:else}
  <noscript><p>候選人比較需要啟用 JavaScript；仍可閱讀下方名單及完整人物頁。</p></noscript>
  <div id="comparison-picker" class="comparison-picker" hidden={!selecting}>
  <fieldset>
    <legend>選擇 2～4 位候選人</legend>
    <div class="choices">
      {#each candidates as person (person.id)}
        <label class:chosen={ids.includes(person.id)} class:limited={!ids.includes(person.id) && ids.length >= MAX_COMPARISON}>
          <input type="checkbox" aria-label={`比較 ${person.name}`} checked={ids.includes(person.id)}
            disabled={!ready || (!ids.includes(person.id) && ids.length >= MAX_COMPARISON)}
            onchange={() => update(toggleComparison(ids, person.id))} />
          <span><strong>{person.name}</strong><small>{person.number !== null ? `${person.number} 號・` : ''}{person.party}</small></span>
        </label>
      {/each}
    </div>
  </fieldset>
  <div class="selection-bar">
    <p role="status">已選 {ids.length} 人{ids.length === 1 ? '，再選 1 人即可比較' : ids.length === MAX_COMPARISON ? '（已達上限）' : ''}</p>
    <div class="actions">{#if ids.length > 0}<button type="button" onclick={() => update([])}>清除選擇</button>{/if}
      <button class="primary" type="button" disabled={ids.length < 2} onclick={showComparison}>開始比較{ids.length >= 2 ? ` ${ids.length} 人` : ''} →</button></div>
  </div>
  </div>
  {/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  {#if selected.length >= 2 && !selecting}
    <div id="comparison-results" class="results" tabindex="-1">
      <div class="result-head"><div><p class="eyebrow">{heading}</p><h3>候選人比較 <span>{selected.length} 人</span></h3></div>
        <ShareActions title={`${heading}｜${selected.map(c => c.name).join('、')}比較`} url={shareUrl} />
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable desktop table must be keyboard focusable.) -->
      <div class="table-scroll" tabindex="0" role="region" aria-label="候選人比較表，可上下及左右捲動">
        <table style={`--count:${selected.length}`}>
          <caption class="sr-only">{heading}：{selected.map(c => c.name).join('、')}的公開資料比較</caption>
          <colgroup><col class="row-label" />{#each selected as person (person.id)}<col />{/each}</colgroup>
          <thead><tr><th scope="col" class="corner">比較項目</th>
            {#each selected as person (person.id)}
              <th scope="col">
                <div class="identity">
                  {#if person.photoUrl}<img src={person.photoUrl} alt={`${person.name}照片`} width="76" height="96" loading="lazy" />
                  {:else}<div class="no-photo">照片<br />尚未收錄</div>{/if}
                  <div><h4>{#if person.slug}<a class="person-link" href={`/officials/${person.slug}/`} aria-label={`${person.name}完整人物資料`}>{person.name}</a>{:else}{person.name}{/if}</h4><p>{person.number !== null ? `${person.number} 號・` : ''}{person.party}</p></div>
                </div>
              </th>
            {/each}
          </tr></thead>
          <tbody>
            <tr><th scope="row">學歷</th>{#each selected as person (person.id)}<td>
              {@render educationContent(person)}
            </td>{/each}</tr>
            <tr><th scope="row">經歷</th>{#each selected as person (person.id)}<td>
              {@render careersContent(person)}
            </td>{/each}</tr>
            <tr><th scope="row">2026<br />政見</th>{#each selected as person (person.id)}<td>
              {@render policiesContent(person)}
            </td>{/each}</tr>
            <tr><th scope="row">政治獻金<small>按選舉及申報別</small></th>{#each selected as person (person.id)}<td>
              {@render donationsContent(person)}
            </td>{/each}</tr>
          </tbody>
        </table>
      </div>
      <div class="mobile-comparison">
        <nav class="topic-nav" aria-label="切換比較項目">
          {#each groups as group}<button type="button" id={`topic-${group.id}`} aria-pressed={topic === group.id} aria-controls="mobile-comparison-content" onclick={() => changeMobile(ids, group.id)}>{group.short}</button>{/each}
        </nav>
        <table class="mobile-table" aria-labelledby={`topic-${topic}`}>
          <caption class="sr-only">{heading}：{selected.slice(0, 2).map(c => c.name).join('與')}的{groups.find(g => g.id === topic)?.label}比較</caption>
          <thead><tr>
            {#each selected.slice(0, 2) as person, column (person.id)}
              <th scope="col">
                {#if selected.length > 2}<select aria-label={column === 0 ? '左欄比較人物' : '右欄比較人物'} value={person.id} onchange={event => changeMobile(swapComparison(ids, column as 0 | 1, event.currentTarget.value))}>
                  {#each selected as option}<option value={option.id} disabled={option.id === selected[1 - column].id}>{option.name}</option>{/each}
                </select>{/if}
                <div class="pair-identity">
                  {#if person.photoUrl}<img src={person.photoUrl} alt="" width="56" height="72" loading="lazy" />
                  {:else}<div class="mobile-no-photo">照片<br />待補</div>{/if}
                  <h4>{#if person.slug}<a class="person-link" href={`/officials/${person.slug}/`} aria-label={`${person.name}完整人物資料`}>{person.name}</a>{:else}{person.name}{/if}</h4><p>{person.number !== null ? `${person.number} 號・` : ''}{person.party}</p>
                </div>
              </th>
            {/each}
          </tr></thead>
          <tbody id="mobile-comparison-content"><tr>
            {#each selected.slice(0, 2) as person (person.id)}
              <td class="mobile-content">
                {#key topic}
                  {#if topic === 'education'}{@render educationContent(person)}
                  {:else if topic === 'careers'}{@render careersContent(person)}
                  {:else if topic === 'policies'}{@render policiesContent(person)}
                  {:else}{@render donationsContent(person)}{/if}
                {/key}
              </td>
            {/each}
          </tr></tbody>
        </table>
      </div>
      <details class="comparison-notes">
        <summary>資料來源與說明</summary>
        <div class="reference-list">
          {#each selected as person (person.id)}
            <section class="person-references" aria-label={`${person.name}資料來源`}>
              <h4>{person.name}</h4>
              {#if person.photoUrl && person.photoCredit}<p class="source">攝影：{person.photoCredit.author}・<a href={person.photoCredit.commonsUrl} target="_blank" rel="noopener noreferrer">{person.photoCredit.license} ↗</a></p>{/if}
              {#if person.education.length}
                <h5>學歷</h5>
                {#each person.education as record (record.id)}
                  <div class="reference-record">
                    {#if record.sourceYear}<p class="meta">{record.sourceYear} 年資料</p>{/if}
                    {#if record.note}<p class="note">{record.note}</p>{/if}
                    {@render sourceLink(record.source)}
                  </div>
                {/each}
              {/if}
              {#if person.careers.length}
                <h5>經歷</h5>
                {#each groupCareerSources(person.careers).sources as { source }}
                  {@const careers = person.careers.filter(career => career.source.url === source.url)}
                  <div class="reference-record career-reference-group">
                    <ul>{#each careers as career}<li>{career.text}</li>{/each}</ul>
                    {@render sourceLink({ ...source, retrievedAt: [...new Set(careers.map(career => career.source.retrievedAt).filter(Boolean))].join('、') })}
                  </div>
                {/each}
              {/if}
              {#if person.policies.length}
                <h5>2026 政見</h5>
                {#each person.policies as record (record.id)}
                  <div class="reference-record"><p>{record.title}</p>
                    <p class="source"><a href={record.source.url} target="_blank" rel="noopener noreferrer">{record.source.title} ↗</a><span>來源刊登 {record.source.publishedOn ?? '未載日期'}・本站核對 {record.reviewedOn}</span></p>
                  </div>
                {/each}
              {/if}
              {#if person.donations.length}
                <h5>政治獻金</h5>
                {#each person.donations as report (report.id)}
                  <div class="reference-record"><p>{report.electionName}・申報別：{report.reportSeq || '來源未載明'}</p>{@render sourceLink(report.source)}</div>
                {/each}
              {/if}
            </section>
          {/each}
        </div>
        <p class="note">資料來源及年份可能不同；未收錄不代表沒有。學歷保留來源原文，不判定最高學歷；經歷非完整任職清單。</p>
        <p class="note">政見是公開主張，不代表已實施或兌現。政治獻金依各選舉、申報別分列，不跨年度加總；金額請至原始申報來源核對。不做綜合評分。</p>
      </details>
    </div>
  {/if}
</div>

<style>
  .compare { border-top:3px solid var(--fg);margin:0 0 14px;scroll-margin-top:20px; }
  .roster-toolbar { display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:18px; }
  .roster-toolbar h2 { font:900 23px/1.5 var(--serif); }
  .roster-toolbar h2 span { font:400 13px var(--sans);color:var(--muted);white-space:nowrap;margin-left:8px; }
  .toolbar-actions { display:flex;gap:8px;align-items:center;flex:none; }
  .comparison-entry { gap:8px; }
  .end-comparison { border-color:transparent;padding:0 8px;color:var(--muted); }
  .comparison-picker { margin-top:20px;padding:20px;background:var(--surface);border:1px solid var(--line); }
  button:disabled { opacity:.45;cursor:default; }
  .eyebrow { font-size:12px;font-weight:700;color:var(--accent);letter-spacing:.08em;margin:0 0 8px; }
  h2 { font:900 clamp(24px,3vw,34px)/1.5 var(--serif);margin:0; }
  .intro { font-size:14px;line-height:1.8;color:var(--muted);margin:12px 0 22px; }
  fieldset { border:0;padding:0;margin:0;min-width:0; }
  legend { font-size:13px;font-weight:700;margin-bottom:10px; }
  .choices { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px; }
  label { display:flex;align-items:center;gap:12px;border:1px solid var(--line);padding:12px;min-height:64px;cursor:pointer; }
  label:hover { border-color:var(--fg); }label.chosen { border-color:var(--accent);background:var(--accent-wash); }
  label.limited { opacity:.55;cursor:default; }
  input { accent-color:var(--accent);width:18px;height:18px;flex:none;margin:0; }
  label span { min-width:0;overflow-wrap:anywhere; }label strong { display:block;font:700 19px/1.5 var(--serif); }label small { display:block;color:var(--muted);font-size:11px;margin-top:3px; }
  .selection-bar { display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 0 0; }
  .selection-bar p { font-size:13px;margin:0;line-height:1.8; }.actions { display:flex;gap:8px;flex:none; }
  button,.primary { display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:1px solid var(--control-border);padding:0 14px;background:var(--surface);color:var(--fg);font:400 13px var(--sans);cursor:pointer;text-decoration:none; }
  .primary { background:var(--block-bg);color:var(--block-fg);border-color:var(--block-bg); }
  :is(button,a,input,summary,.table-scroll):focus-visible { outline:2px solid var(--accent);outline-offset:3px; }
  .notice { color:var(--accent);font-size:13px;line-height:1.8; }
  .results { margin-top:32px;scroll-margin-top:20px; }
  .result-head { display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px; }
  h3 { font:900 24px var(--serif);margin:0; }h3 span { font:400 13px var(--sans);color:var(--muted);margin-left:12px; }
  .note,.meta,.empty { font-size:13px;color:var(--muted);line-height:1.8; }.empty { margin:0; }
  .table-scroll { overflow:auto;max-width:100%;max-height:78vh;border-top:2px solid var(--fg);border-bottom:1px solid var(--line); }
  table { border-collapse:separate;border-spacing:0;table-layout:fixed;width:100%;min-width:calc(112px + var(--count) * 240px);font-size:14px;line-height:1.8; }
  .row-label { width:112px; }
  th,td { vertical-align:top;text-align:left;padding:20px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);overflow-wrap:anywhere; }
  th:last-child,td:last-child { border-right:0; }tbody tr:last-child :is(td,th) { border-bottom:0; }
  thead th { position:sticky;top:0;z-index:2;background:var(--surface);font-weight:400;border-bottom:1px solid var(--control-border); }thead th.corner,tbody th { position:sticky;left:0;z-index:1;background:var(--surface);border-right:1px solid var(--control-border);font-weight:700; }
  thead th.corner { z-index:3; }tbody th { font-size:14px; }tbody th small { display:block;font-size:11px;color:var(--muted);font-weight:400;margin-top:6px; }
  .identity { display:flex;gap:14px;align-items:center; }.identity img { object-fit:contain;flex:none;background:var(--surface); }
  .no-photo { width:76px;height:96px;flex:none;background:var(--surface);border:1px solid var(--line);display:grid;place-content:center;text-align:center;font-size:12px;color:var(--muted); }
  h4 { font:900 25px/1.5 var(--serif);margin:0; }.identity p { font-size:12px;margin:6px 0 0; }
  .person-link { color:inherit;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:5px; }
  .person-link:hover { color:var(--accent); }
  .record + .record { border-top:1px solid var(--line);padding-top:14px;margin-top:14px; }.record > p:first-child { margin-top:0; }
  ul { padding-left:1.2em;margin:0; }li + li { margin-top:7px; }h5 { font-size:14px;margin:0;font-weight:700; }
  .source { font-size:11px;line-height:1.8;color:var(--muted);margin:8px 0 0; }.source a { text-decoration:underline;text-underline-offset:3px; }.source span { display:block; }
  summary { cursor:pointer;font-size:13px;text-decoration:underline;min-height:44px;align-content:center;color:var(--muted); }details { margin-top:10px; }
  dl { margin:14px 0; }dt { font-size:11px;color:var(--muted); }dd { font:600 19px/1.7 var(--sans);font-variant-numeric:tabular-nums;margin:0 0 10px; }
  .comparison-notes { margin-top:12px; }.sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap; }
  .reference-list { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin:12px 0 24px; }
  .person-references { min-width:0;overflow-wrap:anywhere; }
  .person-references h4 { font-size:19px; }.person-references h5 { margin-top:18px; }
  .reference-record { margin:10px 0;font-size:13px; }.reference-record > p { margin:4px 0; }
  .mobile-comparison { display:none; }
  @media(max-width:760px) {
    .table-scroll { display:none; }
    .mobile-comparison { display:block;min-width:0; }
    .roster-toolbar { flex-wrap:wrap;gap:10px; }
    .roster-toolbar h2 span { display:block;margin:4px 0 0;font-size:12px; }
    .toolbar-actions { margin-left:auto;gap:2px; }
    .comparison-entry { padding:0 10px; }
    .end-comparison { font-size:12px;padding:0 6px; }
    .comparison-picker { padding:14px 10px; }
    .topic-nav { position:sticky;top:0;z-index:4;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));background:var(--surface);border-top:2px solid var(--fg);border-bottom:1px solid var(--line); }
    .topic-nav button { min-height:48px;padding:0;border:0;font-size:14px;font-weight:700;color:var(--muted); }
    .topic-nav button[aria-pressed="true"] { color:var(--accent);box-shadow:inset 0 -3px var(--accent); }
    .mobile-table { width:100%;min-width:0;table-layout:fixed;border-top:0;border-bottom:1px solid var(--line); }
    .mobile-table th { width:50%;top:50px;padding:14px 10px; }
    .mobile-table td { padding:16px 10px; }
    .mobile-table select { width:100%;min-width:0;min-height:44px;border:1px solid var(--control-border);background:var(--surface);color:var(--fg);font:400 13px var(--sans);margin:0 0 12px;border-radius:0; }
    .mobile-table select:focus-visible { outline:2px solid var(--accent);outline-offset:2px; }
    .pair-identity { display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px; }
    .pair-identity img { object-fit:contain;flex:none; }
    .pair-identity h4 { font:900 21px/1.45 var(--serif);margin:0;max-width:100%;overflow-wrap:anywhere; }
    .pair-identity p { font-size:12px;color:var(--muted);margin:0; }
    .mobile-no-photo { width:56px;height:72px;display:grid;place-content:center;text-align:center;flex:none;border:1px solid var(--line);font-size:11px;color:var(--muted); }
    .mobile-content { font-size:14px;line-height:1.8; }
    .reference-list { grid-template-columns:minmax(0,1fr); }
    .mobile-content dd { font-size:clamp(14px,4.1vw,19px); }
  }
  @media(max-width:1000px) { .choices { grid-template-columns:repeat(3,minmax(0,1fr)); } }
  @media(max-width:600px) { .choices { grid-template-columns:repeat(2,minmax(0,1fr)); }label { padding:10px;gap:8px; }label strong { font-size:17px; }.selection-bar { align-items:flex-start;flex-direction:column; }.actions { width:100%; }.actions .primary { margin-left:auto; }th,td { padding:14px; }.row-label { width:88px; }table { min-width:calc(88px + var(--count) * 240px); }tbody th { font-size:13px; }.identity { gap:10px; }h4 { font-size:23px; } }
</style>
