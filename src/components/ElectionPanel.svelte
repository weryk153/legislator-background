<!-- 地圖與側欄的容器。兩者共享選取狀態（點選/移入的行政區與所在層）。 -->
<script lang="ts">
  import ElectionMap from './ElectionMap.svelte';
  import ElectionSidebar from './ElectionSidebar.svelte';
  import type { MapArea, MapLayer } from '../lib/mapTypes';

  let area = $state<MapArea | null>(null);
  let layer = $state<MapLayer | null>(null);
</script>

<div class="panel">
  <ElectionMap onSelect={(a, l) => { area = a; layer = l; }} />
  <ElectionSidebar {area} {layer} />
</div>

<style>
  .panel { display: grid; grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); gap: 1.5rem; }
  @media (max-width: 720px) { .panel { grid-template-columns: 1fr; } }
</style>
