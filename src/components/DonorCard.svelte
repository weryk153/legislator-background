<script lang="ts">
  import type { DonorCardEntry } from '../lib/donorFilter';
  export let entry: DonorCardEntry;
  export let rank: number | undefined = undefined;
  const fmt = (n: number) => new Intl.NumberFormat('zh-Hant').format(n);
  const officeName: Record<string, string> = { legislator: '立委', mayor_magistrate: '縣市首長', councilor: '議員', candidate: '參選人' };
</script>

<details class="donor">
  <summary>
    {#if rank !== undefined}<span class="rank num" aria-label={`第 ${rank} 筆`}>{String(rank).padStart(2, '0')}</span>{/if}
    <span class="identity">
      <strong>{entry.donor.name}</strong>
      <span class="uid">{entry.donor.uid.startsWith('name:') ? '統一編號未收錄' : `統編 ${entry.donor.uid}`}</span>
    </span>
    <span class="metric count"><span class="metric-label">現任受贈人數</span><span><b class="num">{entry.view.count}</b> 位</span></span>
    <span class="metric amount"><span class="metric-label">{entry.view.filtered ? '符合篩選金額' : '捐贈總額'}</span><span class="num"><small>NT$</small> <b>{fmt(entry.view.total)}</b></span></span>
    <span class="expand" aria-hidden="true"></span>
  </summary>
  <div class="detail-body">
    <p class="detail-note">{entry.view.filtered ? '僅列符合目前篩選條件的受贈紀錄與金額。' : '以下列出本頁收錄的受贈紀錄，含非本站收錄之現任者。'}<span>點選姓名可查看個人資料。</span></p>
    <ul class="recips">
      {#each entry.view.recipients as recipient}
        <li>
          <div class="recipient">
            {#if recipient.slug}<a href={`/officials/${recipient.slug}/`}>{recipient.name}</a>
            {:else}<span class="plain">{recipient.name}</span>{/if}
            <span class="tag">{recipient.slug ? `${recipient.party ?? ''}${recipient.officeType ? `・${officeName[recipient.officeType] ?? ''}` : ''}` : '非本站收錄之現任者'}</span>
          </div>
          <span class="election">{recipient.election}</span>
          <span class="recipient-amount num">NT$ {fmt(recipient.amount)}</span>
        </li>
      {/each}
    </ul>
  </div>
</details>

<style>
  .donor { border-bottom: 1px solid var(--line); }
  summary { display: flex; gap: 20px; align-items: center; padding: 20px 16px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary:hover { background: var(--row-hover); }
  summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .rank { flex: 0 0 34px; color: var(--accent); font-family: var(--serif); font-size: 24px; font-weight: 900; }
  .identity { flex: 1; min-width: 0; }
  .identity strong { display: block; font-size: 17px; font-weight: 700; overflow-wrap: anywhere; }
  .uid { display: block; margin-top: 5px; color: var(--faint); font-size: 12px; }
  .metric { display: flex; flex-direction: column; gap: 5px; flex: none; text-align: right; }
  .metric-label { color: var(--muted); font-size: 11px; }
  .count { width: 92px; font-size: 12px; }
  .count b { font-size: 20px; }
  .amount { width: 182px; font-size: 19px; }
  .amount small { font-size: 11px; color: var(--muted); }
  .expand { width: 22px; flex: 0 0 22px; text-align: center; font-size: 22px; }
  .expand::before { content: '+'; }
  details[open] .expand::before { content: '−'; }
  details[open] summary { background: var(--row-hover); border-bottom: 1px solid var(--fg); }
  .detail-body { padding: 4px 22px 20px 70px; background: var(--surface); }
  .detail-note { color: var(--muted); font-size: 12px; line-height: 1.7; }
  .detail-note span { display: inline-block; margin-left: .5em; }
  .recips { list-style: none; margin: 0; padding: 0; }
  .recips li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); font-size: 14px; }
  .recipient a { font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
  .recipient a:hover { color: var(--accent); }
  .tag { display: block; font-size: 12px; color: var(--muted); margin-top: 3px; }
  .plain { color: var(--muted); }
  .election { font-size: 12px; color: var(--muted); }
  .recipient-amount { white-space: nowrap; text-align: right; }
  @media (max-width: 760px) {
    summary { gap: 12px; padding: 16px 8px; flex-wrap: wrap; }
    .rank { flex-basis: 24px; font-size: 20px; }
    .identity { flex-basis: calc(100% - 72px); }
    .identity strong { font-size: 16px; }
    .expand { order: 1; flex-basis: 18px; }
    .count, .amount { order: 2; flex-direction: row; align-items: baseline; gap: 8px; width: auto; }
    .count { margin-left: 36px; }
    .amount { margin-left: auto; font-size: 17px; }
    .count b { font-size: 17px; }
    .detail-body { padding: 4px 12px 16px; }
    .recips li { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; }
    .recipient { grid-column: 1; }
    .election { grid-column: 1; grid-row: 2; }
    .recipient-amount { grid-column: 2; grid-row: 1 / 3; font-size: 13px; }
  }
  @media (max-width: 420px) {
    .count, .amount { flex-direction: column; gap: 2px; }
    .detail-note span { display: block; margin-left: 0; }
  }
</style>
