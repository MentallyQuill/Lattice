<script lang="ts">
    import { onDestroy, onMount, tick } from 'svelte';
    import { FAMILY_PALETTE, PALETTE_GROUPS, paletteForOperation } from '../src/ui/node-palette.js';
    import { beginNodeHold } from '../src/ui/node-hold.js';
    import type { WorkflowView } from './types';
    type ShelfChoice = { id: string; label: string; family: string; phase: string; shortcode?: string; purpose?: string; searchAliases?: readonly string[]; disabledReason?: string; definitionRef?: { id: string; version: number; semanticHash: string } };
    type ClientPoint = { x: number; y: number };
    let { view, insertionContextKey, choices = [], choose, shelfSubgraph, readOnly = false }: { view?: WorkflowView; insertionContextKey?: string; choices?: readonly ShelfChoice[]; choose?: (id: string, at?: ClientPoint) => void; shelfSubgraph?: (id: string, action: 'delete' | 'open') => void; readOnly?: boolean } = $props();
    let shelf: HTMLElement;
    let menuPanel = $state<HTMLDivElement>(null!);
    let family = $state(''), search = $state(false), query = $state('');
    let compact = $state(false), x = $state(0), y = $state(0);
    let visited = $state<string[]>([]);
    let anchor: HTMLButtonElement | null = null;
    let opening = 0;
    let subgraphMenu = $state<{ id: string; title: string; x: number; y: number } | null>(null);
    let subgraphPanel = $state<HTMLDivElement>(null!);
    let subgraphAnchor: HTMLButtonElement | null = null;
    const names = FAMILY_PALETTE.map(item => item.name);
    const familyColor = (name: string) => FAMILY_PALETTE.find(item => item.name === name)?.color;
    type Entry = { id: string; title: string; compatible: boolean; phase: string; family: string; shortcode: string; icon: string; group?: string; purpose?: string; searchAliases?: readonly string[]; disabledReason?: string; definitionRef?: { id: string; version: number; semanticHash: string } };
    let gesture: { entry: Entry; pointerId: number; button: HTMLButtonElement; start: ClientPoint; point: ClientPoint } | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let suppressedButton: HTMLButtonElement | null = null;
    let dragPreview = $state<{ title: string; family: string; x: number; y: number } | null>(null);
    let releaseNodeHold: (() => void) | null = null;
    function endGesture() {
        if (holdTimer !== null) clearTimeout(holdTimer);
        holdTimer = null;
        const previous = gesture; gesture = null; dragPreview = null;
        releaseNodeHold?.(); releaseNodeHold = null;
        document.body.classList.remove('pc-shelf-dragging');
        if (previous?.button.hasPointerCapture?.(previous.pointerId)) previous.button.releasePointerCapture(previous.pointerId);
    }
    function beginDrag() {
        if (!gesture) return;
        if (holdTimer !== null) clearTimeout(holdTimer);
        holdTimer = null; suppressedButton = gesture.button;
        document.body.classList.add('pc-shelf-dragging');
        dragPreview = { title: gesture.entry.title, family: gesture.entry.family, ...gesture.point };
    }
    function pointerDown(event: PointerEvent, entry: Entry) {
        if (event.button !== 0 || event.isPrimary === false || gesture || readOnly || !buildEntries(entry.family).find(item => item.id === entry.id)?.compatible) return;
        const button = event.currentTarget as HTMLButtonElement;
        suppressedButton = null;
        gesture = { entry, pointerId: event.pointerId, button, start: { x: event.clientX, y: event.clientY }, point: { x: event.clientX, y: event.clientY } };
        button.setPointerCapture?.(event.pointerId);
        releaseNodeHold = beginNodeHold(button.ownerDocument, event);
        holdTimer = setTimeout(beginDrag, 180);
    }
    function pointerMove(event: PointerEvent) {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        gesture.point = { x: event.clientX, y: event.clientY };
        if (!dragPreview && Math.hypot(event.clientX - gesture.start.x, event.clientY - gesture.start.y) >= 5) beginDrag();
        if (dragPreview) { event.preventDefault(); dragPreview = { ...dragPreview, ...gesture.point }; }
    }
    function pointerUp(event: PointerEvent) {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const entry = gesture.entry, dragging = !!dragPreview;
        const hit = dragging ? document.elementFromPoint(event.clientX, event.clientY) : null;
        const canvas = shelf.closest('.pc-canvas-area')?.querySelector('.pc-canvas-host');
        endGesture();
        if (!dragging) return;
        event.preventDefault(); event.stopPropagation();
        if (hit && canvas?.contains(hit)) select(entry, { x: event.clientX, y: event.clientY });
    }
    function clickEntry(event: MouseEvent, entry: Entry) {
        if (event.currentTarget === suppressedButton && event.detail !== 0) { suppressedButton = null; return; }
        select(entry);
    }
    function buildEntries(name: string): Entry[] {
        const canonical = new Map<string, { choice: ShelfChoice; aliases: string[] }>();
        for (const choice of choices.filter(entry => entry.family === name)) {
            const operation = choice.id.startsWith('operation:') ? choice.id.split(':')[1] : '';
            const key = operation ? 'operation:' + operation : choice.id;
            const previous = canonical.get(key);
            const aliases = [choice.label, choice.id, choice.purpose ?? '', choice.shortcode ?? '', ...(choice.searchAliases ?? [])];
            if (!previous) canonical.set(key, { choice, aliases });
            else {
                previous.aliases.push(...aliases);
                if (choice.id === key) previous.choice = choice;
            }
        }
        return [...canonical.values()].map(({ choice, aliases }) => {
            const operation = choice.id.startsWith('operation:') ? choice.id.split(':')[1] : '';
            const metadata = paletteForOperation(operation);
            const title = operation ? choice.label.split(' · ')[0] : choice.label;
            const boundary = choice.id.startsWith('boundary:');
            return { ...choice, title, compatible: !choice.disabledReason && !!choose, shortcode: operation ? metadata.shortcode || choice.shortcode || '' : choice.shortcode ?? metadata.shortcode, group: name === 'Subgraphs' ? boundary ? 'Interface' : 'Library' : undefined, icon: name === 'Subgraphs' ? boundary ? paletteForOperation('subgraph-' + choice.id.split(':')[1]).icon : PALETTE_GROUPS.Library.icon : metadata.icon, searchAliases: aliases };
        });
    }
    // Browsing changes the active family, not the catalog. Prepare its display data only when props change.
    const preparedEntries = $derived(new Map(names.map(name => [name, buildEntries(name)])));
    function entries(name = family): Entry[] { return preparedEntries.get(name) ?? []; }
    type MenuSize = { width: number; height: number; firstHeight: number; firstOffset: number };
    type CachedSize = MenuSize & { paneWidth: number; paneHeight: number; anchorWidth: number; compact: boolean };
    const sizes = new Map<string, CachedSize>();
    function invalidateSizes() { sizes.clear(); }
    // Svelte keeps owning the rows while inactive families are detached from layout, focus, and menu queries.
    function attachEntries(node: HTMLDivElement, target: HTMLDivElement | null) {
        function update(next: HTMLDivElement | null) { if (next) next.append(node); else node.remove(); }
        update(target);
        return { update, destroy() { node.remove(); } };
    }
    function closeSubgraph(restore = false) { subgraphMenu = null; if (restore) subgraphAnchor?.focus({ preventScroll: true }); }
    function close(restore = false) { endGesture(); opening++; family = ''; search = false; closeSubgraph(); if (restore) anchor?.focus({ preventScroll: true }); }
    let previousContext: { scope: string | undefined; catalog: string; locked: boolean } | undefined;
    $effect(() => {
        const scope = JSON.stringify([insertionContextKey, view?.graphId]), locked = readOnly;
        const catalog = JSON.stringify(names.flatMap(name => entries(name).map(entry => [
            entry.id, entry.title, entry.compatible, entry.phase, entry.family, entry.shortcode,
            entry.icon, entry.group, entry.purpose, entry.searchAliases, entry.disabledReason,
            entry.definitionRef?.id, entry.definitionRef?.version, entry.definitionRef?.semanticHash,
        ])));
        // Document and camera refreshes can replace equal props without changing the insertion context.
        if (previousContext && (scope !== previousContext.scope || catalog !== previousContext.catalog || locked !== previousContext.locked)) { invalidateSizes(); close(); }
        previousContext = { scope, catalog, locked };
    });
    onMount(() => {
        document.addEventListener('pc-theme', invalidateSizes);
        document.fonts?.addEventListener('loadingdone', invalidateSizes);
        return () => {
            document.removeEventListener('pc-theme', invalidateSizes);
            document.fonts?.removeEventListener('loadingdone', invalidateSizes);
        };
    });
    onDestroy(() => { close(); invalidateSizes(); });
    function bounds() {
        const area = shelf.closest('.pc-canvas-area') as HTMLElement, rect = area.getBoundingClientRect();
        return { left: rect.left + area.clientLeft, top: rect.top + area.clientTop, right: rect.right - area.clientLeft, width: area.clientWidth, height: area.clientHeight };
    }
    function position(rect: Pick<DOMRect, 'top' | 'left' | 'right'>, width: number, height: number, parentWidth: number, pane = bounds()) {
        const roomRight = pane.right - rect.right - 6, roomLeft = rect.left - pane.left - 6;
        const fits = roomRight >= width || roomLeft >= width;
        const left = roomRight >= width ? rect.right - pane.left + 3 : roomLeft >= width ? rect.left - pane.left - width - 3 : 13;
        return { x: Math.max(4, Math.min(left, pane.width - width - 4)), y: Math.max(4, Math.min(rect.top - pane.top, pane.height - height - 4)), compact: !fits || pane.width < width + parentWidth + 26 };
    }
    function measureMenu(panel: HTMLDivElement): MenuSize {
        const size = panel.getBoundingClientRect();
        const first = panel.querySelector('button')?.getBoundingClientRect();
        return { width: size.width, height: size.height, firstHeight: first?.height ?? 0, firstOffset: first ? first.top - size.top + panel.scrollTop : 0 };
    }
    function placeMenu(rect: DOMRect, size: MenuSize, pane: ReturnType<typeof bounds>) {
        const top = size.firstHeight ? rect.top + (rect.height - size.firstHeight) / 2 - size.firstOffset : rect.top;
        const spot = position({ top, left: rect.left, right: rect.right }, size.width, size.height, rect.width, pane);
        x = spot.x; y = spot.y; compact = spot.compact;
    }
    async function open(name: string, button: HTMLButtonElement, focus = true) {
        if (gesture) return;
        closeSubgraph();
        if (family === name) { if (focus) menuPanel?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); return; }
        const request = ++opening;
        // Read clean anchor/pane geometry before changing the drawer contents. Warm hovers need no drawer measurement or deferred positioning.
        let rect = button.getBoundingClientRect(), pane = bounds();
        const cached = sizes.get(name);
        const warm = cached && cached.paneWidth === pane.width && cached.paneHeight === pane.height && cached.anchorWidth === rect.width;
        if (menuPanel) menuPanel.scrollTop = 0;
        if (warm) { compact = cached.compact; placeMenu(rect, cached, pane); }
        if (!visited.includes(name)) visited.push(name);
        family = name; search = false; anchor = button;
        if (warm && !focus) return;
        await tick();
        if (request !== opening || family !== name || !menuPanel?.isConnected) return;
        if (!warm) {
            rect = button.getBoundingClientRect(); pane = bounds();
            let size = measureMenu(menuPanel), previousCompact = compact;
            placeMenu(rect, size, pane);
            // The compact back row changes the measured height and the first row's offset.
            if (previousCompact !== compact) {
                await tick();
                if (request !== opening || family !== name || !menuPanel?.isConnected) return;
                rect = button.getBoundingClientRect(); pane = bounds(); size = measureMenu(menuPanel);
                placeMenu(rect, size, pane);
            }
            sizes.set(name, { ...size, paneWidth: pane.width, paneHeight: pane.height, anchorWidth: rect.width, compact });
        }
        if (focus) menuPanel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    }
    export async function openSearch() {
        const request = ++opening; family = ''; search = true; query = ''; await tick();
        if (request !== opening || !search || !menuPanel?.isConnected) return;
        const pane = bounds(), rect = shelf.getBoundingClientRect(), size = menuPanel.getBoundingClientRect();
        x = Math.max(4, Math.min(rect.right - pane.left + 3, pane.width - size.width - 4)); y = rect.top - pane.top;
        menuPanel.querySelector<HTMLInputElement>('input')?.focus();
    }
    function select(entry: Entry, at?: ClientPoint) {
        const current = buildEntries(entry.family).find(item => item.id === entry.id);
        if (!current?.compatible || readOnly) return;
        close(true);
        if (at) choose?.(current.id, at);
        else choose?.(current.id);
    }
    async function openSubgraph(button: HTMLButtonElement, point?: { x: number; y: number }) {
        const entry = buildEntries('Subgraphs').find(item => item.id === button.dataset.shelfChoice);
        if (!entry?.definitionRef || !shelfSubgraph) return;
        const pane = bounds(), rect = button.getBoundingClientRect();
        subgraphAnchor = button; subgraphMenu = { id: entry.id, title: entry.title, x: (point?.x ?? rect.right) - pane.left, y: (point?.y ?? rect.top) - pane.top };
        await tick();
        if (!subgraphMenu || subgraphMenu.id !== entry.id || !subgraphPanel?.isConnected) return;
        const size = subgraphPanel.getBoundingClientRect();
        subgraphMenu = { ...subgraphMenu, x: Math.max(4, Math.min(subgraphMenu.x, pane.width - size.width - 4)), y: Math.max(4, Math.min(subgraphMenu.y, pane.height - size.height - 4)) };
        subgraphPanel.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }
    function contextMenu(event: MouseEvent) {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-shelf-choice]');
        if (!button || !buildEntries('Subgraphs').some(entry => entry.id === button.dataset.shelfChoice && entry.definitionRef) || !shelfSubgraph) return;
        event.preventDefault(); event.stopPropagation(); void openSubgraph(button, { x: event.clientX, y: event.clientY });
    }
    function subgraphAction(action: 'delete' | 'open') {
        const entry = buildEntries('Subgraphs').find(item => item.id === subgraphMenu?.id);
        close(true);
        if (entry?.definitionRef) shelfSubgraph?.(entry.id, action);
    }
    function keys(event: KeyboardEvent) {
        if ((event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) && (event.target as HTMLElement).dataset.shelfChoice) { event.preventDefault(); event.stopPropagation(); void openSubgraph(event.target as HTMLButtonElement); return; }
        if (subgraphMenu && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSubgraph(true); return; }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
        const target = event.target as HTMLButtonElement;
        if (event.key === 'ArrowRight' && target.dataset.family && !target.disabled) { event.preventDefault(); event.stopPropagation(); open(target.dataset.family, target); return; }
        if (event.key === 'ArrowLeft' && family) { event.preventDefault(); event.stopPropagation(); close(true); return; }
        if (event.key === 'Tab') { close(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || (event.target as HTMLElement).tagName === 'INPUT') return;
        event.preventDefault(); const panel = (event.target as HTMLElement).closest('[role="menu"]') || shelf;
        const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }
</script>
<svelte:window onpointerdown={(event) => { if (!(event.target as HTMLElement).closest('.pc-node-shelf, .pc-shelf-menu')) close(); }} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => endGesture()} onblur={() => close()} onresize={() => { invalidateSizes(); close(); }} onkeydown={(event) => { if (gesture && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } }} />
<nav class={`pc-node-shelf${compact && family ? ' pc-shelf-replaced' : ''}`} aria-label="Node families" bind:this={shelf}>
    {#each FAMILY_PALETTE as item}
        <button type="button" data-family={item.name} class="pc-family-row" style:--pc-family={item.color} disabled={!entries(item.name).length} title={'Browse ' + item.name + ' nodes'} aria-haspopup="menu" aria-expanded={family === item.name} onclick={(event) => open(item.name, event.currentTarget)} onpointerenter={(event) => { if (event.pointerType !== 'touch' && !event.currentTarget.disabled) open(item.name, event.currentTarget, false); }} onkeydown={keys}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d={item.icon} /></svg><span>{item.name}</span>
        </button>
    {/each}
</nav>
{#snippet rows(shown: Entry[], searching: boolean)}
        {#each shown as entry, index (entry.family + entry.id)}
            {@const insertionDisabled = !entry.compatible || readOnly}
            {@const hasActions = !!entry.definitionRef && !!shelfSubgraph}
            {@const reason = readOnly ? hasActions ? 'This graph is read-only. Right-click for subgraph actions.' : 'This graph is read-only.' : entry.disabledReason || (!entry.compatible ? 'Choose a graph in the ' + entry.phase + ' stage to add this node.' : '')}
            {#if !searching && entry.group && shown[index - 1]?.group !== entry.group}<div class="pc-shelf-group" role="presentation" data-shelf-group={entry.group}>{entry.group}</div>{/if}
            <button type="button" role="menuitem" data-shelf-choice={entry.id} data-insertion-disabled={insertionDisabled} style:--pc-family={familyColor(entry.family)} disabled={insertionDisabled && !hasActions} aria-disabled={insertionDisabled && !hasActions} aria-haspopup={hasActions ? 'menu' : undefined} title={reason || entry.purpose || 'Add ' + entry.title} onpointerdown={(event) => pointerDown(event, entry)} onlostpointercapture={() => endGesture()} onclick={(event) => clickEntry(event, entry)}><svg class="pc-leaf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={entry.icon} /></svg><span class="pc-catalog-name">{entry.title}{#if reason}<span class="pc-shelf-reason">{reason}</span>{/if}</span><small>{entry.shortcode}</small></button>
        {:else}<p class="pc-shelf-empty">{searching ? 'No nodes match your search. Try another name or clear the search.' : 'No nodes are available in this family for the current graph.'}</p>{/each}
{/snippet}
{#if family || search}
    <!-- Moving the measured drawer with a transform avoids a second layout on every family hover. -->
    <div class={`pc-shelf-menu ${search ? 'pc-leaf-menu' : 'pc-family-menu'}`} role="menu" tabindex="-1" aria-label={search ? 'Search nodes' : family + ' nodes'} bind:this={menuPanel} style:left="0px" style:top="0px" style:transform={`translate(${x}px, ${y}px)`} style:--pc-family={familyColor(family)} onkeydown={keys} oncontextmenu={contextMenu}>
        {#if compact && family}<button type="button" role="menuitem" onclick={() => close(true)}>‹ Families</button>{/if}
        {#if search}
            <input class="text_pole" aria-label="Search nodes" placeholder="Search nodes…" bind:value={query} />
            {@render rows(names.flatMap(name => entries(name)).filter(entry => [entry.title, entry.id, entry.family, entry.purpose, entry.shortcode, ...(entry.searchAliases ?? [])].join(' ').toLowerCase().includes(query.toLowerCase())), true)}
        {/if}
    </div>
{/if}
{#each names as name}
    {#if visited.includes(name)}
        <div class="pc-shelf-entries" use:attachEntries={family === name ? menuPanel : null}>{@render rows(entries(name), false)}</div>
    {/if}
{/each}
{#if subgraphMenu}
    <div class="pc-shelf-menu pc-shelf-subgraph-menu" role="menu" tabindex="-1" aria-label={subgraphMenu.title + ' actions'} bind:this={subgraphPanel} style:left={`${subgraphMenu.x}px`} style:top={`${subgraphMenu.y}px`} onkeydown={keys}>
        <button type="button" role="menuitem" data-shelf-subgraph-action="open" onclick={() => subgraphAction('open')}>Open saved definition</button>
        <button type="button" role="menuitem" data-shelf-subgraph-action="delete" onclick={() => subgraphAction('delete')}>Delete</button>
    </div>
{/if}
{#if dragPreview}<div class="pc-shelf-drag-preview" aria-hidden="true" style:--pc-family={familyColor(dragPreview.family)} style:left={`${dragPreview.x + 12}px`} style:top={`${dragPreview.y + 12}px`}>{dragPreview.title}</div>{/if}
<style>
    .pc-shelf-entries { display: contents; }
    .pc-shelf-reason { display: block; white-space: normal; font-size: 10px; line-height: 1.4; font-weight: normal; color: var(--pc-muted, #a1a59b); }
    .pc-shelf-empty { margin: 8px; color: var(--pc-muted, #a1a59b); font-size: 11px; line-height: 1.5; }
    .pc-shelf-group { padding: 5.6px 7.2px 2.4px; color: #a0aaa6; font-size: 8px; }
    .pc-shelf-subgraph-menu { z-index: 40; min-width: 136px; }
    [aria-disabled="true"] { opacity: .5; }
    [data-shelf-choice][data-insertion-disabled="false"] { cursor: grab; touch-action: none; }
    [data-insertion-disabled="true"][aria-haspopup="menu"] { cursor: context-menu; }
    :global(body.pc-shelf-dragging), :global(body.pc-shelf-dragging *) { cursor: grabbing !important; }
    .pc-shelf-drag-preview { position: fixed; z-index: 100; pointer-events: none; padding: 6.4px 9.6px; border: 1px solid var(--pc-family); border-radius: 3.2px; background: var(--pc-block); color: var(--pc-family); font-size: 9.6px; box-shadow: 0 2.4px 9.6px #0006; }
</style>
