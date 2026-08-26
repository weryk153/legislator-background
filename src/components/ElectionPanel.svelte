<!-- 地圖與側欄的容器。兩者共享選取狀態（點選/移入的行政區與所在層），另外還擁有
     「目前檢視哪個年份」這個新狀態（見 src/lib/electionYears.ts）。
     標題欄＋側欄＋年份切換器都是浮在地圖上的面板（而非上下堆疊／左右並排的一般
     文件流），模擬天下雜誌選情地圖的滿版出血＋浮動控制項效果：.stage 用
     position:relative 填滿外層 .map-stage（elections.astro 已經算好
     calc(100dvh - 頁首高度)），標題欄疊在左上角、側欄疊在右上角、年份切換器疊在
     底部置中；窄螢幕則三者都退回一般文件流，各自佔滿寬度，避免在小螢幕上把地圖
     擠壓成一條縫，也避免多層浮層互相打架。 -->
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
  // 分頁選了哪一年無關——2022 分頁下方那行小字倒數，本來就是在提醒「下一屆選舉
  // 快到了」，不是在講 2022 本身。upcoming 分頁的大字倒數也是同一個數字，只是
  // 換了排版。日後若同時存在多筆 upcoming（例如排了兩屆以後的選舉），這裡要改成
  // 依 current 或依時間排序取用；今天只有一筆，先用「找到的第一筆 upcoming」。
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

  // 年份切換器的鍵盤操作：左右鍵在年份之間移動並直接切換（ARIA tablist 的
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
  // 年份整張地圖是單一中性色，沒有版圖可列，不顯示圖例。
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
  <header class="title-float">
    <h1>2026 九合一選舉</h1>

    <!-- 當前檢視的年份：襯線體大字。地圖畫的是哪一年的結果，必須跟上面「2026
         九合一選舉」這個頁面主題標題一樣顯眼，不能只靠下面那行小字澄清
         ——這正是這一輪要修的誤讀風險。 -->
    <p class="year-current">
      <span class="num">{selectedYear}</span>
      <span class="sub">{current.status === 'done' ? current.electionName : '選舉尚未舉行'}</span>
    </p>

    {#if upcoming}
      <!-- 尚未舉行：投票日與倒數放大成視覺重點，取代原本的小字倒數與年度標示
           ——那段年度標示講的是「地圖畫的是 2022 年」，切到這個分頁後不適用。 -->
      <div class="upcoming-block">
        <p class="upcoming-date">投票日 2026 年 11 月 28 日</p>
        {#if daysToNext !== null && daysToNext > 0}
          <p class="upcoming-days"><span class="num">{daysToNext}</span> 天後開票</p>
        {/if}
        <p class="upcoming-note">
          開票日起本頁將更新為 2026 年結果。地圖上的行政區界線仍是既有資料，可照常
          點選、下鑽、縮放，但目前沒有選舉結果可顯示。
        </p>
      </div>
    {:else}
      <p class="countdown">
        投票日 2026 年 11 月 28 日{#if daysToNext !== null && daysToNext > 0}，尚餘 {daysToNext} 天{/if}
      </p>

      {#if legend.length}
        <ul class="legend">
          {#each legend as l (l.key)}
            <li>
              <span class="swatch {l.kind}" style={l.kind === 'party' ? `background: var(${l.cssVar})` : ''}></span>
              {l.label}
            </li>
          {/each}
        </ul>
      {/if}

      <!-- 年度標示：文字內容一字不改，只調整了位置（原本在標題正下方，現在挪到
           圖例之後）與外距。 -->
      <p class="notice">
        以下為<strong>西元 {current.year} 年（{current.electionName}）</strong>的結果與其後補選之現況，
        <strong>非 2026 年選情</strong>。候選人名單須待中選會於登記期後公告，屆時另行補上。
      </p>
    {/if}
  </header>

  <div class="map-region">
    <ElectionMap neutral={upcoming} onSelect={(a, l) => { area = a; layer = l; }} />
  </div>

  <!-- 年份切換器：置於地圖區塊底部置中。用 ARIA tablist——選一個年份等於切換整個
       「地圖＋側欄」的內容，不是在填一份表單，tab 的語意比 radiogroup 更貼切。
       資料來源是 years（見 src/lib/electionYears.ts），日後加年份只改那邊。 -->
  <nav class="year-switch" role="tablist" aria-label="選舉年份">
    {#each years as y, i (y.year)}
      {#if i > 0}<span class="sep" aria-hidden="true"></span>{/if}
      <button type="button" role="tab" aria-selected={selectedYear === y.year}
        tabindex={selectedYear === y.year ? 0 : -1}
        bind:this={yearBtns[i]}
        onclick={() => selectYear(y.year)}
        onkeydown={(e) => onSwitchKey(e, i)}>
        {y.year}
      </button>
    {/each}
  </nav>

  <aside class="sidebar-float">
    <ElectionSidebar {area} {layer} {upcoming} />
  </aside>
</div>

<style>
  .stage { position: relative; height: 100%; }
  .map-region { width: 100%; height: 100%; }

  .title-float,
  .sidebar-float {
    position: absolute;
    top: 2rem;
    width: min(340px, 32vw);
    max-height: calc(100% - 4rem);
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    box-shadow: 0 12px 32px rgba(0, 0, 0, .2);
    padding: 1rem 1.25rem;
    z-index: 10;
  }

  .title-float { left: 2rem; width: min(320px, 26vw); }
  .sidebar-float { right: 2rem; }

  /* 標題維持原本字級，不縮小；只調整外距，讓它在有邊框的浮動欄裡不會太擠。 */
  .title-float h1 { margin: 0 0 .3rem; }

  /* 當前檢視年份：襯線體大字，是這個欄位裡除了 h1 之外最顯眼的東西。 */
  .year-current { display: flex; align-items: baseline; gap: .5rem; margin: .5rem 0 0; }
  .year-current .num { font-family: var(--serif); font-size: var(--t-xl); line-height: 1; color: var(--fg); }
  .year-current .sub { font-size: var(--t-xs); color: var(--muted); }

  .title-float .countdown { color: var(--muted); font-size: var(--t-sm); margin: .5rem 0 0; }

  /* 圖例：小色塊＋--t-xs 字級＋--muted 色，不搶主體。跟倒數之間一條分隔線隔開。 */
  .legend {
    list-style: none; display: flex; flex-wrap: wrap; gap: .3rem .9rem;
    margin: .65rem 0 0; padding: .55rem 0 0; border-top: 1px solid var(--line);
    font-size: var(--t-xs); color: var(--muted);
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

  /* 年度標示：內容一字不改，但視覺降級——用小字級、低調色、跟上面之間一條分隔線
     隔開，讀得到、不搶標題的焦點。 */
  .title-float .notice {
    color: var(--faint);
    font-size: var(--t-xs);
    line-height: 1.6;
    margin: .75rem 0 0;
    padding-top: .6rem;
    border-top: 1px solid var(--line);
  }
  .title-float .notice strong { color: var(--muted); font-weight: 600; }

  /* upcoming（尚未舉行）：投票日與倒數是這個分頁裡最重要的資訊，放大處理。 */
  .upcoming-block { margin-top: .75rem; padding-top: .65rem; border-top: 1px solid var(--line); }
  .upcoming-date { font-family: var(--serif); font-size: var(--t-md); color: var(--fg); margin: 0; }
  .upcoming-days { margin: .3rem 0 0; color: var(--accent); }
  .upcoming-days .num { font-family: var(--serif); font-size: var(--t-lg); font-variant-numeric: tabular-nums; }
  .upcoming-note { color: var(--muted); font-size: var(--t-xs); line-height: 1.6; margin: .6rem 0 0; }

  /* 年份切換器：襯線體數字、細線分隔、選中朱紅底線、未選中 --muted。克制、
     編輯感——不是參考站那種膠囊按鈕。置於地圖底部置中，浮在地圖上方。 */
  .year-switch {
    position: absolute; left: 50%; bottom: 1.25rem; transform: translateX(-50%);
    z-index: 6; display: flex; align-items: stretch;
    background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius);
    padding: .3rem .5rem; box-shadow: 0 4px 14px rgba(0, 0, 0, .16);
  }
  .year-switch button {
    font-family: var(--serif); font-size: var(--t-md); background: none; border: none; cursor: pointer;
    color: var(--muted); padding: .2rem .7rem; border-bottom: 2px solid transparent;
    font-variant-numeric: tabular-nums; line-height: 1.4;
  }
  .year-switch button[aria-selected="true"] { color: var(--fg); border-bottom-color: var(--accent); }
  .year-switch .sep { width: 1px; align-self: stretch; background: var(--line); margin: .2rem .1rem; }

  /* 900px 是這一輪的新斷點（原本 720px）：兩側浮層加起來比單側寬得多，720px
     會擠爆，故放寬。低於此寬度時標題欄／側欄／年份切換器都退回一般文件流，
     各佔滿寬。斷點跟 elections.astro 的 .map-stage 一致，必須同步改。 */
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
    .year-switch {
      position: static; transform: none; margin: .75rem auto 0; width: fit-content;
    }
  }
</style>
