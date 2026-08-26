<!-- 地圖與側欄的容器。兩者共享選取狀態（點選/移入的行政區與所在層），另外還擁有
     「目前檢視哪個年份」這個新狀態（見 src/lib/electionYears.ts）。
     標題欄＋側欄都是浮在地圖上的面板（而非上下堆疊／左右並排的一般文件流），模擬
     報紙特輯的滿版出血＋浮動控制項效果：.stage 用 position:relative 填滿外層
     .map-stage（elections.astro 已經算好 calc(100dvh - 頁首高度)），左欄報頭疊在
     左上角、側欄疊在右上角；窄螢幕則兩者都退回一般文件流，各自佔滿寬度，避免在
     小螢幕上把地圖擠壓成一條縫，也避免多層浮層互相打架。

     左欄報頭（.masthead）是報紙的報頭結構，由上而下：眉題→粗線→大標→髮絲線→
     版次（原本浮在地圖底部的年份切換器，現在當成「本期版次」移到這裡，見下方
     .edition-* 樣式）→髮絲線→導言（年度標示／尚未舉行說明）→髮絲線→圖例。年份
     只在這裡出現一次，不再與地圖下緣的浮動切換器互相打架。 -->
<script lang="ts">
  import ElectionMap from './ElectionMap.svelte';
  import ElectionSidebar from './ElectionSidebar.svelte';
  import { PARTY_VAR, isUnassignedVillage, type MapArea, type MapLayer } from '../lib/mapTypes';
  import type { ElectionYearConfig } from '../lib/electionYears';

  let { years }: { years: ElectionYearConfig[] } = $props();

  let area = $state<MapArea | null>(null);
  let layer = $state<MapLayer | null>(null);

  // 預設選中「已有結果」的那個年份（目前只有 2022）。找不到就退回清單第一筆
  // ——理論上不會發生（buildYears 至少會給一筆 done），純屬防禦。
  const DEFAULT_YEAR = years.find((y) => y.status === 'done')?.year ?? years[0].year;
  let selectedYear = $state(DEFAULT_YEAR);
  const current = $derived(years.find((y) => y.year === selectedYear) ?? years[0]);
  const upcoming = $derived(current.status === 'upcoming');

  // 「投票日與倒數」永遠指向最近一筆尚未舉行的選舉（目前只有 2026 這筆），跟目前
  // 選了哪個版次無關——不論看 2022 版還是 2026 版，這行 dateline 講的都是「下一屆
  // 選舉快到了」，不是在講目前選取的那個版次本身。日後若同時存在多筆 upcoming
  // （例如排了兩屆以後的選舉），這裡要改成依 current 或依時間排序取用；今天只有
  // 一筆，先用「找到的第一筆 upcoming」。
  const nextElection = $derived(years.find((y) => y.status === 'upcoming') ?? null);
  const daysToNext = $derived.by(() => {
    const v = nextElection?.voteDate;
    if (!v) return null;
    return Math.ceil((new Date(`${v}T00:00:00+08:00`).getTime() - Date.now()) / 86400000);
  });

  let yearBtns: HTMLButtonElement[] = [];

  function selectYear(y: number) {
    selectedYear = y;
  }

  // 版次選擇器的鍵盤操作：左右鍵在版次之間移動並直接切換（ARIA tablist 的
  // automatic activation 模式，跟原生分頁一致），Home/End 跳頭尾。切換的同時要把
  // DOM focus 也移過去（roving tabindex），否則鍵盤使用者的焦點會停在舊按鈕上、
  // 但那顆按鈕已經變成 tabindex="-1"，下一次 Tab 會跳出這個元件。
  function onSwitchKey(e: KeyboardEvent, i: number) {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % years.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + years.length) % years.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = years.length - 1;
    if (next < 0) return;
    e.preventDefault();
    selectedYear = years[next].year;
    yearBtns[next]?.focus();
  }

  // 圖例：畫面上實際出現的政黨色＋非政黨狀態，隨目前對焦的圖層（layer）即時更新
  // ——下鑽到村里層時，出現的政黨可能跟縣市層不同，不固定列七個政黨。upcoming
  // 版次整張地圖是單一中性色，沒有版圖可列，不顯示圖例。
  interface LegendEntry { key: string; label: string; kind: 'party' | 'appointed' | 'pending' | 'nodata'; cssVar?: string }
  const legend = $derived.by((): LegendEntry[] => {
    if (upcoming || !layer) return [];
    const parties = new Map<string, string>();
    let appointed = false, pending = false, nodata = false;
    for (const a of layer.areas) {
      if (isUnassignedVillage(a)) continue; // 未編定村里不是選舉狀態，不進圖例
      if (a.chiefOffice === 'appointed') { appointed = true; continue; }
      if (a.chief) { parties.set(a.chief.partyCode, a.chief.partyName); continue; }
      if (a.chiefPendingDraw) { pending = true; continue; }
      nodata = true;
    }
    const entries: LegendEntry[] = [...parties.entries()].map(([code, name]) => ({
      key: `party-${code}`, label: name, kind: 'party', cssVar: PARTY_VAR[code] ?? '--party-other',
    }));
    if (appointed) entries.push({ key: 'appointed', label: '官派（無選舉）', kind: 'appointed' });
    if (pending) entries.push({ key: 'pending', label: '得票相同待抽籤', kind: 'pending' });
    if (nodata) entries.push({ key: 'nodata', label: '本站無資料', kind: 'nodata' });
    return entries;
  });
