<!-- 九合一政治地圖。單一投影＋圖層疊加＋transform 縮放，模擬「同一張圖連續縮放」
     （參考天下雜誌 2024 選情地圖的互動）：全國 22 縣市永遠畫在底層，下鑽時把對焦
     縣市／鄉鎮市區的細分層疊上去，鄰近區域仍留在畫面上（半透明降低不透明度），
     不像逐層換圖那樣整個消失。資料由 scraper/build-election-map.ts 產出到
     public/data/map/，此處只負責繪製與互動，不動資料管線。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { geoMercator, geoPath } from 'd3-geo';
  import { feature } from 'topojson-client';
  import { SvelteMap } from 'svelte/reactivity';
  import { isUnassignedVillage, type MapLayer, type MapArea } from '../lib/mapTypes';
  // 南海／釣魚台等極端外島的濾除邏輯，與 test/mapExclaves.test.ts 共用同一份定義。
  // 與已移除的插圖邏輯無關——這裡仍然需要，否則這幾座極端外島的經緯度會把全國
  // 唯一的那個投影撐爆，本島（連同金門、馬祖）反而被壓成看不清的小點。
  import { clipFarExclaves } from '../lib/mapExclaves';

  let { onSelect }: { onSelect?: (area: MapArea | null, layer: MapLayer) => void } = $props();

  // 內部座標系固定 1000×1100。投影只在全國層資料到位時算一次（fitExtent 到這個
  // 座標系），下鑽時絕不重算——否則每層各自的座標系不同，就沒辦法用同一個
  // <g transform> 做連續縮放，又會退回「逐層換圖」的老路。
  const VB_W = 1000, VB_H = 1100;
  let projection = $state<ReturnType<typeof geoMercator> | null>(null);
  const pathGen = $derived(projection && geoPath(projection));

  // 已載入的圖層集合，取代原本的「目前顯示哪一層」單一堆疊——全國層永遠在，
  // 下鑽只是把子層疊上去，鄰近區域不會因此消失，返回時也不必重新 fetch。
  let counties = $state<MapLayer | null>(null);       // 全國層，永遠載入、永遠畫
  const towns = new SvelteMap<string, MapLayer>();    // 縣市代碼 → 該縣市的鄉鎮市區
  const villages = new SvelteMap<string, MapLayer>(); // 鄉鎮市區代碼 → 該區的村里

  // 麵包屑＝對焦路徑：[全國, 縣市?, 鄉鎮市區?]。最後一項就是目前的對焦目標；
  // 中間項目仍保留，才能在對焦鄉鎮市區時知道「這是哪個縣市底下的」，把該縣市的
  // 鄉鎮市區層一併畫出來。
  interface Crumb { level: 'national' | 'county' | 'town'; code: string | null; name: string }
  let crumbs = $state<Crumb[]>([{ level: 'national', code: null, name: '全國' }]);

  let loading = $state(true);
  let error = $state<string | null>(null);
  // 重試要重新做「真正失敗的那個請求」，不能從 crumbs 推算——失敗時 crumbs 完全不變
  // （只有成功才會 push），從 crumbs.at(-1) 反推檔名只會拿到已經顯示成功的那層，
  // 重試等於白做工。直接記住失敗當下的那個 closure，重試就是再呼叫一次它。
  let pendingRetry = $state<(() => void) | null>(null);
  let hovered = $state<string | null>(null);

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

  // 語音報讀同樣要分得出「官派」「待抽籤」與「本站沒有資料」——三者是不同的事。
  function areaLabel(area: MapArea): string {
    if (area.chief) {
      const quota = area.chief.electedBy === 'quota' ? '，婦女保障名額當選' : '';
      return `${area.name}，${area.chief.name}，${area.chief.partyName}${quota}`;
    }
    if (area.chiefOffice === 'appointed') return `${area.name}，區長為官派，非民選職務`;
    if (area.chiefPendingDraw) return `${area.name}，得票相同待抽籤，本資料未載結果`;
    return `${area.name}，本站無資料`;
  }

  // 未編定村里的 aria-label：講清楚是「無此資料」而非「載入失敗」
  function uneditedLabel(area: MapArea): string {
    const loc = area.key.split('/').slice(0, -1).join('');
    return `${loc}未編定村里區域，無村里長資料`;
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

  interface Shape { d: string; key: string; area: MapArea; feature: any }

  // 把某一層的界線多邊形配對到對應的行政區資料，用「全域唯一那個投影」畫成路徑。
  // 不做 fitExtent——這正是「投影固定、只用 transform 縮放」的核心：不論全國層、
  // 縣市層還是鄉鎮市區層，同一組經緯度一律映射到同一組像素座標，下鑽時才能疊加
  // 而不必整張重畫。
  function shapesFor(layer: MapLayer | null): Shape[] {
    if (!layer || !pathGen) return [];
    const feats = featuresOf(layer.topology);
    // 界線多邊形鍵 → 行政區。每個鍵必須恰好對到一個區域：碰撞時後寫入者會覆蓋
    // 前者，把某區的資料畫到另一區的多邊形上（曾經因為建表前先把含頓號的鍵展開，
    // 連江縣 21 個村的村里長全部被覆蓋掉而沒有任何提示）。故這裡明確檢查並在
    // console 報錯——前端不能拋錯讓整張地圖消失，但絕不可以無聲。
    const byKey = new Map<string, MapArea>();
    for (const a of layer.areas) {
      const prev = byKey.get(a.key);
      if (prev && prev.code !== a.code) {
        console.error(`[地圖] 界線鍵碰撞：「${a.key}」同時對到 ${prev.code}（${prev.name}）與 ${a.code}（${a.name}），後者會覆蓋前者`);
      }
      byKey.set(a.key, a);
    }
    const out: Shape[] = [];
    for (const f of feats) {
      const area = byKey.get(f.properties.key);
      if (!area) continue;
      const d = pathGen(f) ?? '';
      if (!d) continue;
      out.push({ d, key: f.properties.key as string, area, feature: f });
    }
    return out;
  }

  const countyShapes = $derived(shapesFor(counties));
  const focusCountyCode = $derived(crumbs.length >= 2 ? crumbs[1].code : null);
  const focusTownCode = $derived(crumbs.length >= 3 ? crumbs[2].code : null);
  const townsLayer = $derived(focusCountyCode ? (towns.get(focusCountyCode) ?? null) : null);
  const townShapes = $derived(shapesFor(townsLayer));
  const villagesLayer = $derived(focusTownCode ? (villages.get(focusTownCode) ?? null) : null);
  const villageShapes = $derived(shapesFor(villagesLayer));

  // 目前對焦的那個形狀（縣市或鄉鎮市區）：算高亮外框、也算縮放目標的 bounds 依據。
  // 全國視角（crumbs 只有一項）時沒有對焦形狀。
  const focused = $derived.by((): Shape | null => {
    const c = crumbs.at(-1)!;
    if (c.level === 'county') return countyShapes.find((s) => s.area.code === c.code) ?? null;
    if (c.level === 'town') return townShapes.find((s) => s.area.code === c.code) ?? null;
    return null;
  });

  // 縮放目標：全國視角固定 k=1/tx=0/ty=0；對焦某區時，用該區在固定投影下的
  // bounds 反推要放大幾倍、平移多少，才能讓它填滿視窗的 82%。
  const target = $derived.by(() => {
    if (!focused || !pathGen) return { k: 1, tx: 0, ty: 0 };
    const [[x0, y0], [x1, y1]] = pathGen.bounds(focused.feature);
    const k = Math.min(12, 0.82 / Math.max((x1 - x0) / VB_W, (y1 - y0) / VB_H));
    return { k, tx: VB_W / 2 - (k * (x0 + x1)) / 2, ty: VB_H / 2 - (k * (y0 + y1)) / 2 };
  });

  // 目前對焦層的完整 MapLayer（給側欄彙總用）。
  function focusLayer(): MapLayer | null {
    const c = crumbs.at(-1)!;
    if (c.level === 'national') return counties;
    if (c.level === 'county') return towns.get(c.code!) ?? null;
    return villages.get(c.code!) ?? null;
  }

  async function loadNational() {
    pendingRetry = loadNational;
    loading = true;
    error = null;
    try {
      const res = await fetch('/data/map/national.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const layer: MapLayer = await res.json();
      counties = layer;
      // 投影只算這一次：全國 22 縣市（濾除極端外島後）的幾何 fitExtent 到固定座標系。
      if (!projection) {
        const feats = featuresOf(layer.topology);
        const fc = { type: 'FeatureCollection', features: feats };
        projection = geoMercator().fitExtent([[20, 20], [VB_W - 20, VB_H - 20]], fc as any);
      }
      // 初次載入也要立刻顯示這層的彙總，不留白等使用者移動滑鼠。
      onSelect?.(null, layer);
    } catch (e) {
      error = `地圖資料載入失敗（${(e as Error).message}）`;
    } finally {
      loading = false;
    }
  }

  // 下鑽：載入子層幾何（若已載入過就不重新 fetch，直接沿用），把對焦推進一層。
  // 失敗時 crumbs 完全不變，地圖停在原本那層，不會半途跳到一個資料不全的畫面。
  async function drillInto(area: MapArea, layer: MapLayer) {
    onSelect?.(area, layer);
    if (!area.childFile) return; // 村里層沒有 childFile，是最底層，不再下鑽
    const isCounty = layer.level === 'national';
    const map = isCounty ? towns : villages;
    const nextLevel: 'county' | 'town' = isCounty ? 'county' : 'town';

    if (map.has(area.code)) {
      // 幾何已經載入過：只推進對焦、換 transform，不重新 fetch，瞬間且平滑。
      crumbs = [...crumbs, { level: nextLevel, code: area.code, name: area.name }];
      onSelect?.(null, focusLayer());
      return;
    }

    pendingRetry = () => drillInto(area, layer);
    loading = true;
    error = null;
    try {
      const res = await fetch(`/data/map/${area.childFile}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const child: MapLayer = await res.json();
      map.set(area.code, child);
      crumbs = [...crumbs, { level: nextLevel, code: area.code, name: area.name }];
      onSelect?.(null, focusLayer());
    } catch (e) {
      error = `地圖資料載入失敗（${(e as Error).message}）`;
    } finally {
      loading = false;
    }
  }

  // 返回上一層：幾何早就載入過，只改 transform（CSS transition 處理平滑動畫），
  // 不重新 fetch，所以是瞬間的。
  function back() {
    if (crumbs.length <= 1) return;
    crumbs = crumbs.slice(0, -1);
    error = null;
    onSelect?.(null, focusLayer());
  }

  function jumpTo(i: number) {
    if (i >= crumbs.length - 1) return;
    crumbs = crumbs.slice(0, i + 1);
    error = null;
    onSelect?.(null, focusLayer());
  }

  function onKey(e: KeyboardEvent, area: MapArea, layer: MapLayer) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillInto(area, layer); }
    if (e.key === 'Escape') { e.preventDefault(); back(); }
  }

  onMount(() => { loadNational(); });
</script>

{#snippet shapePath(s: Shape, layer: MapLayer, dim: boolean, interactive: boolean)}
  {#if isUnedited(s.area)}
    <!-- 未編定村里：真實土地但無村里長，不可點擊的中性色區塊 -->
    <path d={s.d} class="unedited" role="img" aria-label={uneditedLabel(s.area)}
      vector-effect="non-scaling-stroke" />
  {:else if interactive}
    <path d={s.d} fill={fillFor(s.area)}
      class:hovered={hovered === s.area.code}
      class:clickable={!!s.area.childFile}
      vector-effect="non-scaling-stroke"
      tabindex="0" role="button"
      aria-label={areaLabel(s.area)}
      onclick={() => drillInto(s.area, layer)}
      onkeydown={(e) => onKey(e, s.area, layer)}
      onmouseenter={() => { hovered = s.area.code; onSelect?.(s.area, layer); }}
      onmouseleave={() => { hovered = null; }} />
  {:else}
    <!-- 非對焦，或已被下一層蓋過的背景區塊：只呈現地理脈絡，不進 tab 順序、不接收互動 -->
    <path d={s.d} fill={fillFor(s.area)} class="bg-shape" class:dim={dim}
      vector-effect="non-scaling-stroke" aria-hidden="true" />
  {/if}
{/snippet}

<div class="map-wrap">
  <!-- 麵包屑移到地圖區塊左下角（原本在左上角，改版後那個位置被浮動標題欄佔走）。
       跟下鑽中的載入／錯誤徽章共用同一個 bottom-left 角落，用 flex column-reverse
       疊放——麵包屑永遠貼齊底部，徽章出現時往上長，兩者都用 flex 排版自然避開，
       不必用魔術數字互相硬算間距。這裡只是把兩者包進同一個容器並改 CSS 定位，
       {#if}/{#each} 的條件與互動邏輯（jumpTo/pendingRetry）完全沒動。 -->
  <div class="corner-stack">
    <nav class="crumbs" aria-label="地圖層級">
      {#each crumbs as c, i}
        <button type="button" disabled={i === crumbs.length - 1} onclick={() => jumpTo(i)}>
          {i === 0 ? (counties?.parentName ?? c.name) : c.name}
        </button>
        {#if i < crumbs.length - 1}<span aria-hidden="true">›</span>{/if}
      {/each}
    </nav>
    <!-- 下鑽中的載入／錯誤狀態疊在地圖角落，不整張換掉——鄰近縣市與麵包屑
         全程留在畫面上，這正是「連續縮放」而非「逐層換圖」的重點。初次載入
         （counties 尚未到位）時用下面的 .state-msg 置中顯示，不是這裡。 -->
    {#if counties && loading}<p class="badge" role="status">載入中…</p>{/if}
    {#if counties && error}
      <p class="badge badge-error" role="alert">{error}
        <button type="button" onclick={() => pendingRetry?.()}>重試</button>
      </p>
    {/if}
  </div>

  {#if !counties}
    {#if error}
      <p class="state-msg state-error" role="alert">{error}
        <!-- 重試要重新載入「真正失敗的那個請求」（pendingRetry），理由見上方宣告處註解。 -->
        <button type="button" onclick={() => pendingRetry?.()}>重試</button>
      </p>
    {:else}
      <p class="state-msg">載入中…</p>
    {/if}
  {:else}
    <svg viewBox="0 0 {VB_W} {VB_H}" preserveAspectRatio="xMidYMid meet" role="group"
         aria-label="{focusLayer()?.parentName ?? counties.parentName}政治地圖">
      <g class="zoom-group" style="transform: translate({target.tx}px, {target.ty}px) scale({target.k})">
        {#each countyShapes as s (s.key)}
          {@render shapePath(s, counties, crumbs.length > 1 && s.area.code !== focusCountyCode, crumbs.length === 1)}
        {/each}
        {#if townsLayer}
          {#each townShapes as s (s.key)}
            {@render shapePath(s, townsLayer, crumbs.length > 2 && s.area.code !== focusTownCode, crumbs.length === 2)}
          {/each}
        {/if}
        {#if villagesLayer}
          {#each villageShapes as s (s.key)}
            {@render shapePath(s, villagesLayer, false, true)}
          {/each}
        {/if}
        {#if focused}
          <!-- 對焦區域的高亮外框，畫在最上層 -->
          <path d={focused.d} class="focus-outline" fill="none" vector-effect="non-scaling-stroke" aria-hidden="true" />
        {/if}
      </g>
    </svg>
  {/if}
</div>

<style>
  .map-wrap { position: relative; width: 100%; height: 100%; }
  svg { width: 100%; height: 100%; display: block; }

  /* 投影固定，靠這層 transform 做連續縮放；transition 讓下鑽／返回都平滑過渡。 */
  .zoom-group { transform-origin: 0 0; transition: transform .6s cubic-bezier(.4, 0, .2, 1); }
  @media (prefers-reduced-motion: reduce) { .zoom-group { transition: none; } }

  path { stroke: var(--bg); stroke-width: 0.5; transition: opacity .12s; }
  path.clickable { cursor: pointer; }
  path.hovered, path:focus-visible { opacity: .78; stroke: var(--fg); stroke-width: 1.5; outline: none; }
  path.unedited { stroke: var(--line); stroke-dasharray: 2 2; }
  path.bg-shape { pointer-events: none; }
  path.bg-shape.dim { opacity: .35; }
  .focus-outline { stroke: var(--accent); stroke-width: 2; pointer-events: none; }

  /* 左下角堆疊：麵包屑貼底，徽章（載入中／錯誤）出現時往上長。用
     column-reverse 是因為 DOM 順序是「麵包屑先、徽章後」，column-reverse 會把
     後面的項目往視覺上方排，第一個項目（麵包屑）自然留在容器底部。 */
  .corner-stack {
    position: absolute; left: 1.5rem; bottom: 1.5rem; z-index: 5;
    display: flex; flex-direction: column-reverse; align-items: flex-start; gap: .5rem;
  }
  .crumbs {
    display: flex; gap: .4rem; align-items: center; flex-wrap: wrap;
    background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius);
    padding: .4rem .65rem; box-shadow: 0 4px 14px rgba(0, 0, 0, .16);
  }
  .crumbs button { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font: inherit; }
  .crumbs button:disabled { color: var(--muted); cursor: default; }

  /* 初次載入（counties 尚未到位）置中顯示，此時左下角只有麵包屑（顯示「全國」），
     不再需要用大量 padding-top 讓路給原本在左上角的麵包屑。 */
  .state-msg { padding: 1.5rem; color: var(--muted); text-align: center; }
  .state-error { color: var(--fg); }

  .badge {
    background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius);
    padding: .5rem .75rem; color: var(--muted); font-size: .875rem;
    box-shadow: 0 4px 14px rgba(0, 0, 0, .16);
  }
  .badge-error { color: var(--fg); }
  .state-error button, .badge-error button {
    margin-left: .5rem; color: var(--accent); background: none;
    border: 1px solid var(--line-strong); border-radius: 4px; padding: .1rem .5rem; cursor: pointer;
  }
</style>
