<script lang="ts">
    import { tick } from 'svelte';
    import type {DetailEditResponse} from './detail-types';
    import type { WorkbenchView, WorkbenchActions } from './types';
    import { workspaceMenus, localMenuCommands, type WorkspaceMenuItem, type WorkspaceMenuPanels } from './workspace-menu-model';
    import { menuIconPaths } from '../src/ui/menu-icons.js';
    let { state: view, actions, local, panels }: { state: WorkbenchView; actions: WorkbenchActions; local: (command: string) => void; panels?: WorkspaceMenuPanels } = $props();
    const menus = $derived(workspaceMenus(view, panels));
    const uid = $props.id();
    let active = $state(''), rootFocus = $state(0);
    let nav: HTMLDivElement, panel = $state<HTMLDivElement | null>(null), childPanel = $state<HTMLDivElement | null>(null);
    let anchor: HTMLButtonElement | null = null, childAnchor: HTMLButtonElement | null = null;
    let child = $state.raw<WorkspaceMenuItem | null>(null);
    const displayedChild = $derived(child?.command === 'workflow-failure-policy-menu'
        ? menus.find(menu => menu.name === active)?.groups.flat().find(entry => entry.command === child?.command) ?? child
        : child);
    let left = $state(0), top = $state(0), childLeft = $state(0), childTop = $state(0);
    let session = 0, openedView = '', search = '', searchedAt = 0;
    let recallMenuActions: Record<string, () => DetailEditResponse> = {};
    const viewKey = $derived(`${view.menuContextKey ?? ''}:${view.graphId}:${view.graphViews?.active.key ?? ''}:${view.graphViews?.viewEpoch ?? ''}`);
    $effect(() => { if (active && openedView !== viewKey) close(); });
    const buttons = (element: HTMLElement | null) => element ? [...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')] : [];
    function close(restore = false) {
        session++; active = ''; child = null; search = '';
        if (restore && anchor?.isConnected) anchor.focus({ preventScroll: true });
    }
    function position(element: HTMLElement, rect: DOMRect, submenu = false) {
        const bounds = element.getBoundingClientRect(), width = window.innerWidth, height = window.innerHeight;
        let x = submenu ? rect.right - 1 : rect.left; let y = submenu ? rect.top : rect.bottom+2;
        if (submenu && x + bounds.width > width - 4) {
            x = rect.left - bounds.width + 1;
            if (x < 4) { x=rect.left; y=rect.bottom+bounds.height<=height-4?rect.bottom:rect.top-bounds.height; }
        }
        return {x:Math.max(4,Math.min(x,width-bounds.width-4)), y:Math.max(4,Math.min(y,height-bounds.height-4))};
    }
    async function open(name: string, button: HTMLButtonElement, focus: 'first' | 'last' | false = 'first', toggle = false) {
        if (active === name && toggle) { close(true); return; }
        actions.resizeStart?.();
        active = name; child = null; anchor = button; rootFocus = menus.findIndex(menu=>menu.name===name);
        openedView = viewKey; search = ''; const current = ++session;
        await tick(); if (current !== session || !panel) return;
        const point = position(panel,button.getBoundingClientRect()); left=point.x;top=point.y;
        if (focus) (focus === 'last' ? buttons(panel).at(-1) : buttons(panel)[0])?.focus();
    }
    async function openChild(entry: WorkspaceMenuItem, button: HTMLButtonElement, focus = false) {
        if (entry.disabled || !entry.children || !active) return;
        if (entry.command === 'memory-recall-menu') actions.recall?.refresh();
        child = entry; childAnchor = button; search = ''; const current = session;
        await tick(); if (current !== session || !childPanel || child !== entry) return;
        if (entry.command === 'memory-recall-menu') {
            const selected = actions.recall?.capture(view.recall?.commands.selected.relevantNodeIds ?? []), all = actions.recall?.capture(view.recall?.commands.all.relevantNodeIds ?? [], 'all');
            const unavailable = (): DetailEditResponse => ({ok:false,error:{code:'RECALL_UNAVAILABLE',message:'Memory recall is unavailable.'}});
            recallMenuActions = {'recall-queue-selected':()=>selected?.queue() ?? unavailable(),'recall-cancel-selected':()=>selected?.cancel() ?? unavailable(),'recall-queue-all':()=>all?.queue() ?? unavailable(),'recall-cancel-all':()=>all?.cancel() ?? unavailable()};
        }
        const point = position(childPanel,button.getBoundingClientRect(),true);childLeft=point.x;childTop=point.y;
        if (focus) buttons(childPanel)[0]?.focus();
    }
    function choose(entry: WorkspaceMenuItem, button: HTMLButtonElement) {
        if (entry.disabled || openedView !== viewKey) return;
        if (entry.children) { openChild(entry,button,true); return; }
        const command = entry.command; close(true);
        const recallAction = recallMenuActions[command];
        if (recallAction) { Promise.resolve(recallAction()).then(result=>{if(!result.ok){actions.recall?.reportIssue(result.error.code + ': ' + result.error.message);actions.recall?.refresh();}}).catch(()=>{actions.recall?.reportIssue('RECALL_UNAVAILABLE: Memory recall could not be updated.');actions.recall?.refresh();}); }
        else if (localMenuCommands.has(command)) local(command);
        else if (command === 'enable-workflow') actions.setEnabled(!view.enabled);
        else if (command === 'select-tool' || command === 'pan-tool') actions.mode(command === 'select-tool' ? 'select' : 'pan');
        else if (command === 'zoom-in' || command === 'zoom-out') actions.zoom(command === 'zoom-in' ? 1.15 : 1/1.15);
        else if (command === 'fit-selection') actions.fitSelection();
        else actions.command(command);
    }
    function rootButton(index: number) { return nav.querySelector<HTMLButtonElement>(`[data-menu="${menus[index].name}"]`)!; }
    function keys(event: KeyboardEvent) {
        if (!active && (event.ctrlKey || event.metaKey)) return;
        event.stopPropagation();
        const target = event.target as HTMLButtonElement, rootItem = target.hasAttribute('data-menu');
        if (event.key === 'Tab') { if(active)close(true); return; }
        if (event.key === 'Escape') { if (active) { event.preventDefault(); if (child && target.closest('[role="menu"]') === childPanel) { child=null; childAnchor?.focus({preventScroll:true}); } else close(true); } return; }
        const currentPanel = target.closest<HTMLDivElement>('[role="menu"]') ?? panel;
        const nested = currentPanel === childPanel && !!child;
        const enabled = buttons(currentPanel), index = enabled.indexOf(target);
        if (['ArrowLeft','ArrowRight'].includes(event.key)) {
            event.preventDefault();
            if (nested) { if (event.key === 'ArrowLeft') { child=null; childAnchor?.focus(); } return; }
            if (!rootItem && event.key === 'ArrowRight') {
                const entry = menus.find(menu=>menu.name===active)?.groups.flat().find(entry=>entry.command===target.dataset.command);
                if (entry?.children) { openChild(entry,target,true); return; }
            }
            const next = (rootFocus+(event.key==='ArrowRight'?1:menus.length-1))%menus.length; rootFocus=next;
            if (active) open(menus[next].name,rootButton(next)); else rootButton(next).focus();
            return;
        }
        if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
            event.preventDefault();
            if (rootItem) {
                if (event.key==='Home'||event.key==='End') { rootFocus=event.key==='Home'?0:menus.length-1;rootButton(rootFocus).focus(); }
                else open(target.dataset.menu!,target,event.key==='ArrowUp'?'last':'first');
            } else {
                if (!nested) child=null;
                const next=event.key==='Home'?0:event.key==='End'?enabled.length-1:(index+(event.key==='ArrowUp'?enabled.length-1:1))%enabled.length;
                enabled[next]?.focus();
            }
            return;
        }
        if (event.key==='Enter'||event.key===' ') { event.preventDefault();target.click();return; }
        if (event.key.length===1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault(); const now=Date.now();search=(now-searchedAt>700?'':search)+event.key.toLowerCase();searchedAt=now;
            const query=search.split('').every(char=>char===search[0])?search[0]:search;
            if (rootItem && !active) {
                const offset=menus.findIndex((_,i)=>menus[(rootFocus+i+1)%menus.length].name.toLowerCase().startsWith(query));
                if(offset>=0){rootFocus=(rootFocus+offset+1)%menus.length;rootButton(rootFocus).focus();}
            } else {
                const ordered=[...enabled.slice(index+1),...enabled.slice(0,index+1)];
                ordered.find(button=>button.getAttribute('aria-label')?.toLowerCase().startsWith(query))?.focus();
            }
        }
    }
    function isolate(event: Event) { if (active && nav?.contains(event.target as Node)) event.stopPropagation(); }
