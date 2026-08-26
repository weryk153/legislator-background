<!-- 地圖與側欄的容器。兩者共享選取狀態（點選/移入的行政區與所在層）。
     標題欄＋側欄都是浮在地圖上的面板（而非上下堆疊／左右並排的一般文件流），
     模擬天下雜誌選情地圖的滿版出血＋浮動控制項效果：.stage 用 position:relative
     填滿外層 .map-stage（elections.astro 已經算好 calc(100dvh - 頁首高度)），
     標題欄疊在左上角、側欄疊在右上角；窄螢幕則兩者都退回一般文件流，各自佔滿
     寬度，避免在小螢幕上把地圖擠壓成一條縫，也避免兩層浮層互相打架。

     標題／倒數／年度標示的文字內容與 days/electionYear/electionName 的計算都
     還在 elections.astro（Astro 才能讀檔、算日期），這裡只負責把它們排進浮動欄
     的版面，一字不動內容。 -->
<script lang="ts">
  import ElectionMap from './ElectionMap.svelte';
  import ElectionSidebar from './ElectionSidebar.svelte';
  import type { MapArea, MapLayer } from '../lib/mapTypes';

  let { days, electionYear, electionName }: {
    days: number;
    electionYear: number | string;
    electionName: string;
  } = $props();

  let area = $state<MapArea | null>(null);
  let layer = $state<MapLayer | null>(null);
</script>

<div class="stage">
  <header class="title-float">
    <h1>2026 九合一選舉</h1>
    <p class="countdown">投票日 2026 年 11 月 28 日{days > 0 ? `，尚餘 ${days} 天` : ""}</p>
    <p class="notice">
      以下為<strong>西元 {electionYear} 年（{electionName}）</strong>的結果與其後補選之現況，
      <strong>非 2026 年選情</strong>。候選人名單須待中選會於登記期後公告，屆時另行補上。
    </p>
  </header>
  <div class="map-region">
    <ElectionMap onSelect={(a, l) => { area = a; layer = l; }} />
  </div>
  <aside class="sidebar-float">
    <ElectionSidebar {area} {layer} />
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

  /* 標題與倒數維持原本（元素預設／既有 .countdown）的字級與字體階層，不縮小；
     只調整外距，讓它們在有邊框的浮動欄裡不會太擠。 */
  .title-float h1 { margin: 0 0 .3rem; }
  .title-float .countdown { color: var(--muted); font-size: var(--t-sm); margin: 0; }

  /* 年度標示：內容一字不改，但視覺降級——用小字級、低調色、跟標題之間一條分隔線
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

  /* 900px 是這一輪的新斷點（原本 720px）：兩側浮層加起來比單側寬得多，720px
     會擠爆，故放寬。低於此寬度時標題欄／側欄都退回一般文件流，各佔滿寬。 */
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
