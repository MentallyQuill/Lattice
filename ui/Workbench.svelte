<script lang="ts">
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import { onMount, tick } from 'svelte';
    import Toolbar from './Toolbar.svelte';
    import PaneDivider from './PaneDivider.svelte';
    import DetailsDivider from './DetailsDivider.svelte';
    import GraphTabs from './GraphTabs.svelte';
    import GraphBreadcrumbs from './GraphBreadcrumbs.svelte';
    import NodeDetails from './NodeDetails.svelte';
    import NodeGuide from './NodeGuide.svelte';
    import { projectNodeGuide, projectCommentGuide } from '../src/ui/node-guide.js';
    import CommentDetails from './CommentDetails.svelte';
    import OutputPreview from './OutputPreview.svelte';
    import RunDetails from './RunDetails.svelte';
    import RunMeter from './RunMeter.svelte';
    import PortalManager from './PortalManager.svelte';
    import AddSystem from './AddSystem.svelte';
    import SubgraphSave from './SubgraphSave.svelte';
    import StoryDocuments from './StoryDocuments.svelte';
    import RecallOverview from './RecallOverview.svelte';
    import ConfigureNode from './ConfigureNode.svelte';
    import DocumentPrompt from './DocumentPrompt.svelte';
    import NodeSearch from './NodeSearch.svelte';
    import PinMenu from './PinMenu.svelte';
    import NodeShelf from './NodeShelf.svelte';
    import ExamplesBrowser from './ExamplesBrowser.svelte';
    import ImportReview from './ImportReview.svelte';
    import WorkspaceReport from './WorkspaceReport.svelte';
    import manifest from '../manifest.json';
    import type { DetailTarget } from './detail-types';
    import type { WorkbenchView, WorkbenchActions } from './types';
    let { actions }: { actions: WorkbenchActions } = $props();
    let view = $state.raw<WorkbenchView>({ graphId: '', enabled: false, inspectorOpen: true, history: { undo: false, redo: false, undoTitle: 'Nothing to undo', redoTitle: 'Nothing to redo', note: '', showNote: false }, camera: { x: 0, y: 0, zoom: 1, mode: 'select' }, selectionCount: 0 });
    let root: HTMLDivElement, body: HTMLDivElement, canvasHost: HTMLDivElement, stage: HTMLDivElement, inspector: HTMLDivElement;
    let toolbar: { getParts(): { header: HTMLElement; enabledControl: HTMLInputElement; inspBtn: HTMLButtonElement } };
    let graphTabs: { startRename(key: string): Promise<void> };
    export function getParts() { return { root, parts: { ...toolbar.getParts(), inspector, canvasHost } }; }
    export function updateActions(value: Partial<WorkbenchActions>) { actions = { ...actions, ...value }; }
    export function update(value: Partial<WorkbenchView>) { view = { ...view, ...value }; }
    export function renameGraphView(key: string) { return graphTabs?.startRename(key); }
    export async function focusCommentTitle(id: string, isCurrent: () => boolean) {
        await tick();
        if (!isCurrent()) return;
        const frame = [...canvasHost.querySelectorAll<HTMLElement>('.pc-comment-frame[data-id]')].find(frame => frame.dataset.id === id);
        const input = frame?.querySelector<HTMLInputElement>('.pc-comment-title-input');
        if (input && !input.disabled) { input.focus({ preventScroll: true }); input.select(); }
    }
    const storageKey = 'lattice.workspace.preview';
    function savedPane() { try { const data = JSON.parse(localStorage.getItem(storageKey) || 'null'); return { height: Number.isFinite(data?.height) ? Math.max(90, Math.min(600, data.height)) : 240, collapsed: data?.collapsed === true, shelfOpen: data?.shelfOpen !== false }; } catch { return { height: 240, collapsed: false, shelfOpen: true }; } }
    const initial = savedPane();
    let previewHeight = $state(initial.height), collapsed = $state(initial.collapsed), maxHeight = $state(500);
    let shelfOpen = $state(initial.shelfOpen);
    let detailsDraft = $state<number | null>(null), detailsMax = $state(520);
    let detailsWidth = $derived(Math.max(220, Math.min(detailsMax, detailsDraft ?? view.detailsWidth ?? 258)));
    function commitDetails(width: number) { detailsDraft = null; view = { ...view, detailsWidth: width }; actions.resizeDetails?.(width); }
    let overlay = $state('');
    let guideSelection = $state('');
    const guideOwner = $derived(view.commentDetails?.selection ?? view.nodeDetails);
    const currentGuideSelection = $derived(guideOwner ? JSON.stringify([guideOwner.documentNamespace ?? '', guideOwner.selectionKey, guideOwner.address, view.commentDetails ? 'comment' : view.nodeDetails?.guideKey ?? view.nodeDetails?.operation]) : '');
    const nodeGuide = $derived(overlay === 'node-guide' ? view.commentDetails ? projectCommentGuide(view.commentDetails.comment) : projectNodeGuide(view.nodeDetails) : null);
    $effect(() => { if (overlay === 'node-guide' && (guideSelection !== currentGuideSelection || !nodeGuide)) closeOverlay(); });
    const overlayTitle = $derived(({examples:'Examples', 'run-details':'Run details', 'story-documents':'Workflow Data', 'memory-recall':'Memory recall', 'validate-workflow':'Workflow validation', 'node-reference':'Node reference', shortcuts:'Keyboard shortcuts', about:'About Lattice'} as Record<string,string>)[overlay] ?? 'Workspace guide');
    const dialogTitle = $derived(overlay === 'node-guide' && nodeGuide ? `${nodeGuide.title} guide` : overlayTitle);
    const rootWorkflow = $derived(view.rootWorkflow ?? view.workflow);
    const insertionContextKey = $derived(`${view.menuContextKey ?? ''}:${view.graphId}:${view.graphViews?.active.key ?? ''}:${view.graphViews?.viewEpoch ?? ''}`);
    const guideStatusContextKey = $derived(JSON.stringify([insertionContextKey, guideOwner?.revision ?? '', !!view.guideInsertionBusy]));
    const referenceUrl = $derived(actions.logoUrl ? new URL('../docs/node-reference.md', actions.logoUrl).href : '');
    const guideUrl = $derived(actions.logoUrl ? new URL('../README.md', actions.logoUrl).href : '');
    let dialog = $state<HTMLDivElement>(null!);
    let overlayAnchor: HTMLElement | null = null;
    let overlayEpoch = 0;
    let examplesScroll = $state(0);
    let examplesLoading = $state(false);
    let shelf: { openSearch(): void };
    function persist() { try { localStorage.setItem(storageKey, JSON.stringify({ height: previewHeight, collapsed, shelfOpen })); } catch { /* Private storage may be disabled. */ } }
    function resizeStart() { actions.resizeStart?.(); }
    function collapse(value: boolean) { resizeStart(); collapsed = value; persist(); }
    export function revealPreview() { collapse(false); }
    function previewCommand(command: string) {
        const preview = view.outputPreview;
        if (!preview) return;
        if (command === 'follow-preview' || (command === 'pin-preview' && preview.pinned)) { actions.outputPreview?.follow?.(); return; }
        const choice = preview.choices.find(item => item.key === preview.selectedKey);
        if (!choice || preview.status === 'removed') return;
        const target: DetailTarget = structuredClone(choice.target);
        if (command === 'pin-preview') actions.outputPreview?.pin?.(preview.sourceKey, target);
        else if (command === 'run-preview' && preview.runHere?.enabled && !preview.busy && !rootWorkflow?.ownedBusy) { collapse(false); actions.outputPreview?.runHere?.(preview.sourceKey, target); }
    }
    async function local(command: string) {
        if (command === 'show-preview') collapse(false);
        else if (command === 'collapse-preview') collapse(true);
        else if (command === 'toggle-preview') collapse(!collapsed);
        else if (command === 'toggle-shelf') { resizeStart(); shelfOpen = !shelfOpen; persist(); }
        else if (command === 'reset-layout') { resizeStart(); previewHeight = 240; collapsed = false; shelfOpen = true; commitDetails(258); if (!view.inspectorOpen) actions.command('inspector'); persist(); }
        else if (command === 'add-node') { shelfOpen = true; persist(); await tick(); shelf.openSearch(); }
        else if (['follow-preview','pin-preview','run-preview'].includes(command)) previewCommand(command);
        else {
            overlayAnchor = document.activeElement as HTMLElement;
            if (command === 'story-documents') actions.storyDocuments?.refresh?.();
            if (command === 'memory-recall') actions.recall?.refresh?.();
            const epoch = ++overlayEpoch, exampleContext = command === 'examples' ? actions.captureExampleContext?.() : undefined;
            overlay = command; examplesLoading = command === 'examples';
            await tick();
            if (epoch === overlayEpoch && overlay === command && (command !== 'examples' || actions.exampleContextCurrent?.(exampleContext) !== false)) dialog?.querySelector<HTMLButtonElement>('button')?.focus();
            if (command === 'examples') await refreshExamplesAfterPaint(epoch, exampleContext);
        }
    }
    function afterPaint() {
        return new Promise<void>(resolve => {
            const frame = globalThis.requestAnimationFrame ?? ((callback: FrameRequestCallback) => globalThis.setTimeout(callback, 0));
            frame(() => globalThis.setTimeout(resolve, 0));
        });
    }
    function staleExampleContext(epoch: number, context?: unknown) {
        if (actions.exampleContextCurrent?.(context) !== false) return false;
        if (epoch === overlayEpoch && overlay === 'examples') { overlayEpoch++; examplesLoading = false; overlay = ''; }
        return true;
    }
    async function refreshExamplesAfterPaint(epoch: number, context?: unknown) {
        await afterPaint();
        if (epoch !== overlayEpoch || overlay !== 'examples' || staleExampleContext(epoch, context)) return false;
        try { return await actions.refreshExamples?.(context) ?? false; }
        catch { return false; }
        finally { if (epoch === overlayEpoch && overlay === 'examples') examplesLoading = false; }
    }
    async function retryExamples() {
        if (examplesLoading || overlay !== 'examples') return false;
        const epoch = overlayEpoch, context = actions.captureExampleContext?.(); examplesLoading = true;
        await tick();
        return refreshExamplesAfterPaint(epoch, context);
    }
    function closeOverlay() { overlayEpoch++; examplesLoading = false; overlay = ''; overlayAnchor?.focus({ preventScroll: true }); }
    function openNodeGuide() { guideSelection = currentGuideSelection; void local('node-guide'); }
    async function openExample(id: string) {
        const epoch = overlayEpoch, context = actions.captureExampleContext?.();
        await afterPaint();
        if (epoch !== overlayEpoch || overlay !== 'examples' || staleExampleContext(epoch, context)) return false;
        try {
            const opened = await actions.openExample?.(id, context);
            if (opened === true && epoch === overlayEpoch && overlay === 'examples') closeOverlay();
            return opened === true;
        } catch { return false; }
    }
    function managerKeys(event: KeyboardEvent) {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); actions.portalManager?.close?.(); return; }
        if (event.key === 'Tab') {
            const elements = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')];
            const first = elements[0], last = elements.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    }
    function overlayKeys(event: KeyboardEvent) {
        // Keep native input editing and modal button activation, while none
        // of these keys can reach the background graph shortcut listeners.
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeOverlay(); }
        if (event.key === 'Tab') {
            const elements = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(element => !element.closest('[inert]') && element.getClientRects().length > 0);
            const first = elements[0], last = elements.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    }
    onMount(() => {
        const measure = () => { maxHeight = Math.max(90, stage.clientHeight - 190); detailsMax = Math.max(220, Math.min(520, (body.clientWidth || root.clientWidth || window.innerWidth) - 368)); };
        const Resize = globalThis.ResizeObserver;
        if (!Resize) { measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
        const observer = new Resize(measure);
        observer.observe(stage); observer.observe(body); measure(); return () => observer.disconnect();
    });
</script>
<div class="pc-root pc-native-workspace" class:pc-native-flat={view.nativeFlatCanvas} role="dialog" aria-modal="true" aria-label="Lattice" data-pc-workbench="svelte" bind:this={root}>
    <Toolbar state={view} {actions} {local} panels={{previewOpen: !collapsed, shelfOpen}} bind:this={toolbar} />
    <!-- Pane sizing stays local so dragging does not invalidate Canvas's intrinsic pin geometry. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll the stacked canvas and Details panels.) -->
    <div class="pc-body" role="region" aria-label="Workspace panels" tabindex="0" style:--pc-details-width={`${detailsWidth}px`} bind:this={body}>
        <div class="pc-stage" bind:this={stage}>
            <section class="pc-preview-pane" class:pc-preview-collapsed={collapsed} aria-label="Output preview" style:--pc-preview-height={`${Math.min(previewHeight, maxHeight)}px`}>
                <header class="pc-preview-pane-head"><strong>Preview</strong><button type="button" class="pc-btn menu_button" aria-label={collapsed ? 'Expand preview' : 'Collapse preview'} title={collapsed ? 'Expand preview' : 'Collapse preview'} aria-expanded={!collapsed} onclick={() => collapse(!collapsed)}>{collapsed ? '▾' : '▴'}</button></header>
                <div class="pc-preview-content" hidden={collapsed}>
                    <OutputPreview view={view.outputPreview ?? null} actions={actions.outputPreview} collapse={() => collapse(true)} />
                </div>
            </section>
            {#if !collapsed}<PaneDivider height={Math.min(previewHeight, maxHeight)} max={maxHeight} start={resizeStart} change={(height) => { previewHeight = height; persist(); }} />{/if}
            <GraphTabs views={view.graphViews} actions={actions.graphViewActions} panelId="pc-workspace-graph" bind:this={graphTabs} />
            <GraphBreadcrumbs view={view.graphViews?.active} actions={actions.graphViewActions} />
            <div class="pc-canvas-area" id="pc-workspace-graph" role="tabpanel">
                <div class="pc-workspace-run"><RunMeter view={view.runMeter ?? null} open={() => { overlay = 'run-details'; }} /></div>
                <div class="pc-canvas-host" aria-label="Node canvas" bind:this={canvasHost}></div>
                {#if view.nativeDiagnostic}<div class="pc-native-diagnostic"><DiagnosticMessage issue={view.nativeDiagnostic} /></div>{/if}
                <div hidden={!shelfOpen}><NodeShelf view={view.workflow} {insertionContextKey} choices={view.nativeChoices} choose={actions.chooseNative} shelfSubgraph={actions.shelfSubgraph} readOnly={view.readOnly} bind:this={shelf} /></div>
            </div>
        </div>
        {#if view.inspectorOpen}{#key view.graphViews?.active.key ?? view.graphId}<DetailsDivider width={detailsWidth} max={detailsMax} start={resizeStart} preview={(width) => detailsDraft = width} change={commitDetails} />{/key}{/if}
        <div class="pc-inspector pc-workspace-details" hidden={!view.inspectorOpen} bind:this={inspector}>
            <header class="pc-details-heading"><strong>Details</strong><button type="button" aria-label="Close Details" title="Close Details" onclick={() => actions.command('inspector')}>×</button></header>
            {#if view.commentDetails}
                {@const details = view.commentDetails}
                <CommentDetails comment={details.comment} openGuide={openNodeGuide} onPatch={patch => actions.commentDetails?.patch(details.selection, patch)} onCommand={command => actions.commentDetails?.command(details.selection, command)} />
            {/if}
            <div class="pc-node-details-holder" hidden={!!view.commentDetails}><NodeDetails view={view.commentDetails ? null : view.nodeDetails ?? null} actions={actions.nodeDetails} openGuide={openNodeGuide} /></div>
        </div>
    </div>
    {#if overlay}
        <div class="pc-workspace-overlay">
            <div class="pc-workspace-dialog" class:pc-examples-dialog={overlay === 'examples'} class:pc-node-guide-dialog={overlay === 'node-guide'} role="dialog" tabindex="-1" aria-modal="true" aria-label={dialogTitle} aria-busy={overlay === 'examples' ? examplesLoading : undefined} bind:this={dialog} onkeydown={overlayKeys} onpaste={(event) => event.stopPropagation()}>
                <header><h2>{dialogTitle}</h2><button type="button" class="pc-btn menu_button" aria-label={overlay==='memory-recall'?'Close':'Close panel'} onclick={closeOverlay}>{overlay==='memory-recall'?'Close':'×'}</button></header>
                {#if overlay === 'node-guide' && nodeGuide}{#key currentGuideSelection}<NodeGuide guide={nodeGuide} actions={actions.nodeGuide} contextKey={guideStatusContextKey} close={closeOverlay} />{/key}{:else}
                {#if overlay === 'examples'}<ExamplesBrowser examples={view.examples} issue={view.examplesIssue} loading={examplesLoading} retry={retryExamples} scrollTop={examplesScroll} scroll={top => examplesScroll = top} open={openExample} />{:else if overlay === 'memory-recall'}<RecallOverview view={view.recall ?? null} actions={{...actions.recall!,reveal:(nodeId)=>{closeOverlay();actions.recall?.reveal(nodeId);}}} />{:else if overlay === 'story-documents'}<StoryDocuments view={view.storyDocuments ?? { key: '', revision: '', scope: { userId: '', chatId: '' }, documents: [], issue: 'Workflow Data setup is unavailable.' }} actions={actions.storyDocuments} close={closeOverlay} />{:else if overlay === 'run-details'}<RunDetails view={view.runDetails ?? null} actions={actions.runDetails} />{:else if overlay !== 'help'}<WorkspaceReport panel={overlay} workflow={rootWorkflow} version={manifest.version} {referenceUrl} {guideUrl} />{:else}<p>Browse node families on the floating shelf. Middle mouse pans the graph; the wheel zooms around the pointer. Use the dividers or their arrow keys to resize Preview and Details. View controls panel visibility; View › Reset panel layout restores the default layout.</p><p>Open examples from File to start a workflow document. A unified workflow's preparation stage feeds Generate Reply, and its response stage reshapes the captured Draft before Review and Publish. Choose each model node's connection with the bar under it. Details contains advanced model overrides and inheritance settings. Enable Lattice runs the open document for Send in SillyTavern. Run to here tests supported nodes; Workflow › Stop workflow cancels the current run. Retired pre and post workflows remain available only for archived export.</p><p>File › New workflow, Open workflow, Open Recent and Open examples replace the open document after offering Save, Don't Save or Cancel for unsaved changes. Save writes the current file; Save As chooses a destination. Save As creates a JSON copy when direct file saving is unavailable. Export workflow JSON makes a portable sharing copy without local connections. Import into graph reviews a compatible fragment before one undoable insertion. Recover previous workflows opens unified documents preserved from earlier settings. File › Export archived workflows preserves retired originals for reference. Recovery drafts remain available in SillyTavern, while the filename and document status describe the current file.</p><p>Select nodes and right-click Create Subgraph to open their connected body in a new tab. Double-click a subgraph to open it. Add Input and Output nodes from the Subgraphs shelf inside an editable subgraph, then name and configure their ports in Details.</p><p>Right-click a subgraph block and choose Add to Subgraphs to save it for reuse. Right-click a saved shelf entry to delete it. Saving updates the shelf only when you choose to save; existing placed copies stay unchanged. Portals connect pins through named references. Preview artifact tabs show results for the selected node; Run to here checks the request bound before running. Apply reviews the fresh result against the full root workflow.</p><p><a href={guideUrl} target="_blank" rel="noreferrer">Open the project guide</a> · <a href={referenceUrl} target="_blank" rel="noreferrer">Node reference</a></p>{/if}
                {/if}
            </div>
        </div>
    {/if}
    <NodeSearch view={view.nativeSearch} actions={actions.nativeSearch} />
    <PinMenu view={view.nativePinMenu} actions={actions.nativePinMenu} />
    {#if view.portalManager}<div class="pc-workspace-overlay"><div class="pc-manager-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-label="Manage portals" onkeydown={managerKeys} onpaste={(event) => event.stopPropagation()}><PortalManager view={view.portalManager} actions={actions.portalManager} /></div></div>{/if}
    {#if view.configureNode}<ConfigureNode view={view.configureNode} actions={actions.configureNode} />{/if}
    {#if view.addSystem && actions.addSystem}<AddSystem view={view.addSystem} actions={actions.addSystem} />{/if}
    {#if view.subgraphSave}<SubgraphSave view={view.subgraphSave} actions={actions.subgraphSave} />{/if}
    {#if view.importReview}<ImportReview view={view.importReview} {actions} />{/if}
    {#if view.documentPrompt}<DocumentPrompt view={view.documentPrompt} actions={actions.documentPrompt} native={view.document?.native ?? false} />{/if}
</div>

<style>
    .pc-workspace-dialog.pc-node-guide-dialog { width: 660px; max-width: calc(100% - 24px); max-height: calc(100% - 24px); padding: 0; overflow: auto; background: var(--pc-panel-solid); border-radius: var(--pc-r-sm); }
    .pc-node-guide-dialog > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; position: sticky; top: 0; z-index: 2; margin: 0; padding: 12px 20px; background: var(--pc-panel-solid); border-bottom: 1px solid var(--pc-border); }
    .pc-node-guide-dialog h2 { margin: 0; font-size: 17px; }
    .pc-workspace-dialog a { color: var(--pc-accent); }
    .pc-workspace-dialog.pc-examples-dialog { box-sizing: border-box; display: flex; flex-direction: column; width: 760px; height: 680px; max-width: calc(100% - 24px); max-height: calc(100% - 24px); padding: 0; overflow: hidden; border-radius: 4px; background: var(--pc-panel-solid); }
    .pc-examples-dialog > header { flex: none; height: 42px; box-sizing: border-box; padding: 7px 10px; margin: 0; border-bottom: 1px solid var(--pc-border); }
    .pc-examples-dialog h2 { font-size: 14px; margin: 0; }
    .pc-manager-dialog { max-height: calc(100% - 24px); max-width: calc(100% - 24px); overflow: auto; border-radius: 4px; }
    .pc-workspace-details { flex: 0 0 var(--pc-details-width, 258px); width: var(--pc-details-width, 258px); min-width: 0; overflow: auto; border-left: 1px solid var(--pc-border); background: var(--pc-panel); display: flex; flex-direction: column; }
    .pc-node-details-holder:not([hidden]) { flex: 1; display: flex; flex-direction: column; }
    .pc-details-heading { flex: none; display: flex; align-items: center; gap: 5px; padding: 8px 12px; font-size: 11px; border-bottom: 1px solid var(--pc-border); }
    .pc-details-heading strong { margin-right: auto; }
    .pc-workspace-run { position: absolute; left: 14px; bottom: 13px; z-index: 20; }
    .pc-native-flat :global(.pc-canvas-host) { background-image: none; }
    .pc-native-workspace { --pc-r: 4px; --pc-r-sm: 2px; }

    .pc-native-workspace :global(.pc-preview-pane) { position: relative; box-sizing: border-box; background: var(--pc-panel); border-radius: 4px; box-shadow: inset 2px 2px 3px #00000070, inset -1px -1px 0 #ffffff20; }
    .pc-native-workspace :global(.pc-preview-pane-head) { display: none; }
    .pc-native-workspace :global(.pc-canvas-area) { border-color: var(--pc-flow); border-radius: 4px; box-shadow: inset 2px 2px 3px #00000070, inset -1px -1px 0 #ffffff20; overflow: visible; }
    .pc-native-workspace :global(.pc-canvas-area::after), .pc-native-workspace :global(.pc-preview-pane::after) { content: ""; position: absolute; inset: 1px; border-radius: 3px; box-shadow: inset 2px 2px 3px #00000070, inset -1px -1px 0 #ffffff20; pointer-events: none; z-index: 4; }
    .pc-native-workspace :global(.pc-graph-tabs) { padding: 0; }
    .pc-native-diagnostic { position: absolute; top: 10px; left: 12px; right: 12px; z-index: 10; margin: 0; padding: 8px 10px; border: 1px solid var(--pc-border); border-radius: 2px; background: var(--pc-panel); font-size: 12px; }
    .pc-native-workspace.pc-native-workspace :global(.pc-graph-tab[aria-selected="true"]) { color: var(--pc-flow); border-color: var(--pc-flow); background: var(--pc-canvas); }
    .pc-native-workspace :global(.pc-graph-tab-list) { padding: 0 6px 3px 0; margin-bottom: -3px; }
    .pc-native-workspace :global(.pc-graph-tab[aria-selected="true"]::after) { background: var(--pc-canvas); }
    /* Round the lower shoulders into one continuous frame stroke. */
    .pc-native-workspace :global(.pc-graph-tab-active) { z-index: 1; }
    .pc-native-workspace :global(.pc-graph-tab-active::before),
    .pc-native-workspace :global(.pc-graph-tab-active::after) { content: ''; position: absolute; bottom: -1px; width: 5px; height: 5px; pointer-events: none; z-index: 1; }
    .pc-native-workspace :global(.pc-graph-tab-active::before) { left: -4px; background: radial-gradient(circle at 0 0, transparent 4px, var(--pc-flow) 4px 5px, var(--pc-canvas) 5px); }
    .pc-native-workspace :global(.pc-graph-tab-active::after) { right: -4px; background: radial-gradient(circle at 100% 0, transparent 4px, var(--pc-flow) 4px 5px, var(--pc-canvas) 5px); }
    .pc-native-workspace :global(.pc-graph-tab-active:first-child::before) { display: none; }
    /* The first tab continues the frame's left edge without a rounded notch. */
    .pc-native-workspace :global(.pc-graph-tabs:has(.pc-graph-tab-item:first-child.pc-graph-tab-active) + :is(.pc-canvas-area, .pc-graph-location)),
    .pc-native-workspace :global(.pc-graph-tabs:has(.pc-graph-tab-item:first-child.pc-graph-tab-active) + .pc-canvas-area .pc-canvas-host),
    .pc-native-workspace :global(.pc-graph-tabs:has(.pc-graph-tab-item:first-child.pc-graph-tab-active) + .pc-canvas-area::after) { border-top-left-radius: 0; }
    .pc-native-workspace :global(.pc-graph-location) { flex: 0 0 auto; border-color: var(--pc-flow); background: var(--pc-canvas); }
    .pc-native-workspace :global(.pc-canvas-host) { border-radius: 4px; }
    .pc-native-workspace :global(.pc-inspector) { box-sizing: border-box; flex-basis: var(--pc-details-width, 258px); width: var(--pc-details-width, 258px); padding: 0; position: static; }
    .pc-native-workspace :global(.pc-node-native) { background: var(--pc-block); border-radius: 4px; }
    .pc-native-workspace :global(.pc-family-input .pc-native-heading), .pc-native-workspace :global(.pc-family-input .pc-native-alias) { color: #96ad52; }
    .pc-native-workspace :global(.pc-family-shaping .pc-native-heading), .pc-native-workspace :global(.pc-family-shaping .pc-native-alias) { color: #589aab; }
    .pc-native-workspace :global(.pc-family-surface .pc-native-heading), .pc-native-workspace :global(.pc-family-surface .pc-native-alias) { color: #92c9ad; }
    .pc-native-workspace :global(.pc-family-transpose .pc-native-heading), .pc-native-workspace :global(.pc-family-transpose .pc-native-alias) { color: #9080b6; }
    .pc-native-workspace :global(.pc-family-derive .pc-native-heading), .pc-native-workspace :global(.pc-family-derive .pc-native-alias) { color: #b65b9e; }
    .pc-native-workspace :global(.pc-family-output .pc-native-heading), .pc-native-workspace :global(.pc-family-output .pc-native-alias) { color: #c96d82; }
    .pc-native-workspace :global(.pc-family-subgraphs .pc-native-heading), .pc-native-workspace :global(.pc-family-subgraphs .pc-native-alias) { color: #a3aa99; }
    @media (max-width: 860px) {
        .pc-native-workspace :global(.pc-body) { flex-direction: column; overflow: auto; }
        .pc-native-workspace :global(.pc-stage) { flex: none; height: max(440px, 65vh); width: 100%; }
        .pc-native-workspace :global(.pc-inspector) { flex: none; width: 100%; }
        .pc-workspace-details { flex: none; width: 100%; border-left: 0; border-top: 1px solid var(--pc-border); min-height: 150px; }
    }
</style>
