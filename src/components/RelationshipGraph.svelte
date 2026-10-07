<!-- 人物關係圖。ego（檔案頁，以本人為中心）與 global（/graph 全圖）共用同一套視覺。
     資料轉換在 src/lib/graphView.ts，本檔只負責掛載 Cytoscape 與樣式。 -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { GraphData } from '../lib/types';
  import { toCytoscapeElements, bendAroundCenter } from '../lib/graphView';
  const CENTER_CLEARANCE = 80;

  // positions：global（/graph）建置時預先算好的座標（src/lib/graphLayout.ts）。有就直接用
  // preset 排版，不在瀏覽器端跑力導向——手機上 416 個節點的 cose 會卡主執行緒 3–4 秒。
  let { data, centerKey = null, mode = 'ego', positions = null }:
    { data: GraphData; centerKey?: string | null; mode?: 'ego' | 'global';
      positions?: Record<string, { x: number; y: number }> | null } = $props();

  let container: HTMLDivElement;

  // 讀網站設計 tokens（隨亮/暗模式變動），餵給 Cytoscape，讓圖與全站同調。
  function readColors() {
    const c = getComputedStyle(document.documentElement);
    const v = (n: string) => c.getPropertyValue(n).trim();
    return {
      bg: v('--bg'), surface: v('--surface'), fg: v('--fg'), muted: v('--muted'),
      faint: v('--faint'), line: v('--graph-line'), accent: v('--accent'),
      serif: v('--serif'), sans: v('--sans'),
    };
  }

  function buildStyle(c: ReturnType<typeof readColors>) {
    return [
      { selector: 'node', style: {
        shape: 'ellipse',
        width: 'data(size)', height: 'data(size)',
        'background-color': c.surface,
        'background-image': 'data(avatar)',
        'background-fit': 'cover',
        'background-clip': 'node',
        'border-width': 1.5, 'border-color': c.line,
        label: 'data(label)', 'text-wrap': 'wrap', 'text-max-width': '110',
        'text-valign': 'bottom', 'text-margin-y': 7,
        'font-family': c.serif, 'font-size': 13, 'font-weight': 700,
        'line-height': 1.35, color: c.fg,
        // 節點標籤（尤其第二行的職稱/類別）常疊在連線與邊標籤之上而讀不清。
        // 這裡不能比照邊標籤用不透明底色塊——節點間距近時（如僅一段關係的檔案頁）
        // 底色塊會整塊蓋掉剛好落在同位置的邊標籤文字，等於用「看不到線」換「看不到關係」。
        // 改用描邊（text-outline）只沿字形筆畫上色，背後的線與邊標籤仍看得見，是地圖學
        // 對抗「文字疊圖層」的標準作法。
        'text-outline-color': c.bg, 'text-outline-width': 2, 'text-outline-opacity': 1,
      } },
      // 外部公眾人物：虛框、灰字，視覺次於本站收錄的公職（沿用文字清單的 .rel-name.plain 語彙）
      { selector: 'node[kind = "entity"]', style: {
        'border-style': 'dashed', color: c.muted, 'font-weight': 500,
      } },
      // 第二層＝關係人的關係人，與本人無直接關係，故縮小並淡化以免誤讀
      { selector: 'node[depth = 2]', style: { opacity: 0.6, 'border-width': 1 } },
      // 中心人物：只靠較大的頭像與較粗的外框區分。原本姓名底下另墊一層淡紅底色塊，
      // 看起來像被標記或警示，使用者要求拿掉（2026-10-05）。
      { selector: 'node[center = 1]', style: {
        'border-width': 2.5, 'border-color': c.line,
      } },
      { selector: 'edge', style: {
        label: 'data(label)', 'font-family': c.sans, 'font-size': 11, color: c.muted,
        'curve-style': 'bezier', width: 1.2,
        'line-color': c.faint, 'target-arrow-color': c.faint,
        'text-background-color': c.bg, 'text-background-opacity': 1, 'text-background-padding': '3px',
      } },
      // 家族實線、政治虛線（沿用 FAMILY_RELATIONS 分類）
      { selector: 'edge[fam = 0]', style: { 'line-style': 'dashed' } },
      { selector: 'edge[dir = 1]', style: { 'target-arrow-shape': 'triangle', 'arrow-scale': 0.85 } },
      { selector: 'edge.hl', style: {
        'line-color': c.accent, 'target-arrow-color': c.accent, color: c.accent, width: 2,
      } },
    ];
  }

  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

  // ego（個人頁）的縮放按鈕。滾輪縮放刻意不開（會在捲動頁面時吃掉滾輪），改用按鈕；
  // 放大後可拖曳平移。cytoscape 實例建好後才有值。
  let zoomApi = $state<{ zoomBy: (f: number) => void; reset: () => void } | null>(null);

  onMount(() => {
    let cy: { destroy: () => void; style: (s: unknown) => { update: () => void };
             layout: (o: unknown) => { run: () => void }; on: (...a: unknown[]) => void;
             zoom: (level?: number) => number; minZoom: (z: number) => unknown;
             width: () => number; height: () => number;
             elements: () => { boundingBox: () => { w: number; h: number } } } | null = null;
    let mo: MutationObserver | null = null;
    let tip: HTMLDivElement | null = null;
    let hideTimer: ReturnType<typeof setTimeout>;
    let onResize: (() => void) | null = null;
    let resizeTimer: ReturnType<typeof setTimeout>;
    let disposed = false;

    // Cytoscape 走動態 import（避免 SSR），因此設定過程是非同步的；
    // 但 Svelte 5 只認同步回傳的 cleanup，故把非同步設定包進 IIFE，
    // cleanup 先同步回傳，之後再由 IIFE 補上 cy / mo / tip。
    void (async () => {
      try {
        const cytoscape = (await import('cytoscape')).default;
        // 元件在動態 import 完成前就卸載了 → 不要再建立任何資源，
        // 否則 cleanup 已經跑過，掛在 document 上的 MutationObserver 會永遠留著。
        if (disposed) return;
        const elements = toCytoscapeElements(data, centerKey);

        cy = cytoscape({
          container,
          elements: [...elements.nodes, ...elements.edges],
          style: buildStyle(readColors()),
          layout: { name: 'preset' },
          userZoomingEnabled: mode === 'global',
          autoungrabify: false,
          // 稀疏圖（全站有 41 頁只有一段關係）節點少，layout 後的 fit 會把縮放拉到 2.6 倍，
          // 節點大到與密集頁不成比例。設上限讓各頁節點尺寸接近；密集頁縮放本來就小於 1，不受影響。
          // 只加在 ego：global（/graph）開放使用者滾輪縮放，設上限會擋住放大檢視。
          ...(mode === 'ego' ? { maxZoom: 1.2 } : {}),
        }) as unknown as typeof cy;

        // ego：本人置中的同心圓（越靠中心 depth 越小）。global：力導向。
        // startAngle 改成 45°（π/4）：節點標籤掛在節點正下方，所以「垂直的邊」最糟——
        // 邊標籤畫在中點，恰好落進上下相鄰節點的標籤裡而完全讀不到。concentric 預設
        // startAngle = 3π/2 會把環上第一個節點放在正上方，鄰居只有一個時（全站 41 頁如此，
        // 是最常見的圖形狀）必定產生垂直的邊。45° 讓 n=1、2、4 這些常見的鄰居數都避開垂直軸。
        // 值是實測選的：對 2/9/12/15 節點四頁量測「邊標籤未被節點標籤覆蓋」的比例，
        // 45° 為 30/35，優於預設 270° 的 23/35 與正右方 0° 的 24/35。
        // 附帶效果：斜向配置比十字配置更貼合寬扁的容器，密集頁 fit 後的縮放從 0.54 升到 0.72，字更清楚。
        const layout = mode === 'ego'
          ? { name: 'concentric', concentric: (n: { data: (k: string) => number }) => 10 - n.data('depth'),
              levelWidth: () => 1, minNodeSpacing: 44, padding: 28, animate: false, startAngle: Math.PI / 4 }
          : positions
            ? { name: 'preset', positions: (n: { id: () => string }) => positions![n.id()], fit: true, padding: 30 }
            : { name: 'cose', padding: 30, animate: false, nodeRepulsion: 9000, idealEdgeLength: 110 };
        cy!.layout(layout).run();

        if (mode === 'ego') {
          // 初始 fit 仍受 maxZoom 1.2 限制（讓各頁節點大小一致），fit 完才放寬上限給按鈕放大用。
          const g = cy as any;
          const z0 = g.zoom();
          const p0 = { ...g.pan() };
          g.maxZoom(3);
          g.minZoom(z0 * 0.5);
          zoomApi = {
            zoomBy: (f: number) => g.zoom({ level: g.zoom() * f, renderedPosition: { x: g.width() / 2, y: g.height() / 2 } }),
            reset: () => g.viewport({ zoom: z0, pan: p0 }),
          };
        }

        // ego：不連到本人、但直線會穿過本人頭像（含下方姓名）的邊改走弧線繞開，否則
        // 讀起來像本人有這段關係（例：蔣萬安頁的蔣經國—蔣孝嚴親子線）。淨空距離
        // 涵蓋中心頭像半徑（44）加上姓名兩行的高度。
        if (mode === 'ego' && centerKey) {
          const g = cy as any;
          const c = g.getElementById(centerKey).position();
          g.edges().forEach((e: any) => {
            if (e.source().id() === centerKey || e.target().id() === centerKey) return;
            const d = bendAroundCenter(e.source().position(), e.target().position(), c, CENTER_CLEARANCE);
            if (d !== null) {
              e.style({ 'curve-style': 'unbundled-bezier', 'control-point-distances': d, 'control-point-weights': 0.5 });
            }
          });
        }

        // global（/graph，361 節點）：以「整張圖剛好塞進畫布」的比例為 minZoom 下限——
        // 使用者仍可自由放大，但滾輪縮小到底也只會停在全圖可見，不會縮到一小撮塞在畫布
        // 角落的縮圖。ego 模式已用 maxZoom 控制上限，不加下限（fit 後的縮放本來就小）。
        //
        // 這個比例取決於畫布大小，不能只在初始化時算一次：視窗一變小（手機轉向、開
        // devtools），真正的全圖比例會跟著變小，但舊的下限仍夾在高處，使用者就再也縮
        // 不到全圖、也沒有復原的辦法。故記下佈局後的圖形邊界（graph 座標，不隨視窗變動），
        // 視窗改變時用 cytoscape 自己 fit 的公式（見 getFitViewport）重算下限即可，
        // 既不必重跑 layout，也不會動到使用者當下的視角。
        if (mode === 'global') {
          const bb = cy!.elements().boundingBox();
          const FIT_PAD = 30; // 與 cose layout 的 padding 一致，重算結果才等同 fit()
          const applyFloor = () => {
            const w = cy!.width(), h = cy!.height();
            if (!(bb.w > 0 && bb.h > 0 && w > 0 && h > 0)) return;
            const floor = Math.min((w - 2 * FIT_PAD) / bb.w, (h - 2 * FIT_PAD) / bb.h);
            cy!.minZoom(floor);
            // 視窗變大時下限跟著上升，設定 minZoom 本身不會回夾當下的縮放，補一次。
            if (cy!.zoom() < floor) cy!.zoom(floor);
          };
          applyFloor();
          // resize 事件在拖曳視窗時會連發，debounce 一次即可；也讓 cytoscape 自己的
          // resize 處理先跑完，再讀 width()/height()。
          onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(applyFloor, 150); };
          window.addEventListener('resize', onResize);
        }

        // 通知頁面實例已就緒（/graph 的篩選/搜尋需要它，見 src/pages/graph.astro）。
        // bubbles 讓 document 層級的監聽收得到；不用輪詢，先後掛載都不會漏。
        container.dispatchEvent(new CustomEvent('rg:ready', { detail: cy, bubbles: true }));

        // 點本站收錄的節點 → 進其檔案頁（entity 的 slug 為空字串，不觸發）
        cy!.on('tap', 'node', (evt: { target: { data: (k: string) => string } }) => {
          const slug = evt.target.data('slug');
          if (slug) window.location.href = `/officials/${slug}/`;
        });

        // hover 連線 → tooltip（關係＋說明＋出處）。tooltip 自身可 hover，方便點出處連結。
        tip = document.createElement('div');
        tip.className = 'rg-tip';
        container.appendChild(tip);
        const hideSoon = () => {
          hideTimer = setTimeout(() => { tip!.style.opacity = '0'; tip!.style.pointerEvents = 'none'; }, 250);
        };
        tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
        tip.addEventListener('mouseleave', hideSoon);

        cy!.on('mouseover', 'edge', (evt: any) => {
          clearTimeout(hideTimer);
          evt.target.addClass('hl');
          const d = evt.target.data();
          const note = d.note ? `<div class="rg-note">${esc(d.note)}</div>` : '';
          const src = d.sourceUrl
            ? `<a class="rg-src" href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">查看出處 ↗</a>` : '';
          const m = evt.target.renderedMidpoint();
          tip!.innerHTML = `<div class="rg-rel">${esc(d.label)}</div>${note}${src}`;
          tip!.style.left = `${m.x}px`;
          tip!.style.top = `${m.y}px`;
          tip!.style.opacity = '1';
          tip!.style.pointerEvents = 'auto';
        });
        cy!.on('mouseout', 'edge', (evt: any) => { evt.target.removeClass('hl'); hideSoon(); });

        // hover 外部人物節點 → tooltip（描述＋條目連結＋照片署名）。本站收錄的公職點擊即進檔案頁，不需要。
        // 照片來自 Wikimedia Commons，CC BY 系列要求可見署名，故署名放在圖上、不只放 about 頁。
        cy!.on('mouseover', 'node[kind = "entity"]', (evt: any) => {
          clearTimeout(hideTimer);
          const d = evt.target.data();
          const desc = d.description ? `<div class="rg-note">${esc(d.description)}</div>` : '';
          const wiki = d.wikipediaUrl
            ? `<a class="rg-src" href="${esc(d.wikipediaUrl)}" target="_blank" rel="noopener">維基百科條目 ↗</a>` : '';
          // 有 photoSourceUrl（CC BY／CC BY-SA 照片）時署名連到 Commons 檔案頁，並標示本站已縮圖改作；
          // 其餘授權（如 Attribution）沒有 commonsUrl 連結要求，維持純文字。
          const credit = !d.photoCredit ? '' : d.photoSourceUrl
            ? `<div class="rg-credit">照片：<a class="rg-src" href="${esc(d.photoSourceUrl)}" target="_blank" rel="noopener">${esc(d.photoCredit)}</a>（本站縮圖）</div>`
            : `<div class="rg-credit">照片：${esc(d.photoCredit)}</div>`;
          if (!desc && !wiki && !credit) { hideSoon(); return; }
          const p = evt.target.renderedPosition();
          const r = evt.target.renderedOuterWidth() / 2;
          tip!.innerHTML = `<div class="rg-rel">${esc(d.name)}</div>${desc}${wiki}${credit}`;
          tip!.style.left = `${p.x}px`;
          tip!.style.top = `${p.y - r}px`;
          tip!.style.opacity = '1';
          tip!.style.pointerEvents = 'auto';
        });
        cy!.on('mouseout', 'node[kind = "entity"]', hideSoon);

        // 跟著亮/暗模式切換重新上色
        mo = new MutationObserver(() => cy!.style(buildStyle(readColors())).update());
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      } catch {
        // Cytoscape 載入或初始化失敗 → 整區隱藏。下方的文字關係清單為 SSG 靜態 HTML，
        // 不依賴本元件，仍可正常閱讀。
        container.style.display = 'none';
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(hideTimer);
      clearTimeout(resizeTimer);
      if (onResize) window.removeEventListener('resize', onResize);
      mo?.disconnect();
      cy?.destroy();
      tip?.remove();
    };
  });
</script>

<div class="graph-wrap">
  <div bind:this={container} class="graph" class:global={mode === 'global'} role="img" aria-label="人物關係圖"></div>
  {#if mode === 'ego' && zoomApi}
    <div class="zoom-ctl" role="group" aria-label="關係圖縮放">
      <button type="button" aria-label="放大" onclick={() => zoomApi?.zoomBy(1.3)}>＋</button>
      <button type="button" aria-label="縮小" onclick={() => zoomApi?.zoomBy(1 / 1.3)}>－</button>
      <button type="button" aria-label="重置縮放" class="reset" onclick={() => zoomApi?.reset()}>重置</button>
    </div>
  {/if}
</div>

<style>
  .graph-wrap { position: relative; }
  .zoom-ctl {
    position: absolute; top: 10px; right: 10px; z-index: 4;
    display: flex; gap: 4px;
  }
  .zoom-ctl button {
    min-width: 32px; height: 32px; padding: 0 8px;
    font-family: var(--sans); font-size: 16px; line-height: 1;
    color: var(--muted); background: var(--surface);
    border: 1px solid var(--line-strong); border-radius: var(--radius);
    cursor: pointer;
  }
  .zoom-ctl button.reset { font-size: var(--t-xs); }
  .zoom-ctl button:hover { color: var(--fg); border-color: var(--fg); }
  .zoom-ctl button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .graph {
    position: relative;
    width: 100%; height: 420px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
  }
  .graph.global { height: 78vh; min-height: 520px; }
  :global(.rg-tip) {
    position: absolute;
    transform: translate(-50%, calc(-100% - 12px));
    max-width: 240px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 8px 11px;
    font-family: var(--sans);
    font-size: var(--t-sm);
    color: var(--muted);
    line-height: 1.55;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
    z-index: 5;
  }
  :global(.rg-tip .rg-rel) { font-weight: 700; color: var(--fg); margin-bottom: 2px; }
  :global(.rg-tip .rg-note) { margin-bottom: 4px; }
  :global(.rg-tip .rg-src) { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  :global(.rg-tip .rg-credit) { margin-top: 4px; font-size: var(--t-xs); color: var(--faint); }
</style>