</script>
<svelte:window onpointerdown={(event) => { if (active && !nav.contains(event.target as Node)) close(); }} onresize={() => close()} onkeyupcapture={isolate} />
<div class="pc-workspace-menus" role="menubar" tabindex="-1" aria-label="Workspace menus" bind:this={nav} onkeydown={keys} onkeyup={isolate} onpaste={isolate} onpointerdown={isolate}>
    {#each menus as menu, index}
        <button type="button" role="menuitem" data-menu={menu.name} class="pc-flat-menu" tabindex={rootFocus===index?0:-1} aria-haspopup="menu" aria-expanded={active===menu.name} aria-controls={active===menu.name?'pc-workspace-menu':undefined} onfocus={() => rootFocus=index} onclick={(event)=>open(menu.name,event.currentTarget,'first',true)} onpointerenter={(event)=>{if(active && active!==menu.name)open(menu.name,event.currentTarget);}}>{menu.name}</button>
    {/each}
    {#if active}
        <div id="pc-workspace-menu" class="pc-workspace-menu-panel" role="menu" tabindex="-1" aria-label={active} bind:this={panel} style:left={`${left}px`} style:top={`${top}px`}>
            {#each menus.find(menu=>menu.name===active)?.groups ?? [] as group, index}
                {#if index}<div class="pc-workspace-menu-separator" role="separator"></div>{/if}
                {@render rows(group,false)}
            {/each}
        </div>
        {#if displayedChild?.children}
            <div id="pc-workspace-submenu" class="pc-workspace-menu-panel pc-workspace-submenu" role="menu" tabindex="-1" aria-label={`${displayedChild.label} options`} bind:this={childPanel} style:left={`${childLeft}px`} style:top={`${childTop}px`}>
                {@render rows(displayedChild.children,true)}
            </div>
        {/if}
    {/if}
</div>
{#snippet rows(entries: WorkspaceMenuItem[], nested: boolean)}
    {#each entries as entry}
        <button type="button" class="pc-workspace-menu-item" role={entry.kind==='radio'?'menuitemradio':entry.kind==='check'?'menuitemcheckbox':'menuitem'} title={entry.title} aria-label={entry.label} aria-describedby={entry.reason ? uid + '-reason-' + entry.command : undefined} aria-disabled={!!entry.disabled} aria-checked={entry.kind?!!entry.checked:undefined} aria-haspopup={entry.children?'menu':undefined} aria-expanded={entry.children?displayedChild===entry:undefined} aria-controls={entry.children && displayedChild===entry?'pc-workspace-submenu':undefined} data-command={entry.command} data-tone={entry.tone} tabindex="-1" disabled={entry.disabled} onclick={(event)=>choose(entry,event.currentTarget)} onpointerenter={(event)=>{if(!nested){if(entry.children)openChild(entry,event.currentTarget);else child=null;}}}>
            <span class="pc-workspace-menu-icon" data-icon-tone={entry.iconTone} aria-hidden="true">{#if entry.icon && menuIconPaths[entry.icon as keyof typeof menuIconPaths]}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d={menuIconPaths[entry.icon as keyof typeof menuIconPaths]} /></svg>{/if}</span>
            <span class="pc-workspace-menu-state" aria-hidden="true">{entry.checked?(entry.kind==='radio'?'●':'✓'):''}</span>
            <span class="pc-workspace-menu-label">{entry.label}{#if entry.reason}<small id={uid + '-reason-' + entry.command} style="display:block;white-space:normal;font-size:11px;line-height:1.4">{entry.reason}</small>{/if}</span>
            {#if entry.shortcut}<kbd class="pc-workspace-menu-shortcut" aria-hidden="true">{entry.shortcut}</kbd>{:else}<span class="pc-workspace-menu-shortcut" aria-hidden="true"></span>{/if}
            <span class="pc-workspace-menu-caret" aria-hidden="true">{entry.children?'›':''}</span>
        </button>
    {/each}
{/snippet}
