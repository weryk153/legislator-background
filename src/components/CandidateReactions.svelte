<script lang="ts">
  import { onMount } from 'svelte';
  import { reactionStore } from '../lib/reactionClient';

  let { candidate, name }: { candidate: string; name: string } = $props();
  const store = reactionStore(candidate);
  const fmt = (count: number | undefined) => count === undefined ? '—' : count.toLocaleString('en-US');
  let announcement = $state('');

  async function choose(choice: -1 | 1) {
    await store.choose(choice);
    if (!$store.error) announcement = $store.data?.choice === 1 ? '已支持，再按一次可取消。'
      : $store.data?.choice === -1 ? '已選擇不支持，再按一次可取消。' : '已取消表態。';
  }
  onMount(() => {
    void store.refresh();
    const refresh = () => { if (document.visibilityState === 'visible') void store.refresh(); };
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('civic-reactions') : null;
    if (channel) channel.onmessage = event => { if (event.data === candidate) void store.refresh(true); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      channel?.close();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  });
</script>

<div class="reactions" data-reaction-candidate={candidate} data-nosnippet>
  <div class="buttons" role="group" aria-label={`對${name}的表態`} aria-busy={$store.pending}>
    <button
      type="button" class:chosen={$store.data?.choice === 1}
      aria-pressed={$store.data?.choice === 1}
      aria-label={`支持${name}，${$store.data ? `累計 ${fmt($store.data.support)} 票` : '票數載入中'}`}
      title={$store.data?.choice === 1 ? '已支持，再按一次取消' : '支持'}
      disabled={!$store.data || $store.pending} onclick={() => choose(1)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.25 3.75Q12 3 12.75 3.75L20 11Q21 12 19.5 12H17Q16 12 16 13V19.5Q16 21 14.5 21H9.5Q8 21 8 19.5V13Q8 12 7 12H4.5Q3 12 4 11Z" /></svg>
      <span class="count">{fmt($store.data?.support)}</span>
    </button>
    <button
      type="button" class:chosen={$store.data?.choice === -1}
      aria-pressed={$store.data?.choice === -1}
      aria-label={`不支持${name}，${$store.data ? `累計 ${fmt($store.data.oppose)} 票` : '票數載入中'}`}
      title={$store.data?.choice === -1 ? '已選擇不支持，再按一次取消' : '不支持'}
      disabled={!$store.data || $store.pending} onclick={() => choose(-1)}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path transform="rotate(180 12 12)" d="M11.25 3.75Q12 3 12.75 3.75L20 11Q21 12 19.5 12H17Q16 12 16 13V19.5Q16 21 14.5 21H9.5Q8 21 8 19.5V13Q8 12 7 12H4.5Q3 12 4 11Z" /></svg>
      <span class="count">{fmt($store.data?.oppose)}</span>
    </button>
  </div>
  <a class="notice" href="/about/#reactions">訪客表態・非民調</a>
  {#if $store.error}
    <p class="error" role="status">{$store.error} <button type="button" class="retry" disabled={$store.pending} onclick={() => store.refresh(true)}>重試</button></p>
  {/if}
  <span class="sr-only" role="status">{announcement}</span>
  <noscript><p class="notice">啟用 JavaScript 後可查看票數與表態。</p></noscript>
</div>

<style>
  .reactions { margin:8px 0 4px;position:relative;z-index:1;display:flex;flex-wrap:wrap;align-items:center;gap:0 12px; }
  .buttons { display:flex;align-items:center;gap:8px; }
  .buttons button { display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:56px;min-height:60px;padding:7px 12px;border:1.5px solid var(--fg);border-radius:10px;background:transparent;color:var(--fg);font:600 14px/1.2 var(--sans);cursor:pointer;transition:background var(--ease),color var(--ease); }
  .buttons button:not(:disabled):hover { background:var(--row-hover); }
  .buttons button.chosen, .buttons button.chosen:not(:disabled):hover { background:var(--fg);color:var(--bg); }
  .buttons button:focus-visible { outline:2px solid var(--fg);outline-offset:3px; }
  .buttons button:disabled { cursor:default;opacity:.55; }
  .buttons svg { flex:none; }
  .count { font-variant-numeric:tabular-nums;min-width:1ch;white-space:nowrap; }
  .notice { display:inline-block;color:var(--faint);font-size:10px;line-height:1.6;text-underline-offset:3px; }
  a.notice:hover { color:var(--muted);text-decoration:underline; }
  .error { flex-basis:100%;color:var(--muted);font-size:12px;line-height:1.7;margin:5px 0;max-width:32em; }
  .retry { border:0;background:none;color:var(--fg);text-decoration:underline;text-underline-offset:3px;padding:4px;font:inherit;cursor:pointer; }
</style>
