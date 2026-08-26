<!-- 地圖與側欄的容器。兩者共享選取狀態（點選/移入的行政區與所在層）。
     側欄改成浮在地圖上的面板（而非左右並排的 grid 欄），模擬天下雜誌選情地圖的
     滿版出血＋浮動控制項效果：.stage 用 position:relative 只框住地圖本身的高度，
     側欄用 position:absolute 疊在其右上角；窄螢幕則讓側欄退回一般文件流、落到
     地圖下方，避免在小螢幕上把地圖擠壓成一條縫。 -->
<script lang="ts">
  import ElectionMap from './ElectionMap.svelte';
  import ElectionSidebar from './ElectionSidebar.svelte';
  import type { MapArea, MapLayer } from '../lib/mapTypes';

  let area = $state<MapArea | null>(null);
  let layer = $state<MapLayer | null>(null);
</script>

<div class="stage">
  <div class="map-region">
    <ElectionMap onSelect={(a, l) => { area = a; layer = l; }} />
  </div>
  <aside class="sidebar-float">
    <ElectionSidebar {area} {layer} />
  </aside>
</div>

<style>
  .stage { position: relative; }
  .map-region { width: 100%; height: min(84vh, 940px); }

  .sidebar-float {
    position: absolute;
    right: 2rem;
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

  @media (max-width: 720px) {
    .map-region { height: 60vh; }
    .sidebar-float {
      position: static;
      width: 100%;
      max-height: none;
      overflow-y: visible;
      margin-top: 1rem;
      box-shadow: none;
    }
  }
</style>