</script>

<div class="stage">
  <header class="title-float masthead">
    <p class="kicker">選舉特輯</p>
    <hr class="rule-thick" />
    <!-- 報頭大標固定斷成「2026」＋「九合一選舉」兩行，語意接縫上的手動分行——不靠
         瀏覽器自動換行（欄寬夠窄時會斷出孤字「舉」單獨一行）。第二行加 nowrap，
         五個漢字在目前欄寬（含 900px 斷點以下的全寬版）都放得下，不會再被逼著
         二次換行。 -->
    <h1><span class="masthead-year">2026</span><span class="masthead-theme">九合一選舉</span></h1>
    <hr class="rule-hair" />

    <!-- 版次：原本浮在地圖底部、壓住台灣南端的年份切換器，現在當成報頭裡的
         「本期版次」。年份只在這裡出現一次，不再跟地圖上方的頁面主題標題互相
         打架。用 ARIA tablist——選一個版次等於切換整個「地圖＋側欄」的內容，不是
         在填一份表單，tab 的語意比 radiogroup 更貼切。資料來源是 years（見
         src/lib/electionYears.ts），日後加版次只改那邊。 -->
    <div class="edition">
      <span class="edition-label" id="edition-label">本期版次</span>
      <div class="edition-tabs" role="tablist" aria-label="選舉年份">
        {#each years as y, i (y.year)}
          {#if i > 0}<span class="tab-sep" aria-hidden="true"></span>{/if}
          <button type="button" role="tab" aria-selected={selectedYear === y.year}
            tabindex={selectedYear === y.year ? 0 : -1}
            bind:this={yearBtns[i]}
            onclick={() => selectYear(y.year)}
            onkeydown={(e) => onSwitchKey(e, i)}>
            {y.year}
          </button>
        {/each}
      </div>
    </div>
    <p class="edition-sub">{current.status === 'done' ? current.electionName : '選舉尚未舉行'}</p>
    <p class="dateline">
      投票日 2026 年 11 月 28 日{#if daysToNext !== null && daysToNext > 0}，尚餘 {daysToNext} 天{/if}
    </p>
    <hr class="rule-hair" />

    {#if upcoming}
      <!-- 尚未舉行：說明地圖界線仍是既有資料、可照常操作，只是沒有結果可顯示
           ——取代原本「投票日與倒數」放大處理的做法，因為那個資訊現在已經在上面
           的 dateline 出現過一次，不必在這裡重複放大。 -->
      <p class="lede">
        開票日起本頁將更新為 2026 年結果。地圖上的行政區界線仍是既有資料，可照常
        點選、下鑽、縮放，但目前沒有選舉結果可顯示。
      </p>
    {:else}
      <!-- 導言／年度標示：文字內容一字不改，只調整了位置與外距。 -->
      <p class="notice">
        以下為<strong>西元 {current.year} 年（{current.electionName}）</strong>的結果與其後補選之現況，
        <strong>非 2026 年選情</strong>。候選人名單須待中選會於登記期後公告，屆時另行補上。
      </p>

      {#if legend.length}
        <hr class="rule-hair" />
        <ul class="legend">
          {#each legend as l (l.key)}
            <li>
              <span class="swatch {l.kind}" style={l.kind === 'party' ? `background: var(${l.cssVar})` : ''}></span>
              {l.label}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </header>

  <div class="map-region">
    <ElectionMap neutral={upcoming} onSelect={(a, l) => { area = a; layer = l; }} />
  </div>

  <aside class="sidebar-float">
    <ElectionSidebar {area} {layer} {upcoming} />
  </aside>
</div>

<style>
  .stage { position: relative; height: 100%; }
  .map-region { width: 100%; height: 100%; }

  /* 面板：報紙的語言是線，不是浮起來的卡片——去掉圓角與陰影，改用一圈髮絲線邊框
     壓在地圖上，底色維持 --surface 讓文字讀得清楚，但不再有「浮起來」的視覺暗示。 */
  .title-float,
  .sidebar-float {
    position: absolute;
    top: 2rem;
    width: min(340px, 32vw);
    max-height: calc(100% - 4rem);
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 0;
    box-shadow: none;
    padding: 1rem 1.25rem 1.1rem;
    z-index: 10;
  }

  .title-float { left: 2rem; width: min(320px, 26vw); padding-top: .85rem; }
  .sidebar-float { right: 2rem; }

  /* 髮絲線／粗線分隔——報頭各段之間的分節線，取代原本卡片式的留白分段。 */
  .masthead hr { border: none; margin: .7rem 0; }
  .masthead .rule-hair { border-top: 1px solid var(--line); }
  .masthead .rule-thick { border-top: 2px solid var(--line-strong); margin: .4rem 0 .55rem; }

  /* 眉題：本頁主題（報紙特輯的欄目名），比大標小很多、寬字距，讀起來是「欄目」
     不是「標題」——沿用全站既有的 .kicker 語彙（見 tokens.css），不再另外造字級。 */
  .masthead .kicker { margin: 0; }

  /* 大標：頁面主題，襯線體、全欄最大最重的字。固定拆成「2026」／「九合一選舉」
     兩行（見上方標記），而不是讓瀏覽器對一整串文字自動換行——欄寬夠窄時自動換行
     會斷出孤字（單獨一個「舉」留在第二行），這是報紙排版不能出的錯。兩行各自
     display:block 成一行，第二行加 white-space: nowrap 防止五個漢字本身又被
     再次擠斷；兩行字級相同，用行距與些微字距做出「刻意的兩行報頭」而非「被擠斷」
     的觀感。 */
  .masthead h1 {
    font-size: var(--t-xl); font-weight: 700; margin: 0; line-height: 1.2;
  }
  .masthead h1 span { display: block; }
  .masthead h1 .masthead-theme { white-space: nowrap; letter-spacing: .02em; margin-top: .05em; }

  /* 版次：這是「兩個版次擇一」的選擇器，不是兩個並列的標題——用字級與粗細的
     落差＋accent 底線做出「選中／未選中」的區分，兩個版次之間再用一條垂直髮絲線
     隔開，讀者一眼就能看出這是同一組控制項而非兩則資訊。 */
  .edition { display: flex; align-items: baseline; flex-wrap: wrap; gap: .6rem; margin-top: .1rem; }
  .edition-label {
    font-family: var(--sans); font-size: var(--t-xs); letter-spacing: .08em;
    color: var(--faint); white-space: nowrap;
  }
  .edition-tabs { display: flex; align-items: baseline; }
  .edition-tabs button {
    font-family: var(--serif); background: none; border: none; cursor: pointer;
    color: var(--muted); font-size: var(--t-sm); font-weight: 600;
    padding: 0 .5rem .2rem; border-bottom: 2px solid transparent;
    font-variant-numeric: tabular-nums; line-height: 1.3; transition: color var(--ease);
  }
  .edition-tabs button[aria-selected="true"] {
    color: var(--fg); font-size: var(--t-lg); font-weight: 700; border-bottom-color: var(--accent);
  }
  .edition-tabs .tab-sep { width: 1px; align-self: stretch; background: var(--line); margin: 0 .05rem; }

  /* 版次的副標（該屆選舉正式名稱）與 dateline：都是小字級、輔助資訊，不與上面的
     版次數字搶焦點。 */
  .edition-sub { font-family: var(--sans); font-size: var(--t-xs); color: var(--muted); margin: .3rem 0 0; }
  .dateline { font-family: var(--sans); font-size: var(--t-xs); color: var(--muted); margin: .3rem 0 0; }

  /* upcoming（尚未舉行）的導言／年度標示：都用同一套小字級、克制色的排版，內容
     一字不改，只是視覺上不再搶大標與版次的焦點。 */
  .lede,
  .notice { color: var(--faint); font-size: var(--t-xs); line-height: 1.6; margin: 0; }
  .notice strong { color: var(--muted); font-weight: 600; }

  /* 圖例：小色塊＋--t-xs 字級＋--muted 色，不搶主體。 */
  .legend {
    list-style: none; display: flex; flex-wrap: wrap; gap: .3rem .9rem;
    margin: 0; padding: 0; font-size: var(--t-xs); color: var(--muted);
  }
  .legend li { display: flex; align-items: center; gap: .35rem; }
  .legend .swatch {
    width: .65rem; height: .65rem; border-radius: 2px; flex: none;
    border: 1px solid var(--line-strong);
  }
  /* 官派區的圖例色塊也用斜線紋理，跟地圖上的畫法一致，讀者才認得出是同一件事。 */
  .legend .swatch.appointed {
    background-image: repeating-linear-gradient(45deg,
      var(--map-appointed-line) 0 1px, var(--map-appointed-bg) 1px 4px);
  }
  .legend .swatch.pending { background: var(--map-pending); }
  .legend .swatch.nodata { background: var(--map-nodata); }

  /* 900px 是這一輪的新斷點（原本 720px）：兩側浮層加起來比單側寬得多，720px
     會擠爆，故放寬。低於此寬度時標題欄／側欄都退回一般文件流，各佔滿寬。斷點跟
     elections.astro 的 .map-stage 一致，必須同步改。 */
  @media (max-width: 900px) {
    .map-region { height: 60vh; }
    .title-float,
    .sidebar-float {
      position: static;
      width: 100%;
      max-height: none;
      overflow-y: visible;
      margin-top: 1rem;
      box-shadow: none;
    }
    .title-float { margin-top: 0; margin-bottom: 1rem; }
  }
</style>
