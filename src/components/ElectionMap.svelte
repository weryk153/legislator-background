<!-- 九合一政治地圖。逐層下鑽：全國 → 鄉鎮市區 → 村里。
     資料由 scraper/build-election-map.ts 產出到 public/data/map/，此處只負責繪製與互動。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { geoMercator, geoPath } from 'd3-geo';
  import { feature } from 'topojson-client';
  import type { MapLayer, MapArea } from '../lib/mapTypes';
  // 連江縣有 8 個選舉單位是「數村合選一位村里長」，MapArea.key 含頓號
  // （如「連江縣/南竿鄉/復興村、福沃村」），但界線檔多邊形是單村鍵。
  // expandVillageUnitKey 把前者展開成一到多個單村鍵，用來建立多邊形查找表，
  // 否則這些多邊形會因鍵對不上被濾掉，連江縣的村里層地圖會開天窗。
  import { expandVillageUnitKey } from '../../scraper/lib/areaMatch';

  let { onSelect }: { onSelect?: (area: MapArea | null, layer: MapLayer) => void } = $props();

  // 麵包屑：堆疊已下鑽的層，回上層即 pop
  let stack = $state<{ file: string; layer: MapLayer }[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
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
  // MapArea.code 帶「未編定:」前綴（見 src/lib/mapTypes.ts 的說明），以此判斷。
  function isUnedited(area: MapArea): boolean {
    return area.code.startsWith('未編定:');
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
    loading = true;
    error = null;
    try {
      const res = await fetch(`/data/map/${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      stack.push({ file, layer: await res.json() });
    } catch (e) {
      error = `地圖資料載入失敗（${(e as Error).message}）`;
    } finally {
      loading = false;
    }
  }

  // TopoJSON 的 objects 鍵名依界線檔而定（縣市層 COUNTY_MOI_1140318、鄉鎮市區層
  // TOWN_MOI_1140318、村里層 V），不可用固定鍵名存取，一律遍歷 Object.values 取得
  // 每個物件的 geometries 並合併成單一 feature 陣列。
  // 台灣本島＋鄰近可呈現島嶼（含金門、馬祖）的地理範圍。目視驗證時發現兩個界線檔本身
  // 就有的、需求書沒提到的極端外島，兩者都會把 fitExtent 的座標範圍撐大、把本島壓扁：
  //   1. 高雄市旗津區依法轄有南海的東沙島、太平島，經緯度與本島差了數千公里，在全國層
  //      （高雄市多邊形本身）、下鑽高雄市後的鄉鎮市區層（旗津區多邊形本身）都會出現；
  //      旗津區的村里層則是兩座島各自獨立成一筆「未編定村里」，本身無村里長、無選舉
  //      意義，整筆濾掉不畫。
  //   2. 宜蘭縣頭城鎮大溪里依法轄有東北方的釣魚台列嶼，與本島距離較近但仍有一百多公里，
  //      同樣在全國層（宜蘭縣）、頭城鎮層（大溪里）出現；大溪里本身是有里長的真實村里，
  //      不可整筆濾掉，僅濾除該 MultiPolygon 裡屬於釣魚台列嶼的部件，保留大溪里本體。
  // 兩案例分別驗證了 clipFarExclaves 對 Polygon（整筆濾除）與 MultiPolygon（僅濾除
  // 越界部件）兩種型別的處理都要正確。
  const TW_ENVELOPE = { minLon: 117, maxLon: 122.3, minLat: 21.7, maxLat: 26.5 };
  const inEnvelope = ([lon, lat]: [number, number]) =>
    lon >= TW_ENVELOPE.minLon && lon <= TW_ENVELOPE.maxLon &&
    lat >= TW_ENVELOPE.minLat && lat <= TW_ENVELOPE.maxLat;

  // Polygon 整筆落在範圍外者回傳 null（不畫）；MultiPolygon 只濾掉範圍外的部件，保留本體。
  function clipFarExclaves(f: any): any | null {
    const geom = f.geometry;
    if (!geom) return f;
    if (geom.type === 'Polygon') {
      return inEnvelope(geom.coordinates[0][0]) ? f : null;
    }
    if (geom.type === 'MultiPolygon') {
      const kept = geom.coordinates.filter((poly: any) => inEnvelope(poly[0][0]));
      if (!kept.length) return null;
      if (kept.length === geom.coordinates.length) return f;
      return { ...f, geometry: { ...geom, coordinates: kept } };
    }
    return f;
  }

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
      <button type="button" onclick={() => { const f = stack.at(-1)?.file ?? 'national.json'; stack.pop(); load(f); }}>重試</button>
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
