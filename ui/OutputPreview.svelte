<script lang="ts">
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import { presentDiagnostics } from '../src/ui/diagnostics.js';
    import type { DetailTarget, DetailReviewSelector, OutputPreviewActions, OutputPreviewView } from './detail-types';
    let { view, actions = {}, collapse }: { view: OutputPreviewView | null; actions?: OutputPreviewActions; collapse?: () => void } = $props();
    const previewId = $props.id();
    let diagnostics = $derived.by(() => {
        const items = view?.diagnostics ?? presentDiagnostics([view?.runHere?.issue, ...(view?.issues ?? []), view?.review?.issue].filter((issue): issue is string => !!issue), { nodeTitle: view?.title });
        return items.filter((item, index) => items.findIndex(other => other.id === item.id) === index);
    });
    let sectionScope = $derived(JSON.stringify([view?.sourceKey, view?.selectedKey]));
    let sectionChoice = $state<{ scope: string; id: string | null }>({ scope: '', id: null });
    let activeSection = $derived((sectionChoice.scope === sectionScope ? view?.sections.find(section => section.id === sectionChoice.id) : null) ?? view?.sections[0] ?? null);
    $effect(() => {
        const id = sectionChoice.scope === sectionScope && view?.sections.some(section => section.id === sectionChoice.id) ? sectionChoice.id : view?.sections[0]?.id ?? null;
        if (sectionChoice.scope !== sectionScope || sectionChoice.id !== id) sectionChoice = { scope: sectionScope, id };
    });
    const tabId = (id: string) => previewId + '-tab-' + encodeURIComponent(id);
    function tabKey(event: KeyboardEvent, index: number) {
        event.stopPropagation();
        const sections = view?.sections ?? [];
        if (!sections.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length;
        sectionChoice = { scope: sectionScope, id: sections[next].id };
        const button = event.currentTarget as HTMLButtonElement;
        button.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }
    let selected = $derived(view?.choices.find(choice => choice.key === view?.selectedKey) ?? null);
    const statusLabel = (status: string) => ({ 'not-run': 'Not run', current: 'Current', stale: 'Stale', removed: 'Source removed' }[status] ?? status);
    const addressKey = (target: DetailTarget) => 'kind' in target ? JSON.stringify(['terminal', target.address.workflowId, target.address.instancePath, target.address.nodeId]) : JSON.stringify(['output', target.workflowId, target.instancePath, target.nodeId, target.portId]);
    const copyTarget = (target: DetailTarget): DetailTarget => 'kind' in target ? { kind: 'terminal', address: { ...target.address, instancePath: [...target.address.instancePath] } } : { ...target, instancePath: [...target.instancePath] };
    let canRun = $derived(!!(view && selected && view.status !== 'removed' && !view.busy && view.runHere?.enabled && actions.runHere));
    let selectedReview = $derived(!!(view && selected && view.review?.mode === 'root' && view.review.selectedRootTerminal && 'kind' in selected.target && addressKey(selected.target) === addressKey(view.review.selector.terminal)));
    let canApply = $derived(!!(view && view.status === 'current' && !view.busy && selectedReview && view.review?.fresh && view.review.canApply && actions.apply));
    let canReject = $derived(!!(view && !view.busy && selectedReview && actions.reject));
    let runReason = $derived(!canRun ? view?.runHere?.reason || (view?.busy ? 'Wait for the current run to finish.' : !selected ? 'Select a node on the canvas before running.' : !actions.runHere ? 'Run to here is unavailable in this workspace.' : 'This output cannot run with the current workflow settings.') : undefined);
    let applyReason = $derived(!canApply ? view?.review?.reason || (view?.busy ? 'Wait for the current run to finish.' : view?.status !== 'current' || !view?.review?.fresh ? 'Run this workflow again to review a current result.' : !selectedReview ? 'Select the root workflow’s reviewed reply to apply it.' : !actions.apply ? 'Apply is unavailable in this workspace.' : 'This reviewed reply cannot be applied with the current workflow settings.') : undefined);
    let runDiagnosticIndex = $derived(diagnostics.findIndex(item => item.message === runReason));
    let applyDiagnosticIndex = $derived(diagnostics.findIndex(item => item.message === applyReason));
    let runDescription = $derived(runReason ? previewId + (runDiagnosticIndex >= 0 ? '-diagnostic-' + runDiagnosticIndex : '-run-reason') : undefined);
    let applyDescription = $derived(applyReason ? previewId + (applyDiagnosticIndex >= 0 ? '-diagnostic-' + applyDiagnosticIndex : '-apply-reason') : undefined);
    function copySelector(value: DetailReviewSelector): DetailReviewSelector {
        const terminal = { kind: 'terminal' as const, address: { ...value.terminal.address, instancePath: [...value.terminal.address.instancePath] } };
        return { handleId: value.handleId, runId: value.runId, terminal };
    }
</script>

<section class="pc-output-preview" aria-label="Output preview">
{#if view}
    <header>
        <h3>{selected?.label ?? view.title}</h3>
        <div class="pc-preview-tools"><button type="button" aria-label="Pin preview" title={view.pinned ? 'Unpin and follow selection' : 'Keep this output visible'} aria-pressed={view.pinned} disabled={view.pinned ? !actions.follow : !selected || !actions.pin} onclick={() => { if (view?.pinned) actions.follow?.(); else if (view && selected) actions.pin?.(view.sourceKey, copyTarget(selected.target)); }}>{view.pinned ? 'Pinned output' : 'Pin output'}</button>{#if collapse}<button type="button" aria-label="Collapse preview" title="Collapse preview" onclick={collapse}>▴</button>{/if}</div>
    </header>
    {#if view.sections.length}
        <div class="pc-preview-tabs" role="tablist" aria-label="Recorded artifacts">
            {#each view.sections as section, index (section.id)}
                <button type="button" role="tab" id={tabId(section.id)} aria-selected={activeSection?.id === section.id} aria-controls={previewId + '-panel'} tabindex={activeSection?.id === section.id ? 0 : -1} onclick={() => { sectionChoice = { scope: sectionScope, id: section.id }; }} onkeydowncapture={event => tabKey(event, index)}>{section.label}</button>
            {/each}
        </div>
    {/if}
    <div class="pc-preview-sections">
        {#if activeSection}
            {@const section = activeSection}
            <div role="tabpanel" tabindex="0" onkeydowncapture={event => event.stopPropagation()} onpastecapture={event => event.stopPropagation()} id={previewId + '-panel'} aria-labelledby={tabId(section.id)}>
                <article data-artifact-kind={section.kind}>
                    <div class="pc-preview-section-heading"><span>{section.label}</span><small>{section.kind}</small></div>
                    {#if section.format === 'omitted'}<DiagnosticMessage issue={section.text} />
                    {:else}<pre>{section.text}</pre>{/if}
                    {#if section.truncated}<small class="pc-preview-note">Only part of the recorded output is displayed here. This display limit does not mean the model stopped early.{section.format === 'json-prefix-text' ? ' The JSON prefix is shown as text.' : ''}</small>{/if}
                </article>
            </div>
        {:else if !diagnostics.length}
            <p class="pc-preview-empty">{view.emptyMessage ?? (view.status === 'not-run' ? 'This output has not run yet. Use Run to here, or enable Lattice and send a message in SillyTavern.' : 'No output was kept for this step. Run it again if you need to inspect its result.')}</p>
        {/if}
        {#if view.settlement}
            <section aria-label="Accepted consequences" class="pc-preview-settlement">
                <strong>Accepted consequences · {view.settlement.status === 'settled' ? 'Saved' : view.settlement.status === 'partial' ? 'Some targets failed' : 'Save confirmation needed'}</strong>
                {#each view.settlement.receipts as receipt (receipt.intentId + ':' + receipt.targetId)}
                    <p class="pc-preview-note">{receipt.targetId} · {receipt.status === 'confirmed' || receipt.status === 'persisted' ? 'Saved' : receipt.status === 'failed' ? 'Save failed' : receipt.status === 'unknown' ? 'Save outcome unknown' : receipt.status === 'save-unverified' || receipt.status === 'unverified' ? 'Save not verified' : receipt.status === 'unchanged' ? 'Already current' : receipt.status}</p>
                    {#if receipt.error}<DiagnosticMessage issue={receipt.error} context={{ operation: 'save', nodeTitle: receipt.targetId }} />{/if}
                {/each}
            </section>
        {/if}
        {#if view.statusDetail}<p class="pc-preview-note">{view.statusDetail}</p>{/if}
        {#if view.historyNotice}<p class="pc-preview-note">{view.historyNotice}</p>{/if}
        {#each view.sections.filter(section => section.id !== activeSection?.id && (section.format === 'omitted' || section.truncated)) as section (section.id)}
            {#if section.format === 'omitted'}<div class="pc-preview-note"><span>{section.label}</span><DiagnosticMessage issue={section.text} /></div>{:else}<p class="pc-preview-note">{section.label}: Only part of the recorded output is displayed here; this is a display limit.{section.format === 'json-prefix-text' ? ' The JSON prefix is shown as text.' : ''}</p>{/if}
        {/each}
        {#each diagnostics as diagnostic, index (diagnostic.id)}<div id={previewId + '-diagnostic-' + index}><DiagnosticMessage {diagnostic} reveal={actions.reveal} /></div>{/each}
        {#if view.review}<small class="pc-preview-note">{view.review.persistOnly ? 'Retry keeps the accepted reply and retries only authorized targets whose saves failed. It makes no model request. Unknown or unverified saves cannot be retried here.' : 'Apply checks that the source, connection and reviewed reply are still current. The displayed preview may show only part of the recorded output.'}</small>{/if}
    </div>
    <footer>
        <span class="pc-preview-status" data-status={view.status}>{statusLabel(view.status)}</span>
        <span>{view.targeted ? 'Targeted node' : view.pinned ? 'Pinned preview' : view.followSelection ? 'Following selection' : 'Selection not followed'}</span>
        {#if view.runHere}<button type="button" data-run-here aria-describedby={runDescription} title="Runs the selected output's dependencies within the displayed request limit." disabled={!canRun} onclick={() => { if (view && selected && canRun) actions.runHere?.(view.sourceKey, copyTarget(selected.target)); }}>Run to here · maximum {view.runHere.callBound} {view.runHere.callBound === 1 ? 'request' : 'requests'}</button>{#if runReason && runDiagnosticIndex < 0}<p id={previewId + '-run-reason'} class="pc-preview-note">{runReason}</p>{/if}{/if}
        {#if view.review}<button type="button" data-preview-apply aria-describedby={applyDescription} disabled={!canApply} onclick={() => { if (view?.review && canApply) actions.apply?.(copySelector(view.review.selector)); }}>{view.review.persistOnly ? 'Retry failed saves' : 'Apply reviewed reply'}</button>{#if applyReason && applyDiagnosticIndex < 0}<p id={previewId + '-apply-reason'} class="pc-preview-note">{applyReason}</p>{/if}<button type="button" disabled={!canReject} onclick={() => { if (view?.review && canReject) actions.reject?.(copySelector(view.review.selector)); }}>{view.review.persistOnly ? 'Close save review' : 'Reject reply'}</button>{/if}
    </footer>
{:else}
    <p class="pc-preview-empty">Select a node on the canvas to inspect its recorded result.</p>
{/if}
</section>

<style>
    .pc-output-preview { box-sizing: border-box; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; color: var(--pc-text, #deded9); font: inherit; font-size: 12px; line-height: 1.4; }
    header { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 7px 10px; border-bottom: 1px solid var(--pc-border, #3a3c35); }
    h3 { flex: 1 1 140px; min-width: 0; margin: 0; font-size: 14px; font-weight: 400; overflow-wrap: anywhere; }
    small { color: var(--pc-muted, #a1a59b); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
    button { min-height: 25px; max-width: 100%; padding: 4px 7px; border: 0; border-radius: 2px; background: transparent; color: inherit; font: inherit; font-size: 12px; line-height: 1.4; cursor: pointer; box-shadow: none; overflow-wrap: anywhere; }
    button:hover:not(:disabled) { background: var(--pc-raised, #353632); }
    button[aria-pressed='true'], button[aria-selected='true'] { background: #ffffff06; }
    :is(button, [role='tabpanel']):focus-visible { outline: 2px solid var(--pc-accent, #e18a24); outline-offset: -2px; }
    :disabled { opacity: .55; cursor: default; }
    .pc-preview-tools { display: flex; flex-wrap: wrap; gap: 2px; min-width: 0; }
    .pc-preview-tabs { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 2px; padding: 0 7px; border-bottom: 1px solid var(--pc-border, #3a3c35); }
    .pc-preview-tabs button { position: relative; border-radius: 0; }
    .pc-preview-tabs button[aria-selected='true']::after { content: ''; position: absolute; left: 7px; right: 7px; bottom: 0; height: 2px; background: var(--pc-accent, #e18a24); }
    .pc-preview-sections { flex: 1 1 0; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 10px 14px; scrollbar-width: thin; }
    article { min-width: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
    .pc-preview-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; color: var(--pc-muted, #a1a59b); }
    pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-family: inherit; font-size: 12px; line-height: 1.55; }
    .pc-preview-note, .pc-preview-empty { margin: 0; color: var(--pc-muted, #a1a59b); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
    .pc-preview-note { display: block; margin-top: 7px; }
    footer { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; padding: 4px 10px; color: var(--pc-muted, #a1a59b); background: var(--pc-raised, #353632); }
    footer button { color: var(--pc-text, #deded9); }
    .pc-preview-status[data-status='stale'] { color: #c6ad75; } .pc-preview-status[data-status='removed'] { color: #e08f8f; }
    @media (max-width: 480px) {
        header { gap: 3px; padding: 5px 8px; }
        h3 { flex-basis: 100%; font-size: 13px; }
        .pc-preview-tools { flex-wrap: nowrap; width: 100%; }
        .pc-preview-tools button { flex: 1 1 auto; min-width: 0; padding: 3px 4px; font-size: 11px; }
        .pc-preview-tabs { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: thin; }
        .pc-preview-tabs button { flex: 0 0 auto; }
        .pc-preview-sections { min-height: 55px; padding: 8px 12px; }
        header, footer { flex-shrink: 1; min-height: 0; overflow-y: auto; }
        footer { padding: 3px 8px; gap: 0 7px; }
        footer button { padding: 3px 4px; font-size: 11px; }
    }
</style>
