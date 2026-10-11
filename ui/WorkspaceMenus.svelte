<script lang="ts">
    import { tick } from 'svelte';
    import type { WorkbenchView, WorkbenchActions } from './types';
    let { state: view, actions, local }: { state: WorkbenchView; actions: WorkbenchActions; local: (command: string) => void } = $props();
    const rootWorkflow = $derived(view.rootWorkflow ?? view.workflow);
    let active = $state('');
    let nav: HTMLElement;
    let panel = $state<HTMLDivElement>(null!);
    let submenu = $state('');
    let subPanel = $state<HTMLDivElement>(null!);
    let subAnchor: HTMLButtonElement | null = null;
    let subLeft = $state(0), subTop = $state(0);
    let anchor: HTMLButtonElement | null = null;
    let left = $state(0), top = $state(0);
    const names = ['File', 'Edit', 'Graph', 'Node', 'Preview', 'Tools', 'Help'];
    const modifier = /Mac|iPhone|iPad|iPod/.test(window.navigator.platform) ? 'Cmd' : 'Ctrl';
    const shortcut = (keys: string) => `${modifier} ${keys}`;
    type Item = { label: string; command: string; shortcut?: string; disabled?: boolean; submenu?: string; title?: string };
    const item = (label: string, command: string, shortcut = '', disabled = false): Item => ({ label, command, shortcut, disabled });
    function items(name: string): Item[] {
        switch (name) {
            case 'File': return [item('New workflow', 'new', shortcut('N'), view.document?.busy), item('Open workflow…', 'open-workflow', shortcut('O'), view.document?.busy), { ...item('Open Recent', '', '', !view.document?.native || !view.document.recents.length || view.document.busy), submenu: 'Open Recent' }, item('Open examples…', 'examples', '', view.document?.busy), { ...item('Recover previous workflows', '', '', !view.document?.recovery.length || view.document.busy), submenu: 'Recover previous workflows' }, ...(view.document?.native ? [item('Save workflow', 'save', shortcut('S'), view.document.busy), item('Save As…', 'save-as', shortcut('Shift S'), view.document.busy)] : [item('Download JSON…', 'download-document', shortcut('S'), view.document?.busy)]), item('Import into graph…', 'import-into-graph'), item('Export workflow JSON…', 'export'), item('Close workspace', 'close')];
            case 'Edit': return [item('Undo', 'undo', shortcut('Z'), !view.history.undo), item('Redo', 'redo', shortcut('Shift Z'), !view.history.redo), item('Copy', 'copy', shortcut('C'), !view.selectionActions?.copy), item('Cut', 'cut', shortcut('X'), !view.selectionActions?.cut), item('Paste', 'paste', shortcut('V')), item('Delete selection', 'delete-selection', 'Del', !view.selectionActions?.delete)];
            case 'Graph': return [item('Select tool', 'select-tool'), item('Pan tool', 'pan-tool'), item('Zoom in', 'zoom-in'), item('Zoom out', 'zoom-out'), item('Fit to view', 'fit'), item('Fit selection', 'fit-selection', '', !view.selectionCount), item('Rename graph', 'rename'), item('Run workflow', 'run-workflow', '', !rootWorkflow || !!rootWorkflow?.busy || !!rootWorkflow?.issues.length), item('Stop workflow', 'stop-workflow', '', !rootWorkflow?.busy)];
            case 'Node': return [item('Add node…', 'add-node'), item('Inspect selection', 'reveal-inspector')];
            case 'Preview': return [item('Show preview', 'show-preview'), item('Collapse preview', 'collapse-preview')];
            case 'Tools': return [item('Recall arms…', 'recall-arms'), item('Story documents…', 'story-documents'), item('Fast connections…', 'fast-connections'), item('Theme and colours', 'theme'), item('Toggle inspector', 'inspector')];
            default: return [item('Workspace guide', 'help')];
        }
    }
    function subItems(): Item[] {
        if (submenu === 'Recover previous workflows') return (view.document?.recovery ?? []).map(file => ({ ...item(file.name, 'recover-workflow:' + file.id), title: file.issue, shortcut: file.issue }));
        return [...(view.document?.recents ?? []).map(file => item(file.name, 'open-recent:' + file.id)), { ...item('Clear Recent', 'clear-recent'), title: 'Clear the recent-file list. Files stay on disk.' }];
    }
    function closeSubmenu(restore = false) { submenu = ''; if (restore) subAnchor?.focus({ preventScroll: true }); }
    function close(restore = false) { active = ''; closeSubmenu(); if (restore) anchor?.focus({ preventScroll: true }); }
    async function open(name: string, button: HTMLButtonElement, focus = false) {
        if (active === name && !focus) { close(); return; }
        closeSubmenu(); active = name; anchor = button; await tick();
        if (active !== name || anchor !== button) return;
        const rect = button.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
        left = Math.max(4, Math.min(rect.left, window.innerWidth - bounds.width - 4)); top = rect.bottom + 2;
        if (focus) panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
    async function openSubmenu(name: string, button: HTMLButtonElement, focus = false) {
        submenu = name; subAnchor = button; await tick();
        if (submenu !== name || subAnchor !== button) return;
        const rect = button.getBoundingClientRect(), bounds = subPanel.getBoundingClientRect();
        const side = rect.right + bounds.width + 6 <= window.innerWidth ? rect.right + 2 : rect.left - bounds.width - 2;
        subLeft = Math.max(4, Math.min(side, window.innerWidth - bounds.width - 4));
        subTop = Math.max(4, Math.min(rect.top, window.innerHeight - bounds.height - 4));
        if (focus) subPanel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
    function choose(entry: Item, button: HTMLButtonElement) {
        if (entry.submenu) openSubmenu(entry.submenu, button, true);
        else command(entry.command);
    }
    function command(value: string) {
        close(true);
        if (['examples', 'show-preview', 'collapse-preview', 'add-node', 'help', 'fast-connections', 'story-documents', 'recall-arms'].includes(value)) local(value);
        else if (value === 'select-tool' || value === 'pan-tool') actions.mode(value === 'select-tool' ? 'select' : 'pan');
        else if (value === 'zoom-in' || value === 'zoom-out') actions.zoom(value === 'zoom-in' ? 1.15 : 1 / 1.15);
        else actions.command(value);
    }
    function keys(event: KeyboardEvent) {
        const target = event.target as HTMLElement;
        const inSubmenu = !!submenu && subPanel?.contains(target);
        if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); if (submenu) closeSubmenu(true); else close(true); return; }
        if (event.key === 'ArrowLeft' && inSubmenu) { event.preventDefault(); event.stopPropagation(); closeSubmenu(true); return; }
        if (event.key === 'ArrowRight' && target.dataset.submenu) { event.preventDefault(); event.stopPropagation(); openSubmenu(target.dataset.submenu, target as HTMLButtonElement, true); return; }
        if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault(); event.stopPropagation(); if (inSubmenu) return;
            const name = active || target.dataset.menu || names[0];
            const next = names[(names.indexOf(name) + (event.key === 'ArrowRight' ? 1 : names.length - 1)) % names.length];
            const button = nav.querySelector<HTMLButtonElement>(`[data-menu="${next}"]`)!;
            if (active) open(next, button, true); else button.focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
            event.preventDefault(); event.stopPropagation();
            if (!active) { open(target.dataset.menu || names[0], target as HTMLButtonElement, true); return; }
            const buttons = [...(inSubmenu ? subPanel : panel).querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)')], index = buttons.indexOf(target as HTMLButtonElement);
            buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? buttons.length - 1 : 1)) % buttons.length]?.focus();
        } else if (event.key === 'Tab') close();
    }
