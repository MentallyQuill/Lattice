<script lang="ts">
    import WorkspaceMenus from './WorkspaceMenus.svelte';
    import type { WorkbenchView, WorkbenchActions } from './types';
    let { state, actions, local }: { state: WorkbenchView; actions: WorkbenchActions; local: (command: string) => void } = $props();
    const workflow = $derived(state.rootWorkflow ?? state.workflow);
    const documentState = $derived(state.document?.dirty ? 'Modified' : state.document?.busy ? '' : state.document?.status ? '' : state.document ? 'Saved' : 'Unsaved');
    let header: HTMLElement, arm: HTMLInputElement, inspBtn: HTMLButtonElement;
    export function getParts() { return { header, arm, inspBtn }; }
</script>
<header class="pc-header" data-pc-ui="svelte" bind:this={header}>
    <div class="pc-menubar">
        <div class="pc-brand"><img src={actions.logoUrl} width="30" height="30" alt="" /><span>LATTICE</span></div>
        <WorkspaceMenus {state} {actions} {local} />
        <button type="button" class="pc-btn menu_button pc-close" title="Close" aria-label="Close canvas" onclick={() => actions.command('close')}>×</button>
    </div>
    <div class="pc-workflow-bar">
        <div class="pc-document-heading"><strong class="pc-document-name" title={state.document?.name ?? 'Untitled'}>{state.document?.name ?? 'Untitled'}</strong><span class="pc-document-status" role="status" aria-label="Document status">{documentState}{#if state.document?.busy}{documentState ? ' · ' : ''}Working…{/if}{#if state.document?.status && state.document.status !== documentState}{documentState || state.document.busy ? ' · ' : ''}{state.document.status}{/if}</span></div>
        <div class="pc-header-actions pc-history">
            <button type="button" class={`pc-btn menu_button pc-undo${state.history.undo ? '' : ' pc-disabled'}`} disabled={!state.history.undo} title={state.history.undoTitle} aria-label="Undo" onclick={() => actions.command('undo')}>↶</button>
            <button type="button" class={`pc-btn menu_button pc-redo${state.history.redo ? '' : ' pc-disabled'}`} disabled={!state.history.redo} title={state.history.redoTitle} aria-label="Redo" onclick={() => actions.command('redo')}>↷</button>
            <span class={`pc-history-note${state.history.showNote ? ' pc-show' : ''}`}>{state.history.note}</span>
        </div>
        <span class="pc-root-workflow-status" role="status" aria-label="Workflow status">{workflow ? `${workflow.phase} · ≤ ${workflow.callBound} requests${workflow.status ? ' · ' + workflow.status : ''}` : 'Workflow unavailable'}</span>
        <div class="pc-header-actions pc-surface-actions">
            <button type="button" class={`pc-btn menu_button pc-pane-toggle${state.inspectorOpen ? ' pc-on' : ''}`} title="Show or hide the inspector" aria-label="Toggle inspector" aria-pressed={state.inspectorOpen} bind:this={inspBtn} onclick={() => actions.command('inspector')}>Details</button>
        </div>
        <label class="pc-arm"><input class="pc-arm-input" type="checkbox" checked={state.armed} bind:this={arm} onchange={(event) => actions.arm(event.currentTarget.checked)} /><span>Arm</span></label>
    </div>
</header>
