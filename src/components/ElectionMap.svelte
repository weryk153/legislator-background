<!-- 九合一政治地圖。逐層下鑽：全國 → 鄉鎮市區 → 村里。
     資料由 scraper/build-election-map.ts 產出到 public/data/map/，此處只負責繪製與互動。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { geoMercator, geoPath } from 'd3-geo';
  import { feature } from 'topojson-client';
  import { isUnassignedVillage, type MapLayer, type MapArea } from '../lib/mapTypes';
  // 連江縣有 8 個選舉單位是「數村合選一位村里長」，MapArea.key 含頓號
  // （如「連江縣/南竿鄉/復興村、福沃村」），但界線檔多邊形是單村鍵。
  // expandVillageUnitKey 把前者展開成一到多個單村鍵，用來建立多邊形查找表，
  // 否則這些多邊形會因鍵對不上被濾掉，連江縣的村里層地圖會開天窗。
  import { expandVillageUnitKey } from '../../scraper/lib/areaMatch';
  // 南海／釣魚台等極端外島的濾除邏輯，與 test/mapExclaves.test.ts 共用同一份定義。
  import { clipFarExclaves } from '../lib/mapExclaves';

  let { onSelect }: { onSelect?: (area: MapArea | null, layer: MapLayer) => void } = $props();

  // 麵包屑：堆疊已下鑽的層，回上層即 pop
  let stack = $state<{ file: string; layer: MapLayer }[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  // 目前正在嘗試載入的檔名——失敗時 stack 完全不變（push 只在成功時發生），
  // 若重試改成從 stack.at(-1) 推算檔名，下鑽中途失敗時會拿到「已經顯示成功的
  // 父層」而不是「失敗的子層」，重試等於白做工。獨立記錄這個狀態才能讓重試
  // 精準重新載入真正失敗的那個請求。
  let pendingFile = $state<string | null>(null);
  let hovered = $state<string | null>(null);
  let width = $state(720);
  let height = $state(880);

  const current = $derived(stack.at(-1)?.layer ?? null);

  // 政黨代號 → CSS 變數。查無者用 --party-other，不靜默變成無黨籍的灰。
  const PARTY_VAR: Record<string, string> = {
    '1': '--party-kmt', '16': '--party-dpp', '350': '--party-tpp',
    '267': '--party-npp', '90': '--party-pfp', '999': '--party-none',
  };

  // 村里層裡「未編定村里」區塊：真實土地但未編定村里，沒有村里長，不可點擊。
  // 判斷邏輯共用 src/lib/mapTypes.ts 的 isUnassignedVillage，不在此處重複硬寫前綴。
  function isUnedited(area: MapArea): boolean {
    return isUnassignedVillage(area);
  }

  function fillFor(area: MapArea): string {
    if (isUnedited(area)) return 'var(--line-strong)';
    const code = area.chief?.partyCode;
    return `var(${code && PARTY_VAR[code] ? PARTY_VAR[code] : '--party-other'})`;
  }

  function areaLabel(area: MapArea): string {
    return `${area.name}，${area.chief ? `${area.chief.name}，${area.chief.partyName}` : '無資料'}`;
  }

  // 未編定村里的 aria-label：講清楚是「無此資料」而非「載入失敗」
  function uneditedLabel(area: MapArea): string {
    const loc = area.key.split('/').slice(0, -1).join('');
    return `${loc}未編定村里區域，無村里長資料`;
  }

  async function load(file: string) {
    pendingFile = file;
    loading = true;
    error = null;
    try {
      const res = await fetch(`/data/map/${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const layer: MapLayer = await res.json();
      stack.push({ file, layer });
      // 每次換層（含初次載入全國層）都先顯示新層的彙總，不留著上一層的選取內容、
      // 也不讓側欄空白等使用者移動滑鼠——否則第一次打開頁面看起來像壞掉。
      onSelect?.(null, layer);
    } catch (e) {
      error = `地圖資料載入失敗（${(e as Error).message}）`;
    } finally {
      loading = false;
    }
  }

  // TopoJSON 的 objects 鍵名依界線檔而定（縣市層 COUNTY_MOI_1140318、鄉鎮市區層
  // TOWN_MOI_1140318、村里層 V），不可用固定鍵名存取，一律遍歷 Object.values 取得
  // 每個物件的 geometries 並合併成單一 feature 陣列。極端外島（南海東沙／太平島、
  // 釣魚台列嶼）的濾除邏輯見 src/lib/mapExclaves.ts 的說明。
  function featuresOf(topo: any): any[] {
    const feats: any[] = [];
    for (const obj of Object.values(topo.objects)) {
      const fc = feature(topo, obj as any) as any;
      const raw = fc.type === 'FeatureCollection' ? fc.features : [fc];
      for (const f of raw) {
        const clipped = clipFarExclaves(f);
        if (clipped) feats.push(clipped);
      }
    }
    return feats;
  }

  // 金門（09-020）、連江（09-007）距本島太遠，與本島同一投影會把本島壓成一小塊。
  // 澎湖（10-016）雖也在海上，但距離尚可，仍與本島同框。
  const OFFSHORE = new Set(['09-020-00-000-0000', '09-007-00-000-0000']);
  const isOffshore = (code: string) => OFFSHORE.has(code);

  interface Shape { d: string; key: string; area: MapArea }
  interface Inset { label: string; shapes: Shape[]; box: [number, number, number, number] }

  // 幾何與投影：每層重算，讓下鑽後的範圍填滿容器。全國層另把離島拆成插圖。
  const rendered = $derived.by((): { main: Shape[]; insets: Inset[] } => {
    if (!current) return { main: [], insets: [] };
    const topo = current.topology as any;
    const feats = featuresOf(topo);

    // 用展開後的單村鍵建立查找表，涵蓋連江縣數村合一的選舉單位。
    const byKey = new Map<string, MapArea>();
    for (const a of current.areas) {
      for (const k of expandVillageUnitKey(a.key)) byKey.set(k, a);
    }

    const paired = feats
      .map((f: any) => ({ f, area: byKey.get(f.properties.key) }))
      .filter((p: any) => p.area) as { f: any; area: MapArea }[];

    // 只有全國層需要拆插圖：下鑽之後同一縣市內的距離不會有這種量級差異
    const split = current.level === 'national';
    const mainFeats = paired.filter((p) => !split || !isOffshore(p.area.code));
    const offFeats = paired.filter((p) => split && isOffshore(p.area.code));

    const draw = (items: { f: any; area: MapArea }[], extent: [[number, number], [number, number]]): Shape[] => {
      if (!items.length) return [];
      const collection = { type: 'FeatureCollection', features: items.map((p) => p.f) };
      const path = geoPath(geoMercator().fitExtent(extent, collection as any));
      return items
        .map((p) => ({ d: path(p.f) ?? '', key: p.f.properties.key as string, area: p.area }))
        .filter((s) => s.d);
    };

    const main = draw(mainFeats, [[8, 8], [width * 0.72, height - 8]]);
    const insets: Inset[] = [];
    if (offFeats.length) {
      const box: [number, number, number, number] = [width * 0.76, 24, width * 0.22, height * 0.28];
      insets.push({
        label: '金門、馬祖',
        box,
        shapes: draw(offFeats, [[box[0] + 6, box[1] + 6], [box[0] + box[2] - 6, box[1] + box[3] - 6]]),
      });
    }
    return { main, insets };
  });

  function activate(area: MapArea) {
    onSelect?.(area, current!);
    if (area.childFile) load(area.childFile);
  }

  function back() {
    if (stack.length <= 1) return;
    stack.pop();
    onSelect?.(null, current!);
  }

  function onKey(e: KeyboardEvent, area: MapArea) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(area); }
    if (e.key === 'Escape') { e.preventDefault(); back(); }
  }

  onMount(() => { load('national.json'); });
</script>

{#snippet shapePath(s: Shape)}
  {#if isUnedited(s.area)}
    <!-- 未編定村里：真實土地但無村里長，不可點擊的中性色區塊 -->
    <path d={s.d} class="unedited" role="img" aria-label={uneditedLabel(s.area)} />
  {:else}
    <path d={s.d} fill={fillFor(s.area)}
      class:hovered={hovered === s.area.code}
      class:clickable={!!s.area.childFile}
      tabindex="0" role="button"
      aria-label={areaLabel(s.area)}
      onclick={() => activate(s.area)}
      onkeydown={(e) => onKey(e, s.area)}
      onmouseenter={() => { hovered = s.area.code; onSelect?.(s.area, current); }}
      onmouseleave={() => { hovered = null; }} />
  {/if}
{/snippet}

<div class="map-wrap">
  <nav class="crumbs" aria-label="地圖層級">
    {#each stack as s, i}
      <button type="button" disabled={i === stack.length - 1}
        onclick={() => { stack = stack.slice(0, i + 1); onSelect?.(null, stack[i].layer); }}>
        {s.layer.parentName}
      </button>
      {#if i < stack.length - 1}<span aria-hidden="true">›</span>{/if}
    {/each}
  </nav>

  {#if error}
    <p class="err" role="alert">{error}
      <!-- 重試要重新載入「真正失敗的那個檔案」（pendingFile），不能從 stack 頂端推算——
           失敗時 stack 完全沒變，stack.at(-1) 拿到的永遠是已經顯示成功的父層，不是
           失敗的子層；下鑽中途失敗時那樣重試只會白白重新載入使用者本來就看得到的東西。 -->
      <button type="button" onclick={() => load(pendingFile ?? 'national.json')}>重試</button>
    </p>
  {:else if loading && !current}
    <p class="loading">載入中…</p>
  {:else if current}
    <svg viewBox="0 0 {width} {height}" role="group" aria-label="{current.parentName}政治地圖">
      {#each rendered.main as s (s.key)}
        {@render shapePath(s)}
      {/each}
      {#each rendered.insets as ins}
        <rect x={ins.box[0]} y={ins.box[1]} width={ins.box[2]} height={ins.box[3]}
              fill="none" stroke="var(--line-strong)" stroke-width="1" rx="4" />
        <text x={ins.box[0] + 6} y={ins.box[1] - 6} class="inset-label">{ins.label}</text>
        {#each ins.shapes as s (s.key)}
          {@render shapePath(s)}
        {/each}
      {/each}
    </svg>
  {/if}
</div>

<style>
  .map-wrap { position: relative; }
  svg { width: 100%; height: auto; display: block; }
  path { stroke: var(--bg); stroke-width: 0.5; transition: opacity .12s; }
  path.clickable { cursor: pointer; }
  path.hovered, path:focus-visible { opacity: .78; stroke: var(--fg); stroke-width: 1.5; outline: none; }
  path.unedited { stroke: var(--line); stroke-dasharray: 2 2; }
  .inset-label { font-size: 12px; fill: var(--muted); font-family: var(--sans); }
  .crumbs { display: flex; gap: .4rem; align-items: center; margin-bottom: .6rem; flex-wrap: wrap; }
  .crumbs button { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font: inherit; }
  .crumbs button:disabled { color: var(--muted); cursor: default; }
  .err { color: var(--fg); }
</style>
