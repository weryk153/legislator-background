<!-- 地圖側欄。顯示當前選取的行政區，未選取時顯示該層的彙總。
     資料深度必須看得出來：縣市長與縣市議員連得到檔案頁，鄉鎮市長以下只有中選會欄位。 -->
<script lang="ts">
  import { isUnassignedVillage, type MapArea, type MapLayer, type PartySeat } from '../lib/mapTypes';

  // upcoming：目前檢視的年份尚未舉行選舉（見 src/lib/electionYears.ts）。這時
  // area／layer 仍然是既有那年（如 2022）的資料——地圖只是拿它畫界線與驅動
  // 下鑽，不代表尚未舉行那屆的結果，所以側欄要整段改講「尚無結果」，不能把
  // area.chief 等 2022 年的當選人資訊當成現在的答案顯示出來。
  let { area, layer, upcoming = false }: {
    area: MapArea | null; layer: MapLayer | null; upcoming?: boolean;
  } = $props();

  // 未選取單一區時，把整層的首長政黨彙總成分佈
  const overview = $derived.by((): PartySeat[] => {
    if (!layer) return [];
    const n = new Map<string, { name: string; seats: number }>();
    for (const a of layer.areas) {
      if (!a.chief) continue;
      const cur = n.get(a.chief.partyCode) ?? { name: a.chief.partyName, seats: 0 };
      cur.seats++;
      n.set(a.chief.partyCode, cur);
    }
    return [...n.entries()]
      .map(([partyCode, v]) => ({ partyCode, partyName: v.name, seats: v.seats }))
      .sort((a, b) => b.seats - a.seats);
  });

  const chiefLabel = $derived(
    layer?.level === 'national' ? '縣市長'
      : layer?.level === 'county' ? '鄉鎮市區長'
        : '村里長');
  const seatLabel = $derived(layer?.level === 'national' ? '議會席次' : '代表會席次');

  // 全國 164 個一般區的區長依地方制度法第 58 條由市長依法任用（官派），也沒有
  // 區民代表會。顯示成「查無資料」會讓讀者以為是本站漏收——制度上不存在這個
  // 職務與本站沒有資料是兩回事，規格 §4.1 要求兩者必須分得出來。
  // （直轄市山地原住民區——烏來、復興、和平、茂林、桃源、那瑪夏——區長與區民
  // 代表都是民選，資料端已依中選會 elbase 逐區判定，不用名稱猜。）
  const chiefAppointed = $derived(area?.chiefOffice === 'appointed');
  const noCouncil = $derived(!!area && area.councilOffice === 'none');
  const electedAreaCount = $derived(layer?.areas.filter((a) => a.chiefOffice === 'elected').length ?? 0);
  const appointedAreaCount = $derived(layer?.areas.filter((a) => a.chiefOffice === 'appointed').length ?? 0);

  // 村里層「未編定村里」區塊：真實土地但無村里長，不當成一般查無資料處理。
  // 判斷邏輯共用 src/lib/mapTypes.ts 的 isUnassignedVillage，不重複硬寫前綴。
  const isUnedited = $derived(!!area && isUnassignedVillage(area));
</script>

