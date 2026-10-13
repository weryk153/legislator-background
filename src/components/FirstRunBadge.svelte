<script lang="ts">
  import type { FirstRunEvidence } from '../lib/candidateTypes';
  let { evidence, name, showYear = false, variant = 'inline' }: { evidence?: FirstRunEvidence; name: string; showYear?: boolean; variant?: 'inline' | 'pill' } = $props();
</script>

{#if evidence}
  <a class="first-run" class:profile-pill={variant === 'pill'} href={evidence.source.url} target="_blank" rel="noopener noreferrer"
    title={`${evidence.year} 首次參選公職。${evidence.basis}（${evidence.source.title}）`}
    aria-label={`${name}：${evidence.year} 首次參選公職，查看來源（另開分頁）`}>
    {showYear ? `${evidence.year} 首次參選` : '首次參選'}<span aria-hidden="true">↗</span>
  </a>
{/if}

<style>
  .first-run { display:inline-flex;align-items:center;gap:4px;vertical-align:middle;margin:3px 0 3px 6px;padding:1px 6px;border:1px solid var(--fg);color:var(--fg);background:var(--bg);font:600 11px/1.6 var(--sans);letter-spacing:.02em;white-space:nowrap;text-decoration:none; }
  .first-run.profile-pill { margin:0;padding:1px 7px;font-size:var(--t-xs); }
  .first-run:hover { background:var(--fg);color:var(--bg); }
  .first-run:focus-visible { outline:2px solid var(--accent);outline-offset:3px; }
</style>
