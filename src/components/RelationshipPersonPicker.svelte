<script lang="ts">
  import { untrack } from 'svelte';
  import type { GraphNode } from '../lib/types';
  import { searchRelationshipPeople } from '../lib/relationshipPath';
  import { relationshipIdentity } from '../lib/relationshipIdentity';
  let { id, label, nodes, value = $bindable(''), disabled = false, onchange }: {
    id: string; label: string; nodes: GraphNode[]; value?: string; disabled?: boolean; onchange?: () => void;
  } = $props();
  let query = $state('');
  let open = $state(false);
  let active = $state(0);
  const selected = $derived(nodes.find(n => n.key === value));
  const allMatches = $derived(searchRelationshipPeople(nodes, query));
  const matches = $derived(allMatches.slice(0, 10));
  const expanded = $derived(open && query.trim().length > 0 && !selected);
  $effect(() => {
    const person = selected;
    if (person) { query = person.name; open = false; }
    else if (!untrack(() => open)) query = '';
  });
  function choose(node: GraphNode) {
    value = node.key; query = node.name; open = false; active = 0; onchange?.();
  }
  function inputChanged(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    open = true; value = ''; active = 0; onchange?.();
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Escape') { open = false; return; }
    if (!expanded || !matches.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') { event.preventDefault(); choose(matches[active]); }
  }
</script>
<div class="picker">
  <label for={id}>{label}</label>
  <input id={id} class="form-control" type="text" role="combobox" autocomplete="off" spellcheck="false"
    placeholder="輸入姓名，選擇人物" {disabled} value={query}
    aria-expanded={expanded} aria-controls={`${id}-options`} aria-autocomplete="list"
    aria-activedescendant={expanded && matches.length ? `${id}-option-${active}` : undefined}
    aria-describedby={`${id}-identity`}
    oninput={inputChanged} onkeydown={keydown} onfocus={() => { if (!selected) open = true; }} onblur={() => { open = false; }} />
  <p id={`${id}-identity`} class:selected class="identity">{selected ? relationshipIdentity(selected) : '請從搜尋結果選取；同名者依身分區分。'}</p>
  {#if expanded}
    <div class="suggestions">
      <ul id={`${id}-options`} role="listbox" aria-label={`${label}搜尋結果`}>
        {#each matches as node, i}
          <li role="presentation"><button id={`${id}-option-${i}`} type="button" role="option" aria-selected={i === active} tabindex="-1"
            onpointerdown={e => e.preventDefault()} onclick={() => choose(node)} onpointermove={() => { active = i; }}>
            <strong>{node.name}</strong><span>{relationshipIdentity(node)}</span>
          </button></li>
        {/each}
      </ul>
      {#if !matches.length}<p class="empty-search" role="status">本站尚未收錄這個姓名。可試試完整姓名或其他人物。</p>
      {:else if allMatches.length > 10}<p class="empty-search">顯示前 10 筆，請多輸入幾個字縮小範圍。</p>{/if}
    </div>
  {/if}
</div>
<style>
  .picker { position:relative;min-width:0; }
  label { display:block;font-size:13px;font-weight:700;margin-bottom:8px; }
  input { font-size:16px !important;height:48px !important; }
  input:disabled { opacity:.5;cursor:wait; }
  .identity { font-size:11px;color:var(--muted);line-height:1.65;min-height:1.65em;margin:8px 0 0;overflow-wrap:anywhere; }
  .identity.selected { color:var(--fg); }
  .suggestions { position:absolute;z-index:4;top:78px;left:0;right:0;border:1px solid var(--line-strong);background:var(--surface); }
  ul { padding:0;margin:0;list-style:none;max-height:280px;overflow-y:auto; }
  button { display:block;width:100%;min-height:52px;padding:10px 12px;text-align:left;border:0;border-bottom:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer; }
  button[aria-selected="true"] { background:var(--row-hover);box-shadow:inset 3px 0 var(--accent); }
  button strong { font-family:var(--serif);font-size:17px;display:block; }
  button span { display:block;font-size:11px;color:var(--muted);line-height:1.6;margin-top:3px; }
  .empty-search { font-size:12px;line-height:1.7;color:var(--muted);padding:12px;margin:0; }
</style>