</script>
<svelte:window onpointerdown={(event) => { if (active && !nav.contains(event.target as Node) && !panel?.contains(event.target as Node)) close(); }} onresize={() => close()} />
<nav class="pc-workspace-menus" aria-label="Workspace menus" bind:this={nav} onfocusout={(event) => { if (active && event.relatedTarget && !nav.contains(event.relatedTarget as Node)) close(); }}>
    {#each names as name}<button type="button" data-menu={name} class="pc-flat-menu" aria-haspopup="menu" aria-expanded={active === name} onclick={(event) => open(name, event.currentTarget)} onkeydown={keys}>{name}</button>{/each}
    {#if active}
        <div class="pc-workspace-menu-panel" role="menu" tabindex="-1" aria-label={active} bind:this={panel} style:left={`${left}px`} style:top={`${top}px`} onkeydown={keys}>
            {#each items(active) as entry}<button type="button" role="menuitem" aria-label={entry.label} disabled={entry.disabled} data-submenu={entry.submenu} aria-haspopup={entry.submenu ? 'menu' : undefined} aria-expanded={entry.submenu ? submenu === entry.submenu : undefined} title={entry.title} onclick={(event) => choose(entry, event.currentTarget)} onpointerenter={(event) => { if (event.pointerType === 'mouse') { if (entry.submenu && !entry.disabled) openSubmenu(entry.submenu, event.currentTarget); else closeSubmenu(); } }}><span>{entry.label}</span><small>{entry.submenu ? '›' : entry.shortcut}</small></button>{/each}
            {#if submenu}
                <div class="pc-workspace-menu-panel pc-workspace-submenu" role="menu" tabindex="-1" aria-label={submenu} bind:this={subPanel} style:left={`${subLeft}px`} style:top={`${subTop}px`}>
                    {#each subItems() as entry}<button type="button" role="menuitem" aria-label={entry.label} disabled={entry.disabled} title={entry.title} onclick={() => command(entry.command)}><span>{entry.label}</span><small>{entry.shortcut}</small></button>{/each}
                </div>
            {/if}
        </div>
    {/if}
</nav>
