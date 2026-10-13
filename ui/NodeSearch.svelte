<script lang="ts">
    import { tick } from 'svelte';
    import type { NodeSearchActions, NodeSearchView, SearchChoice, SearchPort } from './native-wire-types';
    let { view = null, actions = {} }: { view?: NodeSearchView | null; actions?: NodeSearchActions } = $props();
    const uid = $props.id();
    let popup = $state<HTMLDivElement>();
    let input = $state<HTMLInputElement>();
    let query = $state('');
    let active = $state(0);
    let left = $state(8), top = $state(8);
    let opened: string | number | undefined, openedMode: string | undefined;
    const searchText = (choice: SearchChoice) => [choice.label, choice.family, choice.purpose ?? '', choice.shortcode ?? '', ...(choice.searchAliases ?? [])].join(' ').toLocaleLowerCase();
    let choices = $derived((view?.choices ?? []).filter(choice => searchText(choice).includes(query.toLocaleLowerCase().trim())));
    let items: readonly (SearchChoice | SearchPort)[] = $derived(view?.mode === 'ports' ? view.ports : choices);
    const itemId = (item: SearchChoice | SearchPort) => 'id' in item ? item.id : item.portId;
    const blocked = (item: SearchChoice | SearchPort) => !!view?.readOnly || 'disabledReason' in item && !!item.disabledReason;
    let enabled = $derived(items.filter(item => !blocked(item)));
    let selected = $derived(enabled[Math.min(active, Math.max(0, enabled.length - 1))]);
    const familyColor = (family: string) => ({ Input: '#96ad52', Shaping: '#589aab', Surface: '#92c9ad', Transpose: '#9080b6', Derive: '#b65b9e', Output: '#c96d82', Subgraphs: '#a3aa99' }[family] ?? '#a1a59b');
    function clamp() {
        if (!view || !popup) return;
        const rect = popup.getBoundingClientRect();
        const width = document.documentElement.clientWidth || window.innerWidth;
        const height = document.documentElement.clientHeight || window.innerHeight;
        left = Math.max(8, Math.min(view.screenAnchor.x, width - rect.width - 8));
        top = Math.max(8, Math.min(view.screenAnchor.y, height - rect.height - 8));
    }
    $effect(() => {
        const key = view?.key, mode = view?.mode, anchor = view?.screenAnchor;
        if (key === undefined || !anchor) return;
        const focus = opened !== key || openedMode !== mode;
        if (opened !== key) query = '';
        if (focus) active = 0;
        opened = key; openedMode = mode;
        void tick().then(() => {
            if (view?.key !== key || view.mode !== mode) return;
            clamp();
            if (focus) { if (mode === 'nodes') input?.focus(); else (popup?.querySelector<HTMLButtonElement>('[data-port]:not(:disabled)') ?? popup)?.focus(); }
        });
    });
    function choose(item: SearchChoice | SearchPort | undefined) {
        if (!item || !view || blocked(item)) return;
        if (view.mode === 'ports' && 'portId' in item) actions.choosePort?.(item.portId);
        else if (view.mode === 'nodes' && 'id' in item) actions.choose?.(item.id);
    }
    function contextChanged(event: Event) {
        const checkbox = event.currentTarget as HTMLInputElement;
        if (!view || view.readOnly || !view.origin) { checkbox.checked = !!view?.contextSensitive; return; }
        actions.setContextSensitive?.(checkbox.checked);
    }
    function keydown(event: KeyboardEvent) {
        event.stopPropagation(); // Keep Canvas Delete/Space/Ctrl shortcuts out of text editing.
        if (event.key === 'Escape') { event.preventDefault(); actions.dismiss?.(); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            active = event.key === 'Home' ? 0 : event.key === 'End' ? Math.max(0, enabled.length - 1)
                : enabled.length ? (active + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length : 0;
        } else if (event.key === 'Enter') { event.preventDefault(); choose(selected); }
    }
    $effect(() => {
        if (!view) return;
        const outside = (event: PointerEvent) => { if (popup && !popup.contains(event.target as Node)) actions.dismiss?.(); };
        window.addEventListener('pointerdown', outside, true);
        return () => window.removeEventListener('pointerdown', outside, true);
    });
</script>

<svelte:window onresize={clamp} />
{#if view}
<div class="pc-node-search" role="dialog" aria-label={view.mode === 'ports' ? 'Choose connection port' : 'Add node'} aria-modal="false" tabindex="-1" bind:this={popup} onkeydown={keydown} style:left="{left}px" style:top="{top}px">
    {#if view.mode === 'nodes'}
        <label class="pc-search-field"><input type="search" aria-label="Search nodes and subgraphs" placeholder="Search…" autocomplete="off" bind:this={input} bind:value={query} oninput={() => active = 0} role="combobox" aria-expanded="true" aria-controls={uid + '-results'} aria-activedescendant={selected ? uid + '-item-' + items.indexOf(selected) : undefined} /></label>
        {#if view.origin}<label class="pc-context-check"><input type="checkbox" checked={view.contextSensitive} disabled={view.readOnly} onchange={contextChanged} />Context sensitive</label>{/if}
        {#if view.origin}<span class="pc-search-context">{(view.origin.dir === 'out' ? 'Accepts ' : 'Produces ') + view.origin.kind}</span>{/if}
    {:else}<p class="pc-search-context">Choose the named port to connect.</p>{/if}
    <div class="pc-search-results" id={uid + '-results'} role="listbox" aria-label={view.mode === 'ports' ? 'Compatible ports' : 'Nodes and subgraphs'}>
        {#each items as item (itemId(item))}
            <button type="button" class="pc-search-result" role="option" aria-selected={selected === item} id={uid + '-item-' + items.indexOf(item)} data-choice={'id' in item ? item.id : undefined} data-port={'portId' in item ? item.portId : undefined} disabled={blocked(item)} title={'disabledReason' in item ? item.disabledReason : undefined} onclick={() => choose(item)} onfocus={() => { const index = enabled.indexOf(item); if (index >= 0) active = index; }}>
                <span>{item.label || itemId(item)}{#if 'disabledReason' in item && item.disabledReason}<small style="display:block;white-space:normal">{item.disabledReason}</small>{/if}</span>{' '}<span class="pc-family" style:color={'family' in item ? familyColor(item.family) : undefined}>{'family' in item ? item.family : item.kind}</span>
            </button>
        {:else}<p class="pc-empty">{view.mode === 'ports' ? 'This node has no compatible ports for this connection.' : view.contextSensitive && view.origin ? 'No compatible nodes match. Clear the search or turn off Context sensitive to browse all nodes.' : query.trim() ? 'No nodes match your search. Try another name or clear the search.' : 'No nodes are available in this view.'}</p>{/each}
    </div>
    {#if view.feedback}<p class="pc-feedback" role="status">{view.feedback}</p>{/if}
</div>
{/if}

<style>
    .pc-node-search { position: fixed; z-index: 12; width: 284px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow: auto; box-sizing: border-box; padding: 9px; background: var(--pc-panel-solid); color: var(--pc-text); border: 1px solid var(--pc-border); border-radius: var(--pc-r); box-shadow: 0 8px 28px #0005; font: 400 14px/1.4 var(--pc-font, system-ui, sans-serif); }
    button, input { font: inherit; color: inherit; box-sizing: border-box; border-radius: 2px; }
    button { background: transparent; border: 0; padding: 6px 9px; cursor: pointer; }
    button:hover:enabled, button[aria-selected="true"]:enabled { background: var(--pc-control); }
    button:disabled { opacity: .55; cursor: default; }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    .pc-search-field { display: block; margin: 0; font-size: 12px; }
    input[type="search"] { width: 100%; min-width: 0; background: var(--pc-field); border: 1px solid var(--pc-border); padding: 7px 8px; box-shadow: none; }
    .pc-context-check { display: flex; align-items: center; gap: 7px; margin-top: 9px; min-height: 24px; font-size: 12px; }
    input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--pc-accent); }
    .pc-search-context { display: block; margin: 6px 0 0; font-size: 12px; color: var(--pc-muted); }
    .pc-search-results { margin-top: 8px; max-height: 300px; overflow: auto; }
    .pc-search-result { width: 100%; text-align: left; display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 31px; font-size: 13px; padding: 5px 7px; }
    .pc-search-result > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .pc-family { flex: none; font-size: 11px; color: var(--pc-muted); }
    .pc-empty, .pc-feedback { margin: 10px 0 0; font-size: 12px; color: var(--pc-muted); }
</style>
