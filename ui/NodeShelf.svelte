<script lang="ts">
    import { onDestroy, tick } from 'svelte';
    import { FAMILY_PALETTE, PALETTE_GROUPS, paletteForOperation } from '../src/ui/node-palette.js';
    import type { WorkflowView } from './types';
    type ShelfChoice = { id: string; label: string; family: string; phase: string; shortcode?: string; purpose?: string; searchAliases?: readonly string[]; disabledReason?: string; definitionRef?: { id: string; version: number; semanticHash: string } };
    type ClientPoint = { x: number; y: number };
    let { view, add, choices, choose, shelfSubgraph, readOnly = false }: { view?: WorkflowView; add: (id: string, at?: ClientPoint) => void; choices?: readonly ShelfChoice[]; choose?: (id: string, at?: ClientPoint) => void; shelfSubgraph?: (id: string, action: 'delete' | 'open') => void; readOnly?: boolean } = $props();
    let shelf: HTMLElement;
    let menuPanel = $state<HTMLDivElement>(null!);
    let family = $state(''), search = $state(false), query = $state('');
    let compact = $state(false), x = $state(0), y = $state(0);
    let anchor: HTMLButtonElement | null = null;
    let opening = 0;
    let subgraphMenu = $state<{ id: string; title: string; x: number; y: number } | null>(null);
    let subgraphPanel = $state<HTMLDivElement>(null!);
    let subgraphAnchor: HTMLButtonElement | null = null;
    const names = FAMILY_PALETTE.map(item => item.name);
    const familyColor = (name: string) => FAMILY_PALETTE.find(item => item.name === name)?.color;
    type Entry = { id: string; title: string; compatible: boolean; phase: string; family: string; shortcode: string; icon: string; group?: string; purpose?: string; searchAliases?: readonly string[]; disabledReason?: string; catalog?: boolean; definitionRef?: { id: string; version: number; semanticHash: string } };
    let gesture: { entry: Entry; pointerId: number; button: HTMLButtonElement; start: ClientPoint; point: ClientPoint } | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let suppressedButton: HTMLButtonElement | null = null;
    let dragPreview = $state<{ title: string; family: string; x: number; y: number } | null>(null);
    function endGesture() {
        if (holdTimer !== null) clearTimeout(holdTimer);
        holdTimer = null;
        const previous = gesture; gesture = null; dragPreview = null;
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
        if (event.button !== 0 || event.isPrimary === false || gesture || readOnly || !entries(entry.family).find(item => item.id === entry.id)?.compatible) return;
        const button = event.currentTarget as HTMLButtonElement;
        suppressedButton = null;
        gesture = { entry, pointerId: event.pointerId, button, start: { x: event.clientX, y: event.clientY }, point: { x: event.clientX, y: event.clientY } };
        button.setPointerCapture?.(event.pointerId);
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
    function entries(name = family): Entry[] {
        if (choices !== undefined) {
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
                return { ...choice, title, compatible: !choice.disabledReason && !!choose, catalog: true, shortcode: operation ? metadata.shortcode || choice.shortcode || '' : choice.shortcode ?? metadata.shortcode, group: name === 'Subgraphs' ? boundary ? 'Interface' : 'Library' : undefined, icon: name === 'Subgraphs' ? boundary ? PALETTE_GROUPS.Routing.icon : PALETTE_GROUPS.Library.icon : metadata.icon, searchAliases: aliases };
            });
        }
        const data = view?.families.find(entry => entry.name === name);
        if (!data) return [];
        return data.operations.filter(entry => name !== 'Surface' || !['pattern-scan', 'validate-patches'].includes(entry.id)).map(entry => ({ ...entry, ...paletteForOperation(entry.id), family: name }));
    }
    function closeSubgraph(restore = false) { subgraphMenu = null; if (restore) subgraphAnchor?.focus({ preventScroll: true }); }
    function close(restore = false) { endGesture(); opening++; family = ''; search = false; closeSubgraph(); if (restore) anchor?.focus({ preventScroll: true }); }
    let previousContext: { scope: string | undefined; catalog: string; locked: boolean } | undefined;
    $effect(() => {
        const scope = view?.graphId, locked = readOnly;
        const catalog = JSON.stringify(names.flatMap(name => entries(name).map(entry => [
            entry.id, entry.title, entry.compatible, entry.phase, entry.family, entry.shortcode,
            entry.icon, entry.group, entry.purpose, entry.searchAliases, entry.disabledReason,
            entry.catalog, entry.definitionRef?.id, entry.definitionRef?.version, entry.definitionRef?.semanticHash,
        ])));
        // Document and camera refreshes can replace equal props without changing the insertion context.
        if (previousContext && (scope !== previousContext.scope || catalog !== previousContext.catalog || locked !== previousContext.locked)) close();
        previousContext = { scope, catalog, locked };
    });
    onDestroy(() => close());
    function bounds() {
        const area = shelf.closest('.pc-canvas-area') as HTMLElement, rect = area.getBoundingClientRect();
        return { left: rect.left + area.clientLeft, top: rect.top + area.clientTop, right: rect.right - area.clientLeft, width: area.clientWidth, height: area.clientHeight };
    }
    function position(rect: Pick<DOMRect, 'top' | 'left' | 'right'>, width: number, height: number, parentWidth: number) {
        const pane = bounds(), roomRight = pane.right - rect.right - 6, roomLeft = rect.left - pane.left - 6;
        const fits = roomRight >= width || roomLeft >= width;
        const left = roomRight >= width ? rect.right - pane.left + 3 : roomLeft >= width ? rect.left - pane.left - width - 3 : 13;
        return { x: Math.max(4, Math.min(left, pane.width - width - 4)), y: Math.max(4, Math.min(rect.top - pane.top, pane.height - height - 4)), compact: !fits || pane.width < width + parentWidth + 26 };
    }
    function menuTop(rect: DOMRect, panel: HTMLDivElement, size: DOMRect) {
        const first = panel.querySelector('button')?.getBoundingClientRect();
        return first ? rect.top + (rect.height - first.height) / 2 - (first.top - size.top) : rect.top;
    }
    async function open(name: string, button: HTMLButtonElement, focus = true) {
        if (gesture) return;
        closeSubgraph();
        if (family === name) { if (focus) menuPanel?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); return; }
        const request = ++opening; family = name; search = false; anchor = button; await tick();
        if (request !== opening || family !== name || !menuPanel?.isConnected) return;
        const rect = button.getBoundingClientRect(), size = menuPanel.getBoundingClientRect(), spot = position({ top: menuTop(rect, menuPanel, size), left: rect.left, right: rect.right }, size.width, size.height, 128);
        x = spot.x; y = spot.y; compact = spot.compact;
        if (focus) menuPanel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    }
    export async function openSearch() {
        const request = ++opening; family = ''; search = true; query = ''; await tick();
        if (request !== opening || !search || !menuPanel?.isConnected) return;
        const pane = bounds(); x = Math.min(136, Math.max(4, pane.width - 254)); y = 13;
        menuPanel.querySelector<HTMLInputElement>('input')?.focus();
    }
    function select(entry: Entry, at?: ClientPoint) {
        const current = entries(entry.family).find(item => item.id === entry.id);
        if (!current?.compatible || readOnly) return;
        close(true);
        if (at) { if (current.catalog) choose?.(current.id, at); else add(current.id, at); }
        else if (current.catalog) choose?.(current.id); else add(current.id);
    }
    async function openSubgraph(button: HTMLButtonElement, point?: { x: number; y: number }) {
        const entry = entries('Subgraphs').find(item => item.id === button.dataset.shelfChoice);
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
        if (!button || !entries('Subgraphs').some(entry => entry.id === button.dataset.shelfChoice && entry.definitionRef) || !shelfSubgraph) return;
        event.preventDefault(); event.stopPropagation(); void openSubgraph(button, { x: event.clientX, y: event.clientY });
    }
    function subgraphAction(action: 'delete' | 'open') {
        const entry = entries('Subgraphs').find(item => item.id === subgraphMenu?.id);
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
<svelte:window onpointerdown={(event) => { if (!(event.target as HTMLElement).closest('.pc-node-shelf, .pc-shelf-menu')) close(); }} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => endGesture()} onblur={() => close()} onresize={() => close()} onkeydown={(event) => { if (gesture && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } }} />
<nav class={`pc-node-shelf${compact && family ? ' pc-shelf-replaced' : ''}`} aria-label="Node families" bind:this={shelf}>
    {#each FAMILY_PALETTE as item}
        <button type="button" data-family={item.name} class="pc-family-row" style:--pc-family={item.color} disabled={!entries(item.name).length} title={'Browse ' + item.name + ' nodes'} aria-haspopup="menu" aria-expanded={family === item.name} onclick={(event) => open(item.name, event.currentTarget)} onpointerenter={(event) => { if (event.pointerType !== 'touch' && !event.currentTarget.disabled) open(item.name, event.currentTarget, false); }} onkeydown={keys}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d={item.icon} /></svg><span>{item.name}</span>
        </button>
    {/each}
</nav>
{#if family || search}
    {@const shown = search ? names.flatMap(name => entries(name)).filter(entry => [entry.title, entry.id, entry.family, entry.purpose, entry.shortcode, ...(entry.searchAliases ?? [])].join(' ').toLowerCase().includes(query.toLowerCase())) : entries()}
    <div class={`pc-shelf-menu ${search ? 'pc-leaf-menu' : 'pc-family-menu'}`} role="menu" tabindex="-1" aria-label={search ? 'Search nodes' : family + ' nodes'} bind:this={menuPanel} style:left={`${x}px`} style:top={`${y}px`} style:--pc-family={familyColor(family)} onkeydown={keys} oncontextmenu={contextMenu}>
        {#if compact && family}<button type="button" role="menuitem" onclick={() => close(true)}>‹ Families</button>{/if}
        {#if search}<input class="text_pole" aria-label="Search nodes" placeholder="Search nodes…" bind:value={query} />{/if}
        {#each shown as entry, index (entry.family + entry.id)}
            {@const insertionDisabled = !entry.compatible || readOnly}
            {@const hasActions = !!entry.definitionRef && !!shelfSubgraph}
            {#if !search && entry.group && shown[index - 1]?.group !== entry.group}<div class="pc-shelf-group" role="presentation" data-shelf-group={entry.group}>{entry.group}</div>{/if}
            <button type="button" role="menuitem" data-shelf-choice={entry.id} data-insertion-disabled={insertionDisabled} style:--pc-family={familyColor(entry.family)} disabled={insertionDisabled && !hasActions} aria-disabled={insertionDisabled && !hasActions} aria-haspopup={hasActions ? 'menu' : undefined} title={readOnly ? hasActions ? 'This graph is read-only. Right-click for subgraph actions.' : 'This graph is read-only.' : entry.disabledReason || (entry.compatible ? entry.purpose || 'Add ' + entry.title : 'Requires the ' + entry.phase + ' phase')} onpointerdown={(event) => pointerDown(event, entry)} onlostpointercapture={() => endGesture()} onclick={(event) => clickEntry(event, entry)}><svg class="pc-leaf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={entry.icon} /></svg><span class="pc-catalog-name">{entry.title}</span><small>{entry.shortcode}</small></button>
        {/each}
    </div>
{/if}
{#if subgraphMenu}
    <div class="pc-shelf-menu pc-shelf-subgraph-menu" role="menu" tabindex="-1" aria-label={subgraphMenu.title + ' actions'} bind:this={subgraphPanel} style:left={`${subgraphMenu.x}px`} style:top={`${subgraphMenu.y}px`} onkeydown={keys}>
        <button type="button" role="menuitem" data-shelf-subgraph-action="open" onclick={() => subgraphAction('open')}>Open saved definition</button>
        <button type="button" role="menuitem" data-shelf-subgraph-action="delete" onclick={() => subgraphAction('delete')}>Delete</button>
    </div>
{/if}
{#if dragPreview}<div class="pc-shelf-drag-preview" aria-hidden="true" style:--pc-family={familyColor(dragPreview.family)} style:left={`${dragPreview.x + 12}px`} style:top={`${dragPreview.y + 12}px`}>{dragPreview.title}</div>{/if}
<style>
    .pc-shelf-group { padding: 7px 9px 3px; color: #a0aaa6; font-size: 10px; }
    .pc-shelf-subgraph-menu { z-index: 40; min-width: 170px; }
    [aria-disabled="true"] { opacity: .5; }
    [data-shelf-choice][data-insertion-disabled="false"] { cursor: grab; touch-action: none; }
    [data-insertion-disabled="true"][aria-haspopup="menu"] { cursor: context-menu; }
    :global(body.pc-shelf-dragging), :global(body.pc-shelf-dragging *) { cursor: grabbing !important; }
    .pc-shelf-drag-preview { position: fixed; z-index: 100; pointer-events: none; padding: 8px 12px; border: 1px solid var(--pc-family); border-radius: 4px; background: var(--pc-block); color: var(--pc-family); font-size: 12px; box-shadow: 0 3px 12px #0006; }
</style>