<aside class="side">
  {#if upcoming}
    <!-- 尚未舉行的年份：不論有沒有點選行政區，一律不揭露沿用資料裡的當選人／
         政黨，只說明「尚無結果」，並重申開票後會更新——跟左欄的說法一致。 -->
    <h2>{area?.name ?? layer?.parentName ?? '2026 九合一選舉'}</h2>
    <p class="institutional">
      2026 年地方公職人員選舉尚未舉行，本站尚無{area ? '此區' : ''}結果可顯示。
      投票日 2026 年 11 月 28 日，開票後本頁將更新為當屆結果。
    </p>
  {:else if area}
    <h2>{area.name}</h2>

    {#if isUnedited}
      <p class="note">此區塊為未編定村里（無村里長、無資料），非本站漏收。</p>
    {:else if chiefAppointed}
      <section>
        <h3>{chiefLabel}</h3>
        <p class="institutional">區長為官派，非民選職務——依地方制度法第 58 條由市長依法任用，沒有選舉，故本站無當選人資料。</p>
      </section>
    {:else if area.chief}
      <section>
        <h3>{chiefLabel}</h3>
        {#if area.chief.slug}
          <a class="person" href={`/officials/${area.chief.slug}`}>
            {area.chief.name}<span aria-hidden="true"> →</span>
          </a>
        {:else}
          <span class="person none">{area.chief.name}</span>
          <p class="note">本站尚無此人背景資料</p>
        {/if}
        <p class="party">
          {area.chief.partyName}
          {#if area.chief.electedBy === 'quota'}<span class="tag">婦女保障名額當選</span>{/if}
        </p>
        {#if area.chief.termLimitStatus === 'limited'}
          <p class="limit">{area.chief.termLimitReason}</p>
        {:else if area.chief.termLimitStatus === 'unknown'}
          <p class="limit pending">連任狀態待查：{area.chief.termLimitReason}</p>
        {/if}
      </section>
    {:else if area.chiefPendingDraw}
      <section>
        <h3>{chiefLabel}</h3>
        <p class="institutional">
          得票相同，依法當場抽籤決定：{area.chiefPendingDraw.names.join('、')}。
          中選會這份投開票資料未記載抽籤結果，故本站不列當選人——這不是本站漏收，也不是無人當選。
        </p>
      </section>
    {:else}
      <p class="note">查無{chiefLabel}資料</p>
    {/if}

    {#if area.seats.length}
      <section>
        <h3>{seatLabel}（共 {area.seats.reduce((n, s) => n + s.seats, 0)} 席）</h3>
        <ul class="bars">
          {#each area.seats as s}
            <li>
              <span class="nm">{s.partyName}</span>
              <span class="bar" style={`--w:${(s.seats / area.seats[0].seats) * 100}%`}></span>
              <span class="num">{s.seats}</span>
            </li>
          {/each}
        </ul>
        {#if area.quotaSeats}
          <p class="note">其中 {area.quotaSeats} 席為婦女保障名額當選（中選會註記 <code>!</code>）。</p>
        {/if}
        {#if area.seatsPendingDraw}
          <p class="note">另有 1 席得票相同、待抽籤決定（{area.seatsPendingDraw.names.join('、')}），未計入上表。</p>
        {/if}
      </section>
    {:else if noCouncil && layer?.level === 'county'}
      <section>
        <h3>{seatLabel}</h3>
        <p class="institutional">一般區無區民代表會——非民選機關，制度上不存在，故無席次可列。</p>
      </section>
    {/if}
  {:else if layer}
    <h2>{layer.parentName}</h2>
    <section>
      <!-- 分母只算「該職務是民選」的區：直轄市／省轄市的一般區長官派，把它們算進
           分母會讓政黨分佈看起來憑空少一大塊，讀者會誤以為是本站漏收。 -->
      <h3>{chiefLabel}政黨分佈（共 {electedAreaCount} 區）</h3>
      {#if electedAreaCount === 0}
        <p class="institutional">
          本市轄下各區的區長皆為官派、非民選職務（依地方制度法第 58 條由市長依法任用），
          故沒有政黨版圖可列——這是制度事實，不是本站缺資料。點進各區仍可看轄下村里的村里長。
        </p>
      {/if}
      <ul class="bars">
        {#each overview as s}
          <li>
            <span class="nm">{s.partyName}</span>
            <span class="bar" style={`--w:${(s.seats / overview[0].seats) * 100}%`}></span>
            <span class="num">{s.seats}</span>
          </li>
        {/each}
      </ul>
    </section>
    {#if appointedAreaCount > 0}
      <p class="note">另有 {appointedAreaCount} 個區的區長為官派、非民選職務（不計入上表）。</p>
    {/if}
    <p class="hint">點選地圖上的行政區可看細節，再點一次可往下一層。</p>
  {/if}
</aside>

<style>
  .side { font-family: var(--sans); }
  /* 區域名：報紙的語言，襯線體。 */
  h2 { font-family: var(--serif); margin: 0 0 .6rem; }
  h3 { font-size: .85rem; color: var(--muted); margin: 1rem 0 .35rem; font-weight: 600; }
  .person { font-size: 1.2rem; font-weight: 600; color: var(--accent); text-decoration: none; }
  .person.none { color: var(--muted); }
  .party { margin: .2rem 0 0; color: var(--fg); }
  .note { color: var(--muted); font-size: .85rem; margin: .2rem 0 0; }
  .limit { color: var(--fg); background: var(--surface); padding: .35rem .5rem; border-radius: 2px; font-size: .85rem; }
  .limit.pending { color: var(--muted); }
  /* 制度事實（官派、無此機關、待抽籤）與「本站查無資料」在視覺上也要分得開 */
  .institutional {
    color: var(--fg); background: var(--surface); border-left: 3px solid var(--line-strong);
    padding: .4rem .55rem; border-radius: 2px; font-size: .85rem; margin: .2rem 0 0; line-height: 1.6;
  }
  .tag { color: var(--muted); font-size: .75rem; border: 1px solid var(--line); border-radius: 2px; padding: 0 .3rem; margin-left: .35rem; }
  /* 席次：報紙的數字用襯線體＋等寬數字，長條也改成細線＋底線分隔的表格感，
     不再是 app 感的圓角進度條。 */
  .bars { list-style: none; padding: 0; margin: 0; display: grid; gap: 0; }
  .bars li {
    display: grid; grid-template-columns: 7rem 1fr 2.5rem; align-items: center; gap: .4rem;
    font-size: .85rem; padding: .3rem 0; border-bottom: 1px solid var(--line);
  }
  .bars li:last-child { border-bottom: none; }
  .bar { height: 3px; background: var(--line-strong); width: var(--w); border-radius: 0; }
  .num { text-align: right; font-family: var(--serif); font-variant-numeric: tabular-nums; }
  .hint { color: var(--muted); font-size: .85rem; }
</style>
