<script lang="ts">
    import { tick } from 'svelte';
    import type { GraphViews, GraphViewActions, GraphViewInfo } from './view-types';
    let { views, actions = {}, panelId, idPrefix = 'pc-graph-view' }: { views?: GraphViews; actions?: GraphViewActions; panelId?: string; idPrefix?: string } = $props();
    let nav = $state<HTMLElement>(null!), menu = $state<HTMLDivElement>(null!), trigger = $state<HTMLButtonElement>(null!);
    let menuOpen = $state(false), focusKey = $state(''), contextKey = $state(''), contextX = $state(0), contextY = $state(0), previousActive = '';
    let renameKey = $state(''), renameName = $state(''), renameInput = $state<HTMLInputElement>(null!);
    let renameWorkflowId = '';
    let renameOwner: HTMLInputElement | null = null, renameEpoch = 0;
    const contextTarget = $derived(views?.tabs.find(view => view.key === contextKey));
    const tabElements: Record<string, HTMLButtonElement> = {};
    $effect(() => {
        const activeKey = views?.active.key ?? '';
        if (previousActive !== activeKey) { focusKey = activeKey; closeMenu(); renameKey = ''; }
        else if (views && !views.tabs.some(tab => tab.key === focusKey)) focusKey = activeKey;
        if (contextKey && !contextTarget) closeMenu();
        if (renameKey && (views?.workflowId !== renameWorkflowId || !views.tabs.some(tab => tab.key === renameKey))) renameKey = '';
        previousActive = activeKey;
    });
    export async function startRename(key: string) {
        const view = views?.tabs.find(view => view.key === key);
        if (!view || view.identity.kind === 'library' || !actions.renameView || actions.canRenameView?.(key) === false) return;
        const epoch = ++renameEpoch; renameOwner = null;
        closeMenu(); renameWorkflowId = views!.workflowId; renameName = view.label; renameKey = key;
        await tick();
        if (renameKey !== key || renameEpoch !== epoch) return;
        renameOwner = renameInput;
        renameInput?.focus({ preventScroll: true }); renameInput?.select();
    }
    async function finishRename(input: HTMLInputElement, commit: boolean, restoreFocus = true) {
        const key = renameKey, view = views?.tabs.find(view => view.key === key), name = renameName.trim();
        if (!key || input !== renameOwner) return;
        renameKey = ''; renameOwner = null;
        if (commit && view && name && name !== view.label && views?.workflowId === renameWorkflowId && view.identity.kind !== 'library' && actions.canRenameView?.(key) !== false) actions.renameView?.(key, name);
        if (restoreFocus) { await tick(); tabElements[key]?.focus({ preventScroll: true }); }
    }
    function renameKeys(event: KeyboardEvent) {
        event.stopPropagation();
        if (event.isComposing) return;
        if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); finishRename(event.currentTarget as HTMLInputElement, event.key === 'Enter'); }
    }
    function fullLabel(view: GraphViewInfo) {
        const location = view.breadcrumbs.map(crumb => crumb.label).join(' / ') || view.label;
        const identity = view.identity;
        return identity.kind === 'instance' ? `${location} (${identity.instancePath.map(id => JSON.stringify(id)).join(' → ')})` : identity.kind === 'library' ? `${location} · Library v${identity.definitionRef.version} (${identity.definitionRef.id})` : location;
    }
    function focusTab(key: string) { focusKey = key; actions.focusView?.(key); tabElements[key]?.focus({ preventScroll: true }); }
    function tabKeys(event: KeyboardEvent, index: number) {
        if (views && (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) {
            event.preventDefault(); event.stopPropagation();
            const view = views.tabs[index], bounds = tabElements[view.key]?.getBoundingClientRect();
            openContextMenu(view, bounds?.left ?? 8, bounds?.bottom ?? 8);
            return;
        }
        if (!views || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Delete'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Delete') { if (views.tabs[index].identity.kind !== 'root') closeTab(views.tabs[index]); return; }
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? views.tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? views.tabs.length - 1 : 1)) % views.tabs.length;
        focusTab(views.tabs[next].key);
    }
    async function closeTab(view: GraphViewInfo) {
        if (view.identity.kind === 'root') return;
        actions.closeView?.(view.key);
        await tick();
        const currentKey = views?.active.key;
        if (currentKey && views?.tabs.some(tab => tab.key === currentKey)) { focusKey = currentKey; tabElements[currentKey]?.focus({ preventScroll: true }); }
    }
    function closeMenu(restore = false) {
        const target = contextKey ? tabElements[contextKey] : trigger;
        menuOpen = false; contextKey = '';
        if (restore) target?.focus({ preventScroll: true });
    }
    function contextTab(event: MouseEvent, view: GraphViewInfo) {
        event.preventDefault(); event.stopPropagation();
        openContextMenu(view, event.clientX, event.clientY);
    }
    async function openContextMenu(view: GraphViewInfo, x: number, y: number) {
        contextKey = view.key; contextX = x; contextY = y; menuOpen = true;
        await tick();
        if (!menuOpen || contextKey !== view.key) return;
        const bounds = menu?.getBoundingClientRect();
        contextX = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - (bounds?.width ?? 0) - 8));
        contextY = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - (bounds?.height ?? 0) - 8));
        menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    }
    async function toggleMenu() {
        const wasContext = !!contextKey;
        contextKey = '';
        menuOpen = wasContext || !menuOpen;
        if (menuOpen) { await tick(); if (menuOpen) menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }
    }
    function menuKeys(event: KeyboardEvent) {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); return; }
        if (event.key === 'Tab') { closeMenu(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], index = buttons.indexOf(event.target as HTMLButtonElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }
    function menuAction(action: () => void) { closeMenu(true); action(); }
    function contextAction(action: (view: GraphViewInfo) => void) {
        const target = contextTarget;
        if (!target) return;
        closeMenu(true); action(target);
    }
</script>
<svelte:window onpointerdown={(event) => { if (menuOpen && !menu?.contains(event.target as Node) && event.target !== trigger) closeMenu(); }} onresize={() => closeMenu()} />
{#if views}
    <nav class="pc-graph-tabs pc-graph-tabs-multi" class:pc-graph-tabs-menu-open={menuOpen} aria-label="Open graph views" bind:this={nav}>
        <div class="pc-graph-tab-list" role="tablist" aria-label="Graph views">
            {#each views.tabs as view, index (view.key)}
                <div class="pc-graph-tab-item" class:pc-graph-tab-active={view.key === views.active.key} class:pc-graph-tab-editing={renameKey === view.key}>
                    <button type="button" class="pc-graph-tab" class:pc-graph-tab-closeable={view.identity.kind !== 'root'} role="tab" id={`${idPrefix}-${index}`} aria-controls={panelId} aria-selected={view.key === views.active.key} aria-haspopup="menu" aria-expanded={menuOpen && contextKey === view.key} tabindex={renameKey !== view.key && view.key === (focusKey || views.active.key) ? 0 : -1} title={fullLabel(view)} onclick={() => focusTab(view.key)} onpointerdown={(event) => { if (event.button === 2) event.preventDefault(); }} oncontextmenu={(event) => contextTab(event, view)} onkeydown={(event) => tabKeys(event, index)} bind:this={tabElements[view.key]}><span>{view.label}</span>{#if view.readOnly}<span class="pc-graph-tab-lock" aria-label="Read only">◇</span>{/if}</button>
                    {#if renameKey === view.key}<input type="text" class="pc-graph-tab-rename" class:pc-graph-tab-closeable={view.identity.kind !== 'root'} aria-label={view.identity.kind === 'root' ? 'Graph name' : 'Subgraph name'} title="Enter to save, Escape to cancel" maxlength={view.identity.kind === 'instance' ? 80 : undefined} bind:value={renameName} bind:this={renameInput} onkeydown={renameKeys} onblur={(event) => finishRename(event.currentTarget, true, false)} />{/if}
                    {#if view.identity.kind !== 'root'}<button type="button" class="pc-graph-tab-close" aria-label={`Close ${view.label} · ${fullLabel(view)}`} title={`Close ${fullLabel(view)}`} tabindex={view.key === (focusKey || views.active.key) ? 0 : -1} onclick={() => closeTab(view)} oncontextmenu={(event) => contextTab(event, view)} onkeydown={(event) => tabKeys(event, index)}>×</button>{/if}
                </div>
            {/each}
        </div>
        <button type="button" class="pc-graph-view-overflow" aria-label="Graph view actions" title="Focus, close or reopen graph views" aria-haspopup="menu" aria-expanded={menuOpen && !contextKey} onclick={toggleMenu} bind:this={trigger}>⋯</button>
        {#if menuOpen}
            <div class="pc-graph-view-menu" class:pc-graph-tab-menu={!!contextKey} style={contextKey ? `left: ${contextX}px; top: ${contextY}px;` : undefined} role="menu" aria-label={contextTarget ? `Actions for ${contextTarget.label}` : 'Graph view actions'} tabindex="-1" onkeydown={menuKeys} bind:this={menu}>
                {#if contextTarget}
                    {@const target = contextTarget}
                    {@const renameBlocked = actions.canRenameView?.(target.key) === false}
                    <button type="button" role="menuitem" disabled={!actions.exportView} onclick={() => contextAction(view => actions.exportView?.(view.key))}>{target.identity.kind === 'root' ? 'Export workflow JSON' : 'Export subgraph JSON'}</button>
                    <button type="button" role="menuitem" disabled={target.identity.kind === 'library' || renameBlocked || !actions.renameView} title={target.identity.kind === 'library' ? 'Library inspection is read only.' : renameBlocked ? 'Make a local copy of the containing graph to rename this subgraph.' : undefined} onclick={() => contextAction(view => startRename(view.key))}>{target.identity.kind === 'root' ? 'Rename graph' : 'Rename subgraph'}</button>
                    <button type="button" role="menuitem" disabled={target.identity.kind === 'root' || !actions.closeView} onclick={() => contextAction(view => closeTab(view))}>Close tab</button>
                    <button type="button" role="menuitem" disabled={views.tabs.every(view => view.identity.kind === 'root' || view.key === target.key) || !actions.closeOtherViews} onclick={() => contextAction(view => actions.closeOtherViews?.(view.key))}>Close other tabs</button>
                    {#each views.closedViews as view (view.key)}<button type="button" role="menuitem" disabled={!actions.reopenView} title={fullLabel(view)} onclick={() => menuAction(() => actions.reopenView?.(view.key))}>Reopen {view.label} · {fullLabel(view)}</button>{/each}
                {:else}
                {#each views.tabs as view (view.key)}<button type="button" role="menuitem" title={fullLabel(view)} onclick={() => menuAction(() => focusTab(view.key))}>Focus {fullLabel(view)}</button>{/each}
                <button type="button" role="menuitem" disabled={views.active.identity.kind === 'root' || !actions.closeView} onclick={() => menuAction(() => closeTab(views!.active))}>Close active view</button>
                <button type="button" role="menuitem" disabled={views.tabs.every(view => view.identity.kind === 'root' || view.key === views!.active.key) || !actions.closeOtherViews} onclick={() => menuAction(() => actions.closeOtherViews?.(views!.active.key))}>Close other views</button>
                {#each views.closedViews as view (view.key)}<button type="button" role="menuitem" title={fullLabel(view)} onclick={() => menuAction(() => actions.reopenView?.(view.key))}>Reopen {view.label} · {fullLabel(view)}</button>{/each}
                {/if}
            </div>
        {/if}
    </nav>
{/if}
<style>
    .pc-graph-tabs-multi { gap: 4px; min-width: 0; }
    .pc-graph-tabs-multi.pc-graph-tabs-menu-open { z-index: 30; }
    .pc-graph-tab-list { display: flex; align-items: stretch; min-width: 0; flex: 1; overflow-x: auto; scrollbar-width: none; }
    .pc-graph-tab-list::-webkit-scrollbar { display: none; }
    .pc-graph-tab-item { position: relative; display: flex; flex: 0 0 auto; max-width: 220px; }
    .pc-graph-tabs-multi .pc-graph-tab { display: flex; align-items: center; gap: 5px; min-width: 0; max-width: 220px; white-space: nowrap; }
    .pc-graph-tab > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .pc-graph-tab-closeable { padding-right: 28px; }
    .pc-graph-tab-editing { min-width: 110px; }
    .pc-graph-tab-editing .pc-graph-tab { flex: 1; }
    .pc-graph-tab-editing .pc-graph-tab > span:first-child { visibility: hidden; }
    .pc-graph-tabs-multi input.pc-graph-tab-rename { all: unset; box-sizing: border-box; position: absolute; left: 10px; right: 10px; top: 4px; bottom: 4px; width: calc(100% - 20px); padding: 1px 3px; border: 1px solid var(--pc-accent); border-radius: 2px; background: var(--pc-canvas); color: var(--pc-text); font: inherit; font-size: 12px; user-select: text; }
    .pc-graph-tabs-multi input.pc-graph-tab-rename.pc-graph-tab-closeable { right: 28px; width: calc(100% - 38px); }
    .pc-graph-tabs-multi .pc-graph-tab:not([aria-selected="true"]) { background: var(--pc-panel); margin-bottom: 0; color: var(--pc-muted); }
    .pc-graph-tabs-multi .pc-graph-tab:not([aria-selected="true"])::after { display: none; }
    .pc-graph-tab-lock { font-size: 10px; }
    .pc-graph-tab-close { position: absolute; right: 4px; top: 7px; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 2px; background: transparent; color: var(--pc-muted); font: inherit; line-height: 18px; }
    .pc-graph-view-overflow { flex: 0 0 26px; align-self: center; height: 24px; border: 1px solid var(--pc-border); border-radius: 2px; background: var(--pc-panel-solid); color: var(--pc-text); font: inherit; }
    .pc-graph-tab-close:hover, .pc-graph-view-overflow:hover { color: var(--pc-accent); background: var(--pc-panel); }
    .pc-graph-tab-close:focus-visible, .pc-graph-view-overflow:focus-visible, .pc-graph-view-menu button:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: -2px; }
    .pc-graph-view-menu { position: absolute; top: 100%; right: 4px; z-index: 10; display: flex; flex-direction: column; width: max-content; max-width: min(420px, calc(100vw - 40px)); max-height: min(360px, 60vh); overflow: auto; padding: 4px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-panel-solid); box-shadow: var(--pc-recess); }
    .pc-graph-tab-menu { position: fixed; right: auto; z-index: 70; }
    .pc-graph-view-menu button { display: block; width: 100%; padding: 6px 8px; border: 0; border-radius: 2px; background: transparent; color: var(--pc-text); font: inherit; font-size: 12px; text-align: left; overflow-wrap: anywhere; }
    .pc-graph-view-menu button:hover:not(:disabled) { background: var(--pc-panel); color: var(--pc-accent); }
    .pc-graph-view-menu button:disabled { opacity: .45; }
    @media (max-width: 480px) { .pc-graph-tab-item, .pc-graph-tabs-multi .pc-graph-tab { max-width: 160px; } }
</style>
