<script lang="ts">
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import { onDestroy } from 'svelte';
    import type { ManagerCapture, ManagerEndpoint, ManagerResponse, ManagerScope, PortalManagerActions, PortalManagerView } from './manager-types';
    let { view, actions = {} }: { view: PortalManagerView | null; actions?: PortalManagerActions } = $props();
    let name = $state(''), newName = $state(''), sourceKey = $state(''), receiverKey = $state(''), disposition = $state(''), replace = $state(false), error = $state(''), pending = $state('');
    let loaded = '', sequence = 0, alive = true;
    const scopeKey = (value: ManagerScope) => JSON.stringify(value.kind === 'graph' ? ['graph', value.workflowId, value.instancePath, value.definitionRef ? [value.definitionRef.id, value.definitionRef.version, value.definitionRef.semanticHash] : null] : ['library', value.definitionRef.id, value.definitionRef.version, value.definitionRef.semanticHash]);
    const publisher = $derived(view?.publishers.find(item => item.id === view.selectedPortalId));
    const canRename = $derived(!!view && !!publisher && view.capabilities.rename && (view.renameMode === 'presentation' ? view.canPresent : view.scope.kind === 'graph' && !view.readOnly) && !!actions.rename);
    const source = $derived(view?.sources.find(item => item.key === sourceKey && item.direction === 'output'));
    const receiver = $derived(view?.receivers.find(item => item.key === receiverKey && item.direction === 'input' && item.kind === publisher?.kind));
    const canConnect = $derived(!!publisher && !!receiver && (!receiver.occupied || replace) && permitted('connect') && !!actions.connect);
    const canDelete = $derived(!!publisher && permitted('remove') && !!actions.deletePublisher && (!view?.consumers.length || disposition === 'restore' || disposition === 'disconnect'));
    $effect(() => {
        const key = view ? JSON.stringify([view.managerKey, view.revision, scopeKey(view.scope), view.selectedPortalId, view.renameMode]) : '';
        if (loaded !== key) { loaded = key; name = publisher?.label ?? ''; newName = ''; sourceKey = view?.sources.find(item => item.nodeId === publisher?.source.nodeId && item.portId === publisher?.source.portId)?.key ?? ''; receiverKey = ''; disposition = ''; replace = false; error = ''; pending = ''; sequence++; }
    });
    onDestroy(() => { alive = false; sequence++; });
    const capture = (current: PortalManagerView): ManagerCapture => ({ managerKey: current.managerKey, revision: current.revision, scope: $state.snapshot(current.scope) });
    const endpoint = (value: ManagerEndpoint): ManagerEndpoint => ({ nodeId: value.nodeId, portId: value.portId });
    function permitted(key: keyof PortalManagerView['capabilities']) { return !!view && !view.readOnly && view.scope.kind === 'graph' && view.capabilities[key]; }
    function changed() { error = ''; pending = ''; sequence++; }
    async function perform(key: string, permitted: boolean, call: (captured: ManagerCapture) => ManagerResponse) {
        if (!view || !permitted || pending) return;
        const captured = capture(view), serial = ++sequence, subject = view.selectedPortalId;
        pending = key; error = '';
        try {
            const result = await call(captured);
            if (alive && serial === sequence && view?.managerKey === captured.managerKey && view.revision === captured.revision && scopeKey(view.scope) === scopeKey(captured.scope) && view.selectedPortalId === subject) { pending = ''; error = result.ok ? '' : result.error.code + ': ' + result.error.message; }
        } catch (failure) {
            if (alive && serial === sequence && view?.managerKey === captured.managerKey && view.revision === captured.revision && scopeKey(view.scope) === scopeKey(captured.scope) && view.selectedPortalId === subject) { pending = ''; error = failure instanceof Error ? failure.message : 'The portal change could not be accepted.'; }
        }
    }
</script>

