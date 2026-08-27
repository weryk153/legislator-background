<!-- 九合一政治地圖。單一投影＋圖層疊加＋transform 縮放，模擬「同一張圖連續縮放」
     （參考天下雜誌 2024 選情地圖的互動）：全國 22 縣市永遠畫在底層，下鑽時把對焦
     縣市／鄉鎮市區的細分層疊上去，鄰近區域仍留在畫面上（填色往紙色調淡但保留
     色相，見下方 fillFor 的 dim 參數，不再用透明度），不像逐層換圖那樣整個消失。
     資料由 scraper/build-election-map.ts 產出到 public/data/map/，此處只負責
     繪製與互動，不動資料管線。 -->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { geoMercator, geoPath } from 'd3-geo';
  import { feature } from 'topojson-client';
  import { SvelteMap } from 'svelte/reactivity';
  import { isUnassignedVillage, PARTY_VAR, type MapLayer, type MapArea } from '../lib/mapTypes';
  // 南海／釣魚台等極端外島的濾除邏輯，與 test/mapExclaves.test.ts 共用同一份定義。
  // 與已移除的插圖邏輯無關——這裡仍然需要，否則這幾座極端外島的經緯度會把全國
  // 唯一的那個投影撐爆，本島（連同金門、馬祖）反而被壓成看不清的小點。
  import { clipFarExclaves } from '../lib/mapExclaves';

  // neutral：目前檢視的年份尚未舉行選舉（見 src/lib/electionYears.ts 的
  // ElectionYearConfig.status === 'upcoming'）。整張地圖改成單一中性色，不透露
  // 任何政黨版圖——因為底下沿用的仍是既有那年（如 2022）的行政區資料，只是拿來
  // 畫界線，不代表尚未舉行的那屆選情。投影／下鑽／縮放邏輯完全不受影響。
  // onCrumbs：麵包屑的顯示資料改由外層報頭渲染（見 ElectionPanel.svelte 的
  // .crumbs-row），這裡仍是唯一的事實來源（crumbs 這個 $state 本身、以及推進/
  // 返回的邏輯都留在這個檔案），只是每次 crumbs 或 counties（決定第一項標籤）
  // 變動時，把「畫面要顯示的樣子」算好推給外層，外層純渲染、不重算語意。
  // jumpTo 則透過 bind:this 讓外層的按鈕點擊能呼叫到——下鑽/返回涉及的
  // towns／villages 快取與 focusLayer() 都是這個元件內部狀態，不適合搬去外層。
  let { onSelect, neutral = false, onCrumbs }: {
    onSelect?: (area: MapArea | null, layer: MapLayer) => void;
    neutral?: boolean;
    onCrumbs?: (items: { label: string; disabled: boolean }[]) => void;
  } = $props();

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

  // 把 crumbs 換算成外層報頭要畫的樣子（label／是否為目前層級）推出去。第一項的
  // 標籤不是死綁「全國」——真正的頂層名稱要看 counties.parentName（如「臺灣」），
  // 所以要等 counties 到位後才推一次正確版本，counties 因此也是這個 $effect 的
  // 依賴之一（在它讀到的 counties?.parentName 裡）。
  $effect(() => {
    onCrumbs?.(crumbs.map((c, i) => ({
      label: i === 0 ? (counties?.parentName ?? c.name) : c.name,
      disabled: i === crumbs.length - 1,
    })));
  });

  let loading = $state(true);
  let error = $state<string | null>(null);
  // 重試要重新做「真正失敗的那個請求」，不能從 crumbs 推算——失敗時 crumbs 完全不變
  // （只有成功才會 push），從 crumbs.at(-1) 反推檔名只會拿到已經顯示成功的那層，
  // 重試等於白做工。直接記住失敗當下的那個 closure，重試就是再呼叫一次它。
  let pendingRetry = $state<(() => void) | null>(null);
  // hovered／kbFocused 分別對應滑鼠 hover 與鍵盤 :focus-visible，兩者共用同一套
  // 外框／填色處理（見下方 hoverTarget 與 fillFor 的 hover 參數）——鍵盤使用者
  // 「焦點停在哪個區」跟滑鼠使用者「游標停在哪個區」是同一件事的兩種輸入方式。
  // 下鑽／返回／跳層時都要清空這兩個狀態：下鑽後原本的 <path> 會從互動分支切到
  // 背景分支，瀏覽器的 blur 事件在這個切換時機並不可靠（同一個既有問題見下方
  // onMapKey 附近的說明），與其依賴 blur 事件，不如在每個會改變 crumbs 的入口
  // 明確清空，較不會有殘留高亮跟錯層的風險。
  let hovered = $state<string | null>(null);
  let kbFocused = $state<string | null>(null);

  // 村里層裡「未編定村里」區塊：真實土地但未編定村里，沒有村里長，不可點擊。
  // 判斷邏輯共用 src/lib/mapTypes.ts 的 isUnassignedVillage，不在此處重複硬寫前綴。
  function isUnedited(area: MapArea): boolean {
    return isUnassignedVillage(area);
  }

  // 四種非政黨狀態的填色，一律走 CSS 變數／SVG pattern，不寫死色碼：
  //   官派（無選舉）→ 斜線紋理 #hatch-appointed（見下方 <defs>）
  //   得票相同待抽籤 → --map-pending（刻意比「本站無資料」深，兩者不可同色）
  //   本站無資料     → --map-nodata
  //   未編定村里     → --map-unedited（模板裡另外處理，這裡是防禦性寫法）
  // neutral 模式（year switcher 切到尚未舉行的年份）整層短路成同一個中性色，
  // 不透露底下沿用的那年資料屬於哪個政黨。
  //
  // flatten：非互動的背景／脈絡形狀（bg-shape，見下方 shapePath）不用斜線紋理，
  // 改用紋理的底色畫成純色。斜線是高頻圖案，人眼對它的敏感度遠高於同樣色彩的
  // 實色色塊，即使調淡依然「看起來」比周圍安靜的實色背景搶眼——尤其深色模式下
  // 紋理的線色偏亮（見 tokens.css 的 --map-appointed-line）。而且下鑽後「目前
  // 對焦層級的上一層」本身不會被 dim（見 shapePath 呼叫處），若那一層剛好是
  // 官派區，紋理會用滿飽和度畫在最底層，直接蓋過疊在上面、真正對焦的下一層
  // 形狀。紋理只在「可點選、真正是互動焦點」的形狀上出現就夠了——背景脈絡形狀
  // 只需要讓讀者看出「這裡有塊地」，不需要重現完整圖例語意。
  //
  // dim：鄰區「調淡」不是「轉灰」。過去用 CSS opacity 把整個 <path>（含填色與
  // 邊界線）一起變透明，疊在暖色紙底上會讓藍變成一片土色、色相就丟了；而且
  // 邊界線本來就是 --bg（紙色）描邊，透明度疊加之後在暖底上會混濁成一條灰線，
  // 跟沒被調淡的形狀那圈乾淨的紙色細線看起來不是同一種東西——這正是「有些邊是
  // 白色細線、有些是深灰線」的成因，不只是視覺偏好問題。改成用 color-mix() 把
  // 填色本身往紙色（--bg）調淡、但保留色相，邊界線則維持全不透明——藍還是藍、
  // 綠還是綠，且全圖的邊界線粗細與顏色統一成一種。
  function dimmed(color: string): string {
    return `color-mix(in oklab, ${color} 32%, var(--bg))`;
  }

  // hover：滑鼠移入／鍵盤聚焦（尚未下鑽，只是「經過」）時，填色略往 --fg 加深、
  // 加飽和，幅度刻意壓低（88% 原色＋12% --fg）——這不是外框，是填色本身的微調，
  // 讓「游標在這裡」有點反應但不搶過對焦區的滿色與外框。不用 opacity：opacity
  // 會把色相一起洗淡，跟上面 dimmed() 註解講的是同一個道理。官派區用斜線紋理
  // （url(#hatch-appointed)）時無法 color-mix，hover 效果只在該區被攤平成純色
  // （flatten）時才生效，紋理本身維持原樣——外框仍會顯示，不影響可辨識度。
  function hoverTint(color: string): string {
    return `color-mix(in oklab, ${color} 88%, var(--fg))`;
  }

  function fillFor(area: MapArea, flatten = false, dim = false, hover = false): string {
    if (neutral) {
      const base = 'var(--map-appointed-bg)';
      if (hover) return hoverTint(base);
      return dim ? dimmed(base) : base;
    }
    if (isUnedited(area)) return 'var(--map-unedited)'; // 未編定村里樣式恆定，不隨 dim／hover 改變（見上方 shapePath 的獨立分支，實際上不會走到這裡）
    if (area.chiefOffice === 'appointed') {
      const base = flatten ? 'var(--map-appointed-bg)' : 'url(#hatch-appointed)';
      if (hover && flatten) return hoverTint(base);
      return dim && flatten ? dimmed(base) : base;
    }
    if (!area.chief) {
      const base = area.chiefPendingDraw ? 'var(--map-pending)' : 'var(--map-nodata)';
      if (hover) return hoverTint(base);
      return dim ? dimmed(base) : base;
    }
    const code = area.chief.partyCode;
    const base = `var(${PARTY_VAR[code] ? PARTY_VAR[code] : '--party-other'})`;
    if (hover) return hoverTint(base);
    return dim ? dimmed(base) : base;
  }

  // 語音報讀同樣要分得出「官派」「待抽籤」與「本站沒有資料」——三者是不同的事。
  // neutral 模式下不論底下資料實際是誰當選，一律報讀「尚未舉行」，避免把沿用的
  // 舊年份資料誤報成目前這屆的結果。
  function areaLabel(area: MapArea): string {
    if (neutral) {
      return area.chiefOffice === 'appointed'
        ? `${area.name}，2026 年選舉尚未舉行；此區職務為官派，非民選`
        : `${area.name}，2026 年選舉尚未舉行，尚無結果`;
    }
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

  // 目前「可互動」的那一層形狀——跟 shapePath 呼叫處判斷 interactive 的條件必須
  // 是同一組規則：全國視角時是縣市層，下鑽一層是鄉鎮市區層，下鑽兩層（村里層
  // 存在）時是村里層。hover／鍵盤焦點只會發生在可互動的形狀上（見 shapePath 的
  // interactive 分支才有 onmouseenter／onfocus），所以直接在這層裡找就夠了。
  const interactiveShapes = $derived(villagesLayer ? villageShapes : townsLayer ? townShapes : countyShapes);

  // hover 外框／填色的目標形狀：滑鼠 hover 與鍵盤 focus 共用（見上方 hovered／
  // kbFocused 宣告處的說明），滑鼠優先——兩者理論上不會同時指向不同區域（同一
  // 時間只有一個可互動元素能被滑鼠移入或鍵盤聚焦），這裡的優先順序只是防禦寫法。
  const hoverTarget = $derived.by((): Shape | null => {
    const code = hovered ?? kbFocused;
    if (!code) return null;
    return interactiveShapes.find((s) => s.area.code === code) ?? null;
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

  // 滑鼠移開某個可互動形狀後，側欄要還原成「目前對焦層」的彙總（原本只清了
  // hovered，外框跟著消失，但側欄沒人通知，停在最後掃過那一區——這是本次要修的
  // 問題）。還原不能在 mouseleave 當下立刻做：從 A 區直接移到緊鄰的 B 區時，
  // 瀏覽器保證會先送出 A 的 mouseleave、再送出 B 的 mouseenter，兩個事件之間有
  // 一個 tick 的落差。若 mouseleave 立刻呼叫 onSelect(null, ...) 還原，側欄會在
  // 這個落差裡先跳回彙總畫面，緊接著又被 B 的 mouseenter 蓋成 B 的細節——使用者
  // 在相鄰縣市/鄉鎮市區之間滑動時會看到彙總畫面一閃而過，體感就是閃爍。
  // 解法：mouseleave 只排一個很短的延遲（RESTORE_DELAY）才真的還原；延遲期間
  // 若有任何新的 mouseenter 進來（不論是相鄰區域、或原本那一區的邊緣再次觸發），
  // 一律取消這次還原——那代表滑鼠其實還在地圖的可互動範圍內、只是換了目標，不是
  // 真的離開。若延遲結束都沒有新的 mouseenter 取消它，才代表滑鼠確實離開了所有
  // 可互動形狀（移到空白處、面板外，或圖例等非地圖區域），這時才還原成目前對焦
  // 層的彙總。80ms 短到使用者感覺不到「先跳回彙總再變細節」的中間態，卻足夠讓
  // 同一個事件迴圈內先到的 mouseenter 趕在它之前把這次還原取消掉。
  const RESTORE_DELAY = 80;
  let restoreTimer: ReturnType<typeof setTimeout> | null = null;

  // 側欄內容溢出時（尤其加了得票數之後，候選人與席次讓面板常常超過視窗高度），
  // 使用者必須把滑鼠移到側欄上才能捲動——而那一移就是 mouseleave，還原一觸發，
  // 側欄立刻跳回彙總，等於溢出的內容永遠讀不到。問題出在「還原」的判準寫成「離開
  // 某個行政區」，但正確的判準是「離開地圖與側欄這整塊可互動範圍」。地圖元件本身
  // 看不到側欄，所以由容器（ElectionPanel）在滑鼠進入側欄時按住、離開時放行。
  let restoreHeld = false;

  function cancelRestore() {
    if (restoreTimer !== null) {
      clearTimeout(restoreTimer);
      restoreTimer = null;
    }
  }

  function scheduleRestore() {
    cancelRestore();
    if (restoreHeld) return;
    restoreTimer = setTimeout(() => {
      restoreTimer = null;
      onSelect?.(null, focusLayer());
    }, RESTORE_DELAY);
  }

  /** 滑鼠進入側欄：按住還原，讓使用者能捲動、閱讀目前這一區的細節。 */
  export function holdSelection() {
    restoreHeld = true;
    cancelRestore();
  }

  /** 滑鼠離開側欄：放行，並比照離開地圖的行為還原成當層彙總。 */
  export function releaseSelection() {
    restoreHeld = false;
    scheduleRestore();
  }

  onDestroy(cancelRestore);

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
      hovered = null; kbFocused = null; // 見上方宣告處說明：不依賴 blur，下鑽時明確清空
      // 下鑽這一刻若剛好有一個 mouseleave 排的延遲還原（見 scheduleRestore）尚未
      // 觸發，必須連同取消——不然它稍後醒來時會用 focusLayer() 重算，這裡雖然算
      // 出的剛好也是新層彙總（跟下一行手動呼叫的結果相同）看似無害，但若使用者
      // 下鑽後立刻又 hover 了新層裡的某一區，這個遲來的計時器會在那之後才觸發，
      // 把側欄從「使用者正在看的那一區」錯誤地蓋回彙總——故明確取消，下一行的
      // onSelect 已經是這次下鑽該有的、立即生效的還原。
      cancelRestore();
      onSelect?.(null, focusLayer());
      focusMap();
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
      hovered = null; kbFocused = null;
      cancelRestore(); // 理由同上（cache-hit 分支）
      onSelect?.(null, focusLayer());
      focusMap();
    } catch (e) {
      error = `地圖資料載入失敗（${(e as Error).message}）`;
    } finally {
      loading = false;
    }
  }

  // 返回上一層：幾何早就載入過，只改 transform（CSS transition 處理平滑動畫），
  // 不重新 fetch，所以是瞬間的。下鑽／返回都把焦點收回 <svg>（見 focusMap），
  // 這樣連續 Enter 下鑽、Escape 返回、再 Enter、再 Escape 都能一路有效。
  // 這個函式也是地圖左上角「← 返回上一層」控制項的點擊入口（見下方 markup 的
  // .back-control），跟報頭麵包屑、Escape 三種觸發方式共用同一份邏輯。
  function back() {
    if (crumbs.length <= 1) return;
    crumbs = crumbs.slice(0, -1);
    hovered = null; kbFocused = null;
    cancelRestore(); // 理由見 drillInto 內同一行的註解
    error = null;
    onSelect?.(null, focusLayer());
    focusMap();
  }

  // export：外層報頭（ElectionPanel.svelte）用 bind:this 拿到這個函式，點擊
  // 麵包屑上層項目時呼叫。邏輯本身沒有變——只是呼叫的入口從元件內部的
  // <nav class="crumbs"> 移到外層的 DOM。
  export function jumpTo(i: number) {
    if (i >= crumbs.length - 1) return;
    crumbs = crumbs.slice(0, i + 1);
    hovered = null; kbFocused = null;
    cancelRestore(); // 理由見 drillInto 內同一行的註解
    error = null;
    onSelect?.(null, focusLayer());
  }

  function onKey(e: KeyboardEvent, area: MapArea, layer: MapLayer) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drillInto(area, layer); }
    // Escape 不在這裡處理——見下方 .map-wrap 的容器層級 onkeydown 與其註解。
  }

  // Enter 下鑽之後，原本聚焦的那個 <path> 會從「互動、可聚焦」的 interactive
  // 分支切到「背景脈絡、aria-hidden、無 tabindex」的 bg-shape 分支（見下方
  // shapePath snippet）——同一個 DOM 節點被 Svelte 依 each key 重用，但屬性
  // 整組換掉，瀏覽器對「目前聚焦元素失去 tabindex」的行為並不一致，有些會直接把
  // focus 丟到 <body>。若 Escape 監聽器掛在個別 <path> 上，焦點一旦跑掉，
  // Escape 就再也捕捉不到，使用者只能重新 Tab 或改滑鼠——這正是要修的既有問題。
  //
  // 解法：Escape 改掛在 .map-wrap 容器層級（見下方 onMapKey 與其 markup 上的
  // onkeydown 綁定），靠事件冒泡在容器內任何位置都能接住；同時每次下鑽／返回完成後
  // 把焦點明確移到 <svg> 本身（tabindex="-1" + focus()），該元素的 aria-label
  // 已經是「目前對焦層級的中文名稱＋政治地圖」，螢幕閱讀器聚焦時會直接讀出
  // 目前所在位置，不是丟到一個沒有語意的元素上。
  let svgEl = $state<SVGSVGElement | undefined>(undefined);

  async function focusMap() {
    await tick();
    svgEl?.focus();
  }

  function onMapKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (crumbs.length <= 1) return; // 已在全國層，沒有上一層可退
    e.preventDefault();
    back();
  }

  onMount(() => { loadNational(); });
