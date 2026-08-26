<!-- 地圖側欄。顯示當前選取的行政區，未選取時顯示該層的彙總。
     資料深度必須看得出來：縣市長與縣市議員連得到檔案頁，鄉鎮市長以下只有中選會欄位。 -->
<script lang="ts">
  import { isUnassignedVillage, type MapArea, type MapLayer, type PartySeat } from '../lib/mapTypes';

  let { area, layer }: { area: MapArea | null; layer: MapLayer | null } = $props();

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

  // 村里層「未編定村里」區塊：真實土地但無村里長，不當成一般查無資料處理。
  // 判斷邏輯共用 src/lib/mapTypes.ts 的 isUnassignedVillage，不重複硬寫前綴。
  const isUnedited = $derived(!!area && isUnassignedVillage(area));
</script>

<aside class="side">
  {#if area}
    <h2>{area.name}</h2>

    {#if isUnedited}
      <p class="note">此區塊為未編定村里（無村里長、無資料），非本站漏收。</p>
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
        <p class="party">{area.chief.partyName}</p>
        {#if area.chief.termLimited}
          <p class="limit">{area.chief.termLimitReason}</p>
        {/if}
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
      </section>
    {/if}
  {:else if layer}
    <h2>{layer.parentName}</h2>
    <section>
      <h3>{chiefLabel}政黨分佈（共 {layer.areas.length} 區）</h3>
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
    <p class="hint">點選地圖上的行政區可看細節，再點一次可往下一層。</p>
  {/if}
</aside>

<style>
  .side { font-family: var(--sans); }
  h2 { font-family: var(--serif); margin: 0 0 .6rem; }
  h3 { font-size: .85rem; color: var(--muted); margin: 1rem 0 .35rem; font-weight: 600; }
  .person { font-size: 1.2rem; font-weight: 600; color: var(--accent); text-decoration: none; }
  .person.none { color: var(--muted); }
  .party { margin: .2rem 0 0; color: var(--fg); }
  .note { color: var(--muted); font-size: .85rem; margin: .2rem 0 0; }
  .limit { color: var(--fg); background: var(--surface); padding: .35rem .5rem; border-radius: 4px; font-size: .85rem; }
  .bars { list-style: none; padding: 0; margin: 0; display: grid; gap: .3rem; }
  .bars li { display: grid; grid-template-columns: 7rem 1fr 2.5rem; align-items: center; gap: .4rem; font-size: .85rem; }
  .bar { height: .6rem; background: var(--line-strong); width: var(--w); border-radius: 2px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .hint { color: var(--muted); font-size: .85rem; }
</style>