<section class="pc-manager" aria-label="Manage portals">
    <header><h2>Manage portals</h2>{#if actions.close}<button type="button" onclick={() => actions.close?.()}>Close</button>{/if}</header>
    {#if view}
        <p class="pc-note">{view.scopeLabel}{view.readOnly ? ' · Read-only graph' : ''}</p>
        <label>Portal<select aria-label="Selected portal" value={view.selectedPortalId ?? ''} disabled={!actions.selectPortal} onchange={event => { const id = event.currentTarget.value; if (event.currentTarget.selectedIndex >= 0 && view && actions.selectPortal && (!id || view.publishers.some(item => item.id === id))) actions.selectPortal(capture(view), id || null); }}><option value="">Select portal…</option>{#each view.publishers as item (item.id)}<option value={item.id}>{item.label} · {item.kind}</option>{/each}</select></label>
        {#if publisher}
            <label>Portal name<input aria-label="Portal name" value={name} disabled={!canRename} oninput={event => { name = event.currentTarget.value; changed(); }} /></label>
            <p class="pc-note">{view.renameMode === 'presentation' ? 'Local workspace label · not exported' : 'Authored portal label'} · {publisher.kind}</p>
            <div class="pc-actions"><button type="button" data-portal-rename disabled={!canRename || !!pending} onclick={() => { const id = publisher?.id, mode = view?.renameMode, label = name; if (id && mode && actions.rename) void perform('rename', canRename, captured => actions.rename!(captured, id, label, mode)); }}>Rename</button></div>
        {:else}<p class="pc-note">Select a portal or create one from an output.</p>{/if}
        <details open><summary>Source</summary>
            <label>Output<select aria-label="Portal source" value={sourceKey} disabled={!permitted('create') && !permitted('retarget')} onchange={event => { sourceKey = event.currentTarget.value; changed(); }}><option value="">Select output…</option>{#each view.sources as item (item.key)}<option value={item.key}>{item.label} · {item.kind}</option>{/each}</select></label>
            <label>New portal name<input aria-label="New portal name" value={newName} disabled={!permitted('create') || !actions.create} oninput={event => { newName = event.currentTarget.value; changed(); }} /></label>
            <div class="pc-actions">
                <button type="button" data-portal-create disabled={!permitted('create') || !actions.create || !source || !newName.trim() || !!pending} onclick={() => { const value = source, label = newName; if (value && label.trim() && actions.create) void perform('create', permitted('create'), captured => actions.create!(captured, label, endpoint(value))); }}>Create portal</button>
                <button type="button" data-portal-retarget disabled={!permitted('retarget') || !actions.retarget || !source || !publisher || !!pending} onclick={() => { const value = source, id = publisher?.id; if (value && id && actions.retarget) void perform('retarget', permitted('retarget'), captured => actions.retarget!(captured, id, endpoint(value))); }}>Retarget</button>
                {#if publisher && actions.jumpSource}<button type="button" data-portal-jump-source onclick={() => { if (view && publisher) actions.jumpSource?.(capture(view), endpoint(publisher.source)); }}>Jump to source</button>{/if}
            </div>
        </details>
        {#if publisher}
            <details open><summary>Consumers</summary>
                <label>Compatible receiver<select aria-label="Compatible receiver" value={receiverKey} disabled={!permitted('connect') || !actions.connect} onchange={event => { receiverKey = event.currentTarget.value; replace = false; changed(); }}><option value="">Select input…</option>{#each view.receivers as item (item.key)}<option value={item.key}>{item.label}{item.occupied ? ' · Connected' : ''}</option>{/each}</select></label>
                {#if receiver?.occupied}<label class="pc-check"><input type="checkbox" aria-label="Replace existing connection" checked={replace} disabled={!permitted('connect')} onchange={event => { replace = event.currentTarget.checked; changed(); }} />Replace existing connection</label>{/if}
                <div class="pc-actions"><button type="button" data-portal-connect disabled={!canConnect || !!pending} onclick={() => { const to = receiver, id = publisher?.id, replacing = replace; if (to && id && actions.connect) void perform('connect', canConnect, captured => actions.connect!(captured, id, endpoint(to), replacing)); }}>Connect receiver</button></div>
                {#each view.consumers as consumer (consumer.edgeId)}
                    <div class="pc-consumer"><span>{consumer.label}</span><div class="pc-actions">
                        <button type="button" data-portal-restore disabled={!permitted('restore') || !actions.restoreWire || !!pending} onclick={() => { const current = view?.consumers.find(item => item.edgeId === consumer.edgeId); if (current && actions.restoreWire) void perform('restore', permitted('restore'), captured => actions.restoreWire!(captured, current.edgeId)); }}>Restore wire</button>
                        {#if actions.jumpConsumer}<button type="button" data-portal-jump-consumer onclick={() => { const current = view?.consumers.find(item => item.edgeId === consumer.edgeId); if (view && current) actions.jumpConsumer?.(capture(view), current.edgeId, endpoint(current.to)); }}>Jump</button>{/if}
                    </div></div>
                {/each}
                {#if !view.consumers.length}<p class="pc-note">No consumers.</p>{/if}
                {#if view.consumers.length}<label>Existing consumers<select aria-label="Existing consumers" value={disposition} disabled={!permitted('remove')} onchange={event => { disposition = event.currentTarget.value; changed(); }}><option value="">Choose before deleting…</option><option value="restore">Restore visible wires</option><option value="disconnect">Disconnect consumers</option></select></label>{/if}
                <div class="pc-actions"><button type="button" data-portal-delete disabled={!canDelete || !!pending} onclick={() => { const id = publisher?.id, choice = view?.consumers.length ? disposition : 'restore'; if (id && (choice === 'restore' || choice === 'disconnect') && actions.deletePublisher) void perform('remove', canDelete, captured => actions.deletePublisher!(captured, id, choice)); }}>Delete portal</button></div>
            </details>
        {/if}
        {#if view.conversion}<details open><summary>Convert to portal</summary><p class="pc-note">{view.conversion.label}</p><div class="pc-actions"><button type="button" data-portal-convert disabled={!permitted('convert') || !!pending || (view.conversion.kind === 'wire' ? !actions.convertWire : !actions.convertOutput)} onclick={() => { const value = view?.conversion; if (value?.kind === 'wire' && actions.convertWire) void perform('convert', permitted('convert'), captured => actions.convertWire!(captured, value.edgeId)); else if (value?.kind === 'output' && actions.convertOutput) void perform('convert', permitted('convert'), captured => actions.convertOutput!(captured, endpoint(value.endpoint))); }}>Convert {view.conversion.kind === 'wire' ? 'wire' : 'output'}</button></div></details>{/if}
        {#if view.issue}<div class="pc-error"><DiagnosticMessage issue={view.issue} /></div>{/if}
        {#if error}<div class="pc-error"><DiagnosticMessage issue={error} /></div>{/if}
        {#if pending}<p class="pc-note" role="status">Preparing change…</p>{/if}
    {:else}<p class="pc-note">Open a graph to manage its portals.</p>{/if}
</section>

<style>
    .pc-manager { box-sizing: border-box; width: 390px; max-width: 100%; padding: 14px; border: 1px solid var(--pc-border); border-radius: var(--pc-r); background: var(--pc-manager-background, var(--pc-panel-solid)); color: var(--pc-text); box-shadow: 0 8px 28px #0005; font-size: 12px; }
    header { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; } h2 { margin: 0 auto 0 0; font-size: 14px; font-weight: 600; }
    label { display: block; margin-top: 10px; } input:not([type='checkbox']), select { display: block; box-sizing: border-box; width: 100%; margin-top: 5px; padding: 6px 8px; border: 1px solid var(--pc-border); border-radius: var(--pc-r-sm); background: var(--pc-field); color: var(--pc-text); font: inherit; box-shadow: none; }
    details { margin-top: 8px; padding: 9px 0 10px; border-top: 1px solid var(--pc-border); } summary { color: var(--pc-muted); cursor: pointer; } .pc-check { display: flex; align-items: center; gap: 6px; } input[type='checkbox'] { accent-color: var(--pc-accent); } .pc-consumer { margin-top: 10px; } .pc-consumer .pc-actions { margin-top: 5px; }
    .pc-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; } button { padding: 5px 8px; border: 1px solid var(--pc-border); border-radius: var(--pc-r-sm); background: var(--pc-control); color: var(--pc-text); font: inherit; cursor: pointer; box-shadow: none; }
    button:hover:not(:disabled) { background: color-mix(in srgb, var(--pc-text) 7%, var(--pc-control)); } :is(button,input,select,summary):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; } :disabled { opacity: .5; cursor: default; }
    .pc-note { margin: 10px 0 0; color: var(--pc-muted); overflow-wrap: anywhere; } .pc-error { color: var(--pc-error); overflow-wrap: anywhere; }
</style>
