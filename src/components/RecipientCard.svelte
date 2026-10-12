<script lang="ts">
  import type { RankedRecipient } from '../lib/donorFilter';
  import { partyEmblem } from '../lib/partyEmblems';
  export let entry: RankedRecipient;
  export let rank: number;
  const fmt = (n: number) => new Intl.NumberFormat('zh-Hant').format(n);
  $: emblem = entry.party ? partyEmblem(entry.party) : null;
</script>

<details class="recipient-card">
  <summary>
    <span class="rank num">{String(rank).padStart(2, '0')}</span>
    <span class="identity"><strong>{entry.name}</strong><span class="party">{#if emblem}<img src={emblem} alt="" width="16" height="16" />{/if}{entry.party ?? '此筆受贈紀錄未連結現任者資料'}</span><span class="election">{entry.election}</span></span>
    <span class="metric count"><span class="label">捐贈企業</span><span><b class="num">{entry.count}</b> 家</span></span>
    <span class="metric amount"><span class="label">企業受贈總額</span><span class="num"><small>NT$</small> <b>{fmt(entry.total)}</b></span></span>
    <span class="expand" aria-hidden="true"></span>
  </summary>
  <div class="details-body">
    <div class="detail-head"><p>捐贈企業依金額排序，同統編合併計算。</p>{#if entry.slug}<a href={`/officials/${entry.slug}/`}>查看 {entry.name} 個人資料 ↗</a>{/if}</div>
    <ul>{#each entry.donors as donor}
      <li><span><strong>{donor.name}</strong><span class="uid">{donor.uid.startsWith('name:') ? '統一編號未收錄' : `統編 ${donor.uid}`}</span></span><span class="donation num">NT$ {fmt(donor.amount)}</span></li>
    {/each}</ul>
  </div>
</details>

<style>
  .recipient-card { border-bottom: 1px solid var(--line); }
  summary { display: flex; align-items: center; gap: 20px; padding: 20px 16px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary:hover, details[open] summary { background: var(--row-hover); }
  summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  details[open] summary { border-bottom: 1px solid var(--fg); }
  .rank { flex: 0 0 34px; color: var(--accent); font-family: var(--serif); font-size: 24px; font-weight: 900; }
  .identity { flex: 1; min-width: 0; }
  .identity > strong { display: block; font-family: var(--serif); font-size: 23px; font-weight: 900; overflow-wrap: anywhere; }
  .party { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); margin-top: 4px; }
  .party img { object-fit: contain; }
  .election { display: block; font-size: 12px; color: var(--faint); margin-top: 4px; }
  .metric { display: flex; flex-direction: column; gap: 5px; flex: none; text-align: right; }
  .label { font-size: 11px; color: var(--muted); }
  .count { width: 92px; font-size: 12px; }
  .count b { font-size: 20px; }
  .amount { width: 182px; font-size: 19px; }
  .amount small { color: var(--muted); font-size: 11px; }
  .expand { width: 22px; flex: 0 0 22px; text-align: center; font-size: 22px; }
  .expand::before { content: '+'; }
  details[open] .expand::before { content: '−'; }
  .details-body { padding: 4px 22px 20px 70px; background: var(--surface); }
  .detail-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 16px; padding: 8px 0; font-size: 12px; color: var(--muted); }
  .detail-head p { margin: 4px 0; }
  .detail-head a { margin-left: auto; text-decoration: underline; text-underline-offset: 3px; }
  .detail-head a:hover { color: var(--accent); }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid var(--line); font-size: 14px; }
  li > span:first-child { min-width: 0; overflow-wrap: anywhere; }
  li strong { font-weight: 600; }
  .uid { display: block; font-size: 12px; color: var(--faint); margin-top: 4px; }
  .donation { flex: none; text-align: right; white-space: nowrap; }
  @media (max-width: 760px) {
    summary { flex-wrap: wrap; gap: 12px; padding: 16px 8px; }
    .rank { flex-basis: 24px; font-size: 20px; }
    .identity { flex-basis: calc(100% - 72px); }
    .identity > strong { font-size: 22px; }
    .expand { order: 1; flex-basis: 18px; }
    .count, .amount { order: 2; width: auto; }
    .count { margin-left: 36px; }
    .amount { margin-left: auto; font-size: 17px; }
    .count b { font-size: 17px; }
    .details-body { padding: 4px 12px 16px; }
    .detail-head a { margin-left: 0; }
    li { gap: 12px; font-size: 13px; }
  }
</style>
