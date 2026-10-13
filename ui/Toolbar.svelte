<script lang="ts">
    import WorkspaceMenus from './WorkspaceMenus.svelte';
    import type { WorkspaceMenuPanels } from './workspace-menu-model';
    import type { WorkbenchView, WorkbenchActions } from './types';
    let { state, actions, local, panels }: { state: WorkbenchView; actions: WorkbenchActions; local: (command: string) => void; panels?: WorkspaceMenuPanels } = $props();
    const workflow = $derived(state.rootWorkflow ?? state.workflow);
    const documentState = $derived(state.document?.dirty ? 'Modified' : state.document?.busy ? '' : state.document?.status ? '' : state.document ? 'Saved' : 'Unsaved');
    let header: HTMLElement, enabledControl: HTMLInputElement, inspBtn: HTMLButtonElement;
    export function getParts() { return { header, enabledControl, inspBtn }; }
</script>
<header class="pc-header" data-pc-ui="svelte" bind:this={header}>
    <div class="pc-menubar">
        <div class="pc-brand"><img src={actions.logoUrl} width="30" height="30" alt="" /><span>LATTICE</span></div>
        <WorkspaceMenus {state} {actions} {local} {panels} />
        <button type="button" class="pc-btn menu_button pc-close" title="Close" aria-label="Close canvas" onclick={() => actions.command('close')}>×</button>
    </div>
    <div class="pc-workflow-bar">
        <div class="pc-document-heading"><strong class="pc-document-name" title={state.document?.name ?? 'Untitled'}>{state.document?.name ?? 'Untitled'}</strong><span class="pc-document-status" role="status" aria-label="Document status">{documentState}{#if state.document?.busy}{documentState ? ' · ' : ''}Working…{/if}{#if state.document?.status && state.document.status !== documentState}{documentState || state.document.busy ? ' · ' : ''}{state.document.status}{/if}</span></div>
        <div class="pc-header-actions pc-history">
            <button type="button" class={`pc-btn menu_button pc-undo${state.history.undo ? '' : ' pc-disabled'}`} disabled={!state.history.undo} title={state.history.undoTitle} aria-label="Undo" onclick={() => actions.command('undo')}>↶</button>
            <button type="button" class={`pc-btn menu_button pc-redo${state.history.redo ? '' : ' pc-disabled'}`} disabled={!state.history.redo} title={state.history.redoTitle} aria-label="Redo" onclick={() => actions.command('redo')}>↷</button>
            <span class={`pc-history-note${state.history.showNote ? ' pc-show' : ''}`}>{state.history.note}</span>
        </div>
        {#if workflow?.ownedBusy || workflow?.busy}<button type="button" class="pc-btn menu_button pc-root-stop" title="Stop the workflow" onclick={() => actions.command('stop-workflow')}>■ Stop</button>{/if}
        <span class="pc-root-workflow-status" role="status" aria-label="Workflow status">{workflow ? `${workflow.phase} · ≤ ${workflow.callBound} requests${workflow.status ? ' · ' + workflow.status : ''}` : 'Workflow unavailable'}</span>
        <div class="pc-header-actions pc-surface-actions">
            <button type="button" class={`pc-btn menu_button pc-pane-toggle${panels?.previewOpen ? ' pc-on' : ''}`} title="Toggle Preview Panel" aria-label="Toggle Preview Panel" aria-pressed={!!panels?.previewOpen} onclick={() => local('toggle-preview')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg>
            </button>
            <button type="button" class={`pc-btn menu_button pc-pane-toggle${state.inspectorOpen ? ' pc-on' : ''}`} title="Toggle Details Panel" aria-label="Toggle Details Panel" aria-pressed={state.inspectorOpen} bind:this={inspBtn} onclick={() => actions.command('inspector')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
            </button>
        </div>
        <label class="pc-enable" class:pc-on={state.enabled}>
            <span class="pc-enable-logo" style={`--pc-enable-logo: url("${actions.logoUrl}")`} aria-hidden="true"></span>
            <span class="pc-enable-caption">Enable Lattice</span>
            <input class="pc-enable-input" type="checkbox" role="switch" aria-label="Enable Lattice" checked={state.enabled} bind:this={enabledControl} onchange={(event) => actions.setEnabled(event.currentTarget.checked)} />
            <span class="pc-enable-state" aria-hidden="true">{state.enabled ? 'On' : 'Off'}</span>
        </label>
    </div>
</header>