</script>

{#snippet shapePath(s: Shape, layer: MapLayer, dim: boolean, interactive: boolean)}
  {#if !neutral && isUnedited(s.area)}
    <!-- 未編定村里：真實土地但無村里長，不可點擊的中性色區塊。neutral 模式下不
         特別處理——尚未舉行的年份整張圖本來就已經是同一個中性色，沒必要再區分。 -->
    <path d={s.d} class="unedited" role="img" aria-label={uneditedLabel(s.area)}
      vector-effect="non-scaling-stroke" />
  {:else if interactive}
    <!-- hover／鍵盤焦點的視覺回饋不在這個 <path> 身上加深色描邊或降低透明度
         （見下方 CSS 註解與 style 區塊最上方 hover-outline 的說明）：填色的微調
         由 fillFor() 的 hover 參數處理，外框則由 .zoom-group 最上層另外疊的
         .hover-outline 畫出完整、不斷線的一圈。這裡只要把「目前是否 hover／
         focus」透過 fillFor 的第四個參數帶進填色即可。 -->
    <path d={s.d} fill={fillFor(s.area, false, false, hovered === s.area.code || kbFocused === s.area.code)}
      class:clickable={!!s.area.childFile}
      vector-effect="non-scaling-stroke"
      tabindex="0" role="button"
      aria-label={areaLabel(s.area)}
      onclick={() => drillInto(s.area, layer)}
      onkeydown={(e) => onKey(e, s.area, layer)}
      onmouseenter={() => { cancelRestore(); hovered = s.area.code; onSelect?.(s.area, layer); }}
      onmouseleave={() => { hovered = null; scheduleRestore(); }}
      onfocus={() => { kbFocused = s.area.code; }}
      onblur={() => { kbFocused = null; }} />
  {:else}
    <!-- 非對焦，或已被下一層蓋過的背景區塊：只呈現地理脈絡，不進 tab 順序、不接收互動。
         flatten=true——官派區不畫斜線紋理，見上方 fillFor 的說明。dim=true 時 fillFor
         回傳 color-mix() 調淡版填色（保留色相），不再靠 CSS opacity。 -->
    <path d={s.d} fill={fillFor(s.area, true, dim)} class="bg-shape"
      vector-effect="non-scaling-stroke" aria-hidden="true" />
  {/if}
{/snippet}

<div class="map-wrap" onkeydown={onMapKey}>
  <!-- Escape 掛在這個容器上（見上方 onMapKey 與其註解）：不論目前焦點在麵包屑
       按鈕、互動中的 <path> 或下鑽後被 focusMap() 收回的 <svg> 本身，keydown
       都會冒泡到這裡，容器不會因為子節點重繪而消失，Escape 因此不會失效。
  -->
  {#if crumbs.length > 1}
    <!-- 返回上一層：報頭麵包屑（可跳到任一層）與 Escape 都已經能回到全圖，但
         使用者下鑽後視線在地圖上，地圖上原本沒有任何返回入口，容易誤以為回不去
         （見本次修正的緣由）。這顆按鈕跟麵包屑、Escape 三種方式共用同一個 back()
         （見上方 <script>），只是多一個「視線在地圖上就找得到」的入口。全國層
         時整段 {#if} 不渲染（不是用 CSS 隱藏），不留多餘的 tab 停留點。 -->
    <button type="button" class="back-control" onclick={back}
      aria-label={`返回上一層，回到${crumbs[crumbs.length - 2].name}`}>
      ← 返回上一層
    </button>
  {/if}

  <!-- 麵包屑已經搬進左欄報頭（ElectionPanel.svelte 的 .crumbs-row），地圖上不再
       有浮動的麵包屑——這裡只剩下鑽中的載入／錯誤徽章，疊在地圖左下角。crumbs
       這個 $state、jumpTo() 與 onCrumbs 的推送邏輯都還在上面的 <script>，只是
       畫面搬去外層渲染，見該處註解。 -->
  <div class="corner-stack">
    <!-- 下鑽中的載入／錯誤狀態疊在地圖角落，不整張換掉——鄰近縣市全程留在畫面上，
         這正是「連續縮放」而非「逐層換圖」的重點。初次載入（counties 尚未到位）
         時用下面的 .state-msg 置中顯示，不是這裡。 -->
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
         aria-label="{focusLayer()?.parentName ?? counties.parentName}政治地圖"
         tabindex="-1" bind:this={svgEl}>
      <defs>
        <!-- 官派區（無選舉）的斜線紋理。底色／線色都讀 CSS 變數，深色模式切換時
             會自動跟著換，不必另外宣告一份深色版 pattern。tile 用 userSpaceOnUse
             固定在地圖內部 1000×1100 座標系裡，跟 path 一樣被 .zoom-group 的
             transform 整層縮放，下鑽時紋理密度跟著畫面一起放大，不會跳格。 -->
        <pattern id="hatch-appointed" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--map-appointed-bg)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--map-appointed-line)" stroke-width="1.4" />
        </pattern>
      </defs>
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
        {#if hoverTarget}
          <!-- hover／鍵盤焦點外框：畫在所有形狀之上、但在對焦外框之下（見下面
               {#if focused} 區塊），避免蓋掉已下鑽、正在檢視的對焦指示。用整條
               路徑在最上層疊一圈，而不是在各區自己的 <path> 上描邊——後者會被
               相鄰區域的路徑蓋掉一部分，看起來斷斷續續。
               兩層同一條 d：底下 .hover-outline-shadow 是一條極淡的深色細線，
               只在填色本身就很淺（如無黨籍的暖灰、或被 color-mix 調淡的鄰區）
               時墊出一點對比，避免紙色線「隱形」；上面 .hover-outline 才是主
               視覺——紙色（--bg）線。細節與理由見下方 CSS 的說明。 -->
          <path d={hoverTarget.d} class="hover-outline-shadow" fill="none" vector-effect="non-scaling-stroke" aria-hidden="true" />
          <path d={hoverTarget.d} class="hover-outline" fill="none" vector-effect="non-scaling-stroke" aria-hidden="true" />
        {/if}
        {#if focused}
          <!-- 對焦區域的高亮外框，畫在最上層——雙層描邊，見上方 CSS 註解。光暈在下、
               高亮線在上，兩者用同一條 d 疊圖，不會有縫隙或錯位。 -->
          <path d={focused.d} class="focus-outline-halo" fill="none" vector-effect="non-scaling-stroke" aria-hidden="true" />
          <path d={focused.d} class="focus-outline" fill="none" vector-effect="non-scaling-stroke" aria-hidden="true" />
        {/if}
      </g>
    </svg>
  {/if}
</div>

<style>
  .map-wrap { position: relative; width: 100%; height: 100%; }
  svg { width: 100%; height: 100%; display: block; }

  /* 投影固定，靠這層 transform 做連續縮放；transition 讓下鑽／返回都平滑過渡。
     全站 tokens.css 有一條 `@media (prefers-reduced-motion: reduce) { * {
     transition: none !important } }`，選擇器是 `*`（特異度 0,0,0），這裡用
     class 選擇器（特異度 0,1,0）+ !important 才蓋得過去——!important 之間先比
     特異度，特異度較高者勝出，跟原始碼順序無關。

     「減少動態效果」這個系統設定要避免的是視差、旋轉、大幅位移這類會引發前庭
     不適的動效；但地圖下鑽的縮放提供的是空間連續性——使用者需要看到「這個
     縣市怎麼從全圖放大成這樣」，才不會在下鑽後失去方位感。整段拿掉動畫（0s）
     反而讓畫面瞬間跳到另一個尺度，比縮短動畫更容易讓人迷失，違背這個設定
     「避免不適」的本意。故這裡選擇縮短（180ms、線性，沿用全站 --ease 的
     時長但不用它的曲線——--ease 是 cubic-bezier(.4,0,.2,1)，起伏感在這麼短的
     時間內反而不易察覺是否完成，改用 linear 讓 180ms 內的位移速率恆定，觀感上
     更乾脆），而不是完全關閉。 */
  .zoom-group { transform-origin: 0 0; transition: transform .6s cubic-bezier(.4, 0, .2, 1); }
  @media (prefers-reduced-motion: reduce) {
    .zoom-group { transition: transform 180ms linear !important; }
  }

  path { stroke: var(--bg); stroke-width: 0.5; transition: fill 120ms; }
  path.clickable { cursor: pointer; }
  /* 鍵盤 focus 的視覺回饋改用跟滑鼠 hover 相同的一套機制（填色微調＋最上層的
     .hover-outline，見上方 script 的 kbFocused／hoverTarget 與 markup 的
     {#if hoverTarget} 區塊），這裡只要蓋掉瀏覽器預設的方形 outline，避免跟
     自訂外框疊在一起變兩圈。 */
  path:focus-visible { outline: none; }
  /* fill 原本沒宣告，SVG 預設值是黑——在暖白紙底上會變成一塊突兀的黑斑。
     明確填 --map-unedited（見 tokens.css），跟虛線邊框一起把「無此資料」的
     訊號做得溫和而非看起來像壞掉。 */
  path.unedited { fill: var(--map-unedited); stroke: var(--line); stroke-dasharray: 2 2; }
  path.bg-shape { pointer-events: none; }
  /* 鄰區的調淡改在 fillFor() 用 color-mix() 算好填色（見該函式註解），這裡不再
     疊 opacity——整個形狀（含邊界線）維持全不透明，邊界線因此全圖統一成一種。 */

  /* hover／鍵盤焦點外框：畫在最上層一整條路徑（見 markup 的 {#if hoverTarget}），
     不在個別區域自己的 <path> 邊上描邊——那會被相鄰區域蓋掉一部分，看起來斷斷
     續續。

     顏色改用 --fg 的深色描邊之前試過（55% 不透明度的近黑），但問題不是強弱、
     是性質：深灰壓在中藍、深綠這類填色上，明度跟填色太接近，跳不出來，只把
     邊界弄糊，看起來像一道髒汙的抹痕；而且跟下面 .focus-outline 的對焦外框
     一樣都是「深色描邊」，兩者只剩粗細/濃度的差別，使用者分不出「這是滑過還是
     已選定」。

     改成「深底配淺線」：hover 時 fillFor() 已經把填色往 --fg 加深（見上方
     hoverTint()），這裡的外框改用紙色（--bg，深色模式下自動換成深底的紙色）
     去疊在加深後的填色上——淺線從裡面浮出來，邊界乾淨俐落，且跟 .focus-outline
     的朱紅在色相上完全不會混淆：hover 是「淺線」，對焦是「紅線」，一眼就能
     分辨兩種不同性質的訊號，而不是同一種訊號的強弱版。 */
  .hover-outline {
    stroke: var(--bg);
    stroke-width: 2.25;
    stroke-linejoin: round;
    stroke-linecap: round;
    pointer-events: none;
  }
  /* 墊在紙色線底下的極低不透明度深色細線：只在某些填色本身就很淺時（例如
     無黨籍的暖灰 --map-nodata、或已被 color-mix 調淡的鄰區）才派得上用場，
     替紙色線在淺色填色上補一點對比，避免線「隱形」。故意畫得比主線寬一點、
     只留邊緣露出來一圈，且不透明度壓得很低——不能反過來變成主視覺，不然又
     退回深色描邊的老問題。線寬用對焦外框光暈同一套「兩層同一條 d」手法，但
     幅度小很多（對焦光暈 7px vs 高亮線 3.5px，這裡 2.9px vs 2.25px）。 */
  .hover-outline-shadow {
    stroke: color-mix(in oklab, var(--fg) 30%, transparent);
    stroke-width: 2.9;
    stroke-linejoin: round;
    stroke-linecap: round;
    pointer-events: none;
  }

  /* 對焦外框：雙層描邊。底下 .focus-outline-halo 先畫一條較寬的紙色（--bg）光暈，
     上面 .focus-outline 疊一條較窄的 --accent（朱紅，本站識別色，非任何政黨色）
     高亮線——紙色光暈讓高亮線在任何填色（不論深淺）上都讀得出來，圓角收邊
     （round linejoin/linecap）把行政區界線的鋸齒吃掉，讓對焦外框看起來平滑。
     兩層寬度：光暈 7px、高亮線 3.5px，各邊露出 1.75px 的紙色光暈。 */
  .focus-outline-halo,
  .focus-outline {
    stroke-linejoin: round;
    stroke-linecap: round;
    pointer-events: none;
  }
  .focus-outline-halo { stroke: var(--bg); stroke-width: 7; }
  .focus-outline { stroke: var(--accent); stroke-width: 3.5; }

  /* 返回上一層：只在下鑽後出現（markup 見上方 {#if crumbs.length > 1}）。位置
     要在地圖的左上角，但不能疊在左欄報頭（ElectionPanel.svelte 的 .title-float，
     left:2rem、width:min(320px,26vw)、z-index:10）上面——那個面板本身就浮在
     地圖左側的大半個高度，兩者字面上都想佔「左上角」。這裡改成貼著報頭的右緣，
     公式必須跟 ElectionPanel.svelte 的 .title-float 保持同步：2rem（left）＋
     min(320px, 26vw)（width）＋1rem 間距。900px 斷點以下報頭改回一般文件流、
     不再蓋住地圖（.map-region 變成獨立的 60vh 區塊），這裡跟著切回單純的
     左上角定位——這個斷點數字也要跟 ElectionPanel.svelte 同步。
     樣式刻意不做成按鈕的樣子（不要膠囊、陰影、粗方框）：純文字＋極淡的底色
     （讓文字在任何顏色的地圖填色上都讀得出來）＋底部一條髮絲線，符合報紙特輯
     的語彙，跟 .crumbs button 是同一套克制風格。 */
  .back-control {
    position: absolute;
    top: 2rem;
    left: calc(2rem + min(320px, 26vw) + 1rem);
    z-index: 5;
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    min-width: 44px;
    min-height: 32px;
    padding: .5rem .75rem .55rem;
    font-family: var(--sans);
    font-size: var(--t-sm);
    color: var(--muted);
    background: color-mix(in oklab, var(--surface) 82%, transparent);
    border: none;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    transition: color var(--ease);
  }
  .back-control:hover,
  .back-control:focus-visible { color: var(--accent); }

  @media (max-width: 900px) {
    .back-control { top: 1rem; left: 1rem; }
  }

  /* 左下角堆疊：麵包屑搬進報頭後，這裡只剩下鑽中的載入／錯誤徽章。 */
  .corner-stack {
    position: absolute; left: 1.5rem; bottom: 1.5rem; z-index: 5;
    display: flex; flex-direction: column; align-items: flex-start; gap: .5rem;
  }

  /* 初次載入（counties 尚未到位）置中顯示。 */
  .state-msg { padding: 1.5rem; color: var(--muted); text-align: center; }
  .state-error { color: var(--fg); }

  .badge {
    background: var(--surface); border: 1px solid var(--line); border-radius: 0;
    padding: .5rem .75rem; color: var(--muted); font-size: .875rem;
  }
  .badge-error { color: var(--fg); }
  .state-error button, .badge-error button {
    margin-left: .5rem; color: var(--accent); background: none;
    border: 1px solid var(--line-strong); border-radius: 4px; padding: .1rem .5rem; cursor: pointer;
  }
</style>
