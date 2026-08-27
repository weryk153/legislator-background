<!-- 地圖與側欄的容器。兩者共享選取狀態（點選/移入的行政區與所在層），另外還擁有
     「目前檢視哪個年份」這個新狀態（見 src/lib/electionYears.ts）。
     標題欄＋側欄都是浮在地圖上的面板（而非上下堆疊／左右並排的一般文件流），模擬
     報紙特輯的滿版出血＋浮動控制項效果：.stage 用 position:relative 填滿外層
     .map-stage（elections.astro 已經算好 calc(100dvh - 頁首高度)），左欄報頭疊在
     左上角、側欄疊在右上角；窄螢幕則兩者都退回一般文件流，各自佔滿寬度，避免在
     小螢幕上把地圖擠壓成一條縫，也避免多層浮層互相打架。

     左欄報頭（.masthead）是報紙的報頭結構，由上而下：眉題→粗線→大標→髮絲線→
     版次（原本浮在地圖底部的年份切換器，現在當成「本期版次」移到這裡，見下方
     .edition-* 樣式）→髮絲線→本期位置（麵包屑，原本浮在地圖左下角的白色方盒，
     現在當成報頭的一列，見下方 .crumbs-* 樣式）→髮絲線→導言（年度標示／尚未
     舉行說明）→髮絲線→圖例。年份只在這裡出現一次，不再與地圖下緣的浮動切換器
     互相打架；麵包屑也一樣，不再浮在地圖上。 -->
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

  // 麵包屑：地圖元件（ElectionMap.svelte）才知道目前下鑽到哪裡、也才有 towns／
  // villages 的幾何快取，所以 crumbs 這個狀態與 jumpTo() 的邏輯留在那邊——這裡
  // 只接住它透過 onCrumbs 推來的顯示資料（label／是否為目前層級），純渲染；
  // 點擊上層項目則透過 bind:this 拿到的 mapRef 呼叫回它的 jumpTo()。
  let crumbItems = $state<{ label: string; disabled: boolean }[]>([
    { label: '全國', disabled: true },
  ]);
  let mapRef: {
    jumpTo: (i: number) => void;
    holdSelection: () => void;
    releaseSelection: () => void;
  } | undefined;

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

    <!-- 本期位置：麵包屑，原本浮在地圖左下角的白色方盒，改成報頭裡平鋪的一列——
         跟「本期版次」用同一套眉標語彙（.crumbs-label 沿用 .edition-label 的樣式）。
         當前層級是純文字（--fg，不是連結，語意上「已經在這裡了」不必再點）；
         上層是可點的 --muted 文字，hover 才轉 --accent，不是一律紅字。全國層
         （crumbItems 只有一項）一樣正常顯示這一列，不會變成空的。 -->
    <div class="crumbs-row">
      <span class="crumbs-label">本期位置</span>
      <nav class="crumbs" aria-label="地圖層級">
        {#each crumbItems as c, i}
          {#if i > 0}<span class="crumb-sep" aria-hidden="true">›</span>{/if}
          {#if c.disabled}
            <span class="crumb current">{c.label}</span>
          {:else}
            <button type="button" onclick={() => mapRef?.jumpTo(i)}>{c.label}</button>
          {/if}
        {/each}
      </nav>
    </div>
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
    <ElectionMap neutral={upcoming} onSelect={(a, l) => { area = a; layer = l; }}
      onCrumbs={(items) => { crumbItems = items; }} bind:this={mapRef} />
  </div>

  <!-- 右欄：資訊面板＋圖說，同屬一欄、左右邊緣切齊。.sidebar-float 是這欄的外殼，
       用 flex column 撐滿地圖區塊的整個高度（top/bottom 都釘在 2rem，跟左欄
       .title-float 的 max-height: calc(100% - 4rem) 是同一個邊界，只是這裡改用
       實際高度而非上限，好讓圖說有「多出來的空間」可以被推下去，見下方
       .map-caption 的說明）。.sidebar-panel 是原本那個有邊框/底色的方盒，只包
       ElectionSidebar 本身；下鑽到縣市／村里層面板變高時，這個方盒自己
       overflow-y: auto 內部捲動，不會撐爆整欄、也不會把圖說擠出視窗。 -->
  <aside class="sidebar-float">
    <!-- 滑鼠移進側欄時要按住「還原成當層彙總」——側欄的內容是 hover 地圖帶出來的，
         但內容溢出時使用者得把滑鼠移過來才能捲動，那一移原本就會觸發還原，等於
         溢出的部分永遠讀不到。判準應該是「離開地圖與側欄這整塊」，不是「離開某個
         行政區」。離開側欄時再放行，行為與離開地圖一致。 -->
    <div class="sidebar-panel"
      onmouseenter={() => mapRef?.holdSelection()}
      onmouseleave={() => mapRef?.releaseSelection()}
      role="presentation">
      <ElectionSidebar {area} {layer} {upcoming} />
    </div>

    <!-- 圖說：授權標示與領土說明。原本浮在地圖左下角獨立定位、又曾經併入左欄
         報頭的欄位流，但左欄報頭本身內容已經很滿（眉題／大標／版次／dateline／
         本期位置／導言／圖例），1568×766 這種較矮的視窗會被切掉或要內部捲動。
         右欄（資訊面板）在全國層通常只佔上半部，底下空著一大片，適合放圖說。

         用 margin-top: auto 把這兩段釘在 .sidebar-float 這個 flex column 的
         底部——而不是讓 .sidebar-panel 自己 flex-grow 撐滿剩餘空間：後者會讓
         資訊面板的邊框方盒跟著拉長、底下留一大塊空白方框，不是想要的效果。
         margin-top: auto 只把圖說本身推到欄底，資訊面板維持原本貼合內容的
         高度。.sidebar-float 有實際高度（top+bottom 兩端都釘住，不是只有
         max-height 上限），margin-top: auto 才有「多的空間」可以推。

         語意上仍是描述地圖的圖說，用 aria-label 的 <section> 包起來（不用
         <figcaption>，因為地圖本身不在同一個 <figure> 底下），螢幕閱讀器讀得出
         這是一個獨立的區塊。文字內容一字不改。 -->
    <section class="map-caption" aria-label="地圖圖說">
      <p class="credit">
        行政區界線：內政部國土測繪中心（政府資料開放授權條款）｜選舉結果：中央選舉委員會
      </p>
      <p class="scope-note">
        為使台灣本島在地圖上維持可辨識的比例，本頁地圖未繪出高雄市旗津區轄下的東沙島、南沙太平島，
        以及宜蘭縣頭城鎮大溪里轄下的釣魚台列嶼——這幾處均無村里長選舉；大溪里其餘轄區的村里長資料仍照常呈現於地圖上。
      </p>
    </section>
  </aside>
</div>

<style>
  .stage { position: relative; height: 100%; }
  .map-region { width: 100%; height: 100%; }

  /* 面板：報紙的語言是線，不是浮起來的卡片——去掉圓角與陰影，改用一圈髮絲線邊框
     壓在地圖上，底色維持 --surface 讓文字讀得清楚，但不再有「浮起來」的視覺暗示。
     左欄（報頭）本身就是這個方盒，維持原樣；右欄則拆成兩層——.sidebar-float
     是不帶邊框的外殼，負責定位與撐出整欄高度，.sidebar-panel 才是真正的方盒
     （見下方），底下留給圖說。 */
  .title-float {
    position: absolute;
    top: 2rem;
    left: 2rem;
    width: min(320px, 26vw);
    max-height: calc(100% - 4rem);
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 0;
    box-shadow: none;
    padding: 1rem 1.25rem 1.1rem;
    padding-top: .85rem;
    z-index: 10;
  }

  /* 右欄外殼：top／bottom 兩端都釘在 2rem（跟左欄 max-height: calc(100% - 4rem)
     是同一個邊界，只是這裡要的是「實際高度」而非「上限」），撐出一個跟地圖區塊
     等高的 flex column。資訊面板（.sidebar-panel）貼齊內容高度排在上方，圖說
     （.map-caption）用 margin-top: auto 推到這個欄的最底部——面板變高時會先擠壓
     這段「多出來的空間」，面板真的高到超出整欄高度才輪到面板自己內部捲動
     （見 .sidebar-panel 的 overflow-y）。 */
  .sidebar-float {
    position: absolute;
    top: 2rem;
    right: 2rem;
    bottom: 2rem;
    width: min(340px, 32vw);
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  /* 資訊面板方盒：原本 .sidebar-float 自己的樣式，現在搬到這個內層 div——
     flex: 0 1 auto 讓它貼齊內容高度，不會被拉長去填滿整欄；min-height: 0 是
     flex item 能夠正確縮小／捲動的必要設定（沒有這行，flex item 預設
     min-height: auto，內容較高時會撐破容器而不是自己捲動）。下鑽到縣市／村里層
     多出席次列、面板變高時，若整欄裝不下，靠這裡的 overflow-y: auto 自己內部
     捲動，圖說仍留在欄底完整可見，不會被推出視窗或切掉。 */
  /* 內容超出時會內部捲動。沒有任何提示的話，被切一半的那一列看起來像壞掉而不像
     「還有得捲」——所以底緣加一道漸層當提示。用 Komarov 的 local/scroll 雙層技法：
     cover 層是 local（隨內容捲動），捲到底時剛好蓋住 scroll 層那道漸層，提示自動
     消失，不需要 JS 監聽捲動位置。 */
  .sidebar-panel {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: 0;
    box-shadow: none;
    padding: 1rem 1.25rem 1.1rem;
    background:
      linear-gradient(to top, var(--surface), transparent) bottom / 100% 22px no-repeat local,
      linear-gradient(to top, color-mix(in oklab, var(--fg) 12%, transparent), transparent)
        bottom / 100% 22px no-repeat scroll,
      var(--surface);
  }

  /* 圖說：跟報頭／面板同一套「線而非方框」語彙——只有上緣一條髮絲線分隔，
     不要方框、不要底色、不要陰影，維持平鋪文字的報紙圖說感。flex: none 讓它
     不隨面板一起被壓縮；margin-top: auto 才是真正把它推到欄底的機制（見上方
     .sidebar-float 的說明）。字級沿用報頭其他輔助列的 --t-xs／--faint，行高
     放鬆到 1.6，兩段之間留 .6rem 的間距。 */
  .map-caption {
    flex: none;
    margin-top: auto;
    padding-top: .75rem;
    border-top: 1px solid var(--line);
  }
  .credit { color: var(--faint); font-size: var(--t-xs); line-height: 1.6; margin: 0; }
  .scope-note { color: var(--faint); font-size: var(--t-xs); line-height: 1.6; margin: .6rem 0 0; }

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

  /* 本期位置（麵包屑）：報頭裡平鋪的一列，不是浮在地圖上的白色方盒——去掉方框
     與底色，眉標「本期位置」沿用 .edition-label 同一套字級／字距／色，讓這一列
     讀起來跟上面的「本期版次」是同一種語言。 */
  .crumbs-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: .5rem; margin-top: .1rem; }
  .crumbs-label {
    font-family: var(--sans); font-size: var(--t-xs); letter-spacing: .08em;
    color: var(--faint); white-space: nowrap;
  }
  .crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 0; }
  .crumb-sep { color: var(--faint); margin: 0 .05rem; }
  /* 當前層級：純文字，--fg，不是連結——語意上「已經在這裡了」，不必再給一個
     點了沒反應（或點了退回自己）的按鈕。 */
  .crumb.current {
    font-family: var(--sans); font-size: var(--t-xs); font-weight: 600; color: var(--fg);
    padding: .35rem .5rem; display: inline-flex; align-items: center;
  }
  /* 上層：可點文字，預設 --muted、hover／focus 才轉 --accent，不是一律紅字
     （紅字原本讀起來像錯誤訊息）。padding 撐出至少 44×24px 的點擊區，不靠文字
     本身的寬度——「全國」兩個字單獨的文字寬度遠不到 44px。 */
  .crumbs button {
    font-family: var(--sans); font-size: var(--t-xs); background: none; border: none;
    cursor: pointer; color: var(--muted); padding: .35rem .5rem;
    min-width: 44px; min-height: 24px; box-sizing: border-box;
    display: inline-flex; align-items: center; justify-content: flex-start;
    transition: color var(--ease);
  }
  .crumbs button:hover { color: var(--accent); }

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
     elections.astro 的 .map-stage 一致，必須同步改。

     右欄退回靜態排版後，.sidebar-float 的 top/bottom 兩端釘住、.sidebar-panel
     的 overflow-y: auto 都要一併解除——position: static 底下 top/bottom 本來就
     不生效，但 overflow-y: auto 與 min-height: 0 若不解除，面板在小螢幕仍可能
     顯示成一個內部可捲動的矮盒子，而不是隨頁面捲動的一般段落。圖說跟著資訊
     面板走，一起退回文件流即可，不需要另外處理 margin-top: auto（沒有多餘
     高度可推，這行在這裡等於沒作用，故不必特別歸零）。 */
  @media (max-width: 900px) {
    .map-region { height: 60vh; }
    /* 面板要把頁面槽寬補回來。.map-stage 是 width: 100vw 的滿版區塊（見
       elections.astro），為了做出血跳出了 .wrap 的左右 padding；地圖本身滿版是
       對的，但退回文件流的報頭／側欄／圖說如果跟著滿版，就會貼死螢幕邊緣，跟
       同一頁的「全國一覽」差 24px，三個區塊三條左邊界。用 margin-inline 而非
       padding：要移動的是方框的邊框本身，不只是框內的文字。width 必須從 100%
       改回 auto，否則加上左右 margin 會溢出容器。 */
    .title-float,
    .sidebar-float {
      position: static;
      width: auto;
      margin-inline: var(--gutter);
      margin-top: 1rem;
      box-shadow: none;
    }
    .title-float { margin-top: 0; margin-bottom: 1rem; max-height: none; overflow-y: visible; }
    .sidebar-panel { max-height: none; overflow-y: visible; }
  }
</style>
