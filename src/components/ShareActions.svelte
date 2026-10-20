<script lang="ts">
  import { onMount } from 'svelte';
  import { pageShareUrl } from '../lib/share';
  let { title, url, imageUrl, imageName = '政治人物背景資料庫.png', currentState = false }:
    { title: string; url: string; imageUrl?: string; imageName?: string; currentState?: boolean } = $props();
  let ready = $state(false);
  let canShare = $state(false);
  let message = $state('');
  let manualUrl = $state('');
  let busy = $state(false);
  onMount(() => { ready = true; canShare = typeof navigator.share === 'function'; });
  $effect(() => { url; message = ''; manualUrl = ''; });
  const href = () => pageShareUrl(new URL(url, window.location.origin).href, currentState ? window.location.href : undefined);
  async function copy() {
    message = ''; manualUrl = '';
    const value = href();
    try {
      await navigator.clipboard.writeText(value);
      message = '已複製連結';
    } catch {
      manualUrl = value;
      message = '可選取下方網址複製';
    }
  }
  async function share() {
    if (busy) return;
    busy = true; message = ''; manualUrl = '';
    try { await navigator.share({ title, url: href() }); }
    catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        message = '無法開啟分享，可改用複製連結';
      }
    } finally { busy = false; }
  }
</script>

<div class="share-actions" aria-label="分享此頁">
  {#if ready}
    {#if canShare}<button type="button" onclick={share} disabled={busy}>分享</button>{/if}
    <button type="button" onclick={copy}>複製連結</button>
  {/if}
  {#if imageUrl}<a href={imageUrl} download={imageName}>下載圖卡</a>{/if}
  <span class="status" role="status">{message}</span>
  {#if manualUrl}
    <label class="manual">分享網址<input class="form-control" readonly value={manualUrl} onfocus={event => event.currentTarget.select()} /></label>
  {/if}
</div>

<style>
  .share-actions { display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0 20px; }
  button,a { display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;background:var(--surface);border:1px solid var(--control-border);border-radius:0;color:var(--muted);font:400 13px var(--sans);text-decoration:none;cursor:pointer; }
  button:hover,a:hover { color:var(--fg);background:var(--row-hover); }
  button:focus-visible,a:focus-visible { outline:2px solid var(--accent);outline-offset:2px; }
  button:disabled { cursor:default;opacity:.5; }
  .status { color:var(--muted);font-size:12px; }
  .manual { display:grid;gap:5px;width:100%;font-size:12px;color:var(--muted); }
  input { width:100%;min-width:0; }
</style>
