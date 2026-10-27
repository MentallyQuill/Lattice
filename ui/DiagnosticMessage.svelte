<script lang="ts">
    import { diagnosticSchemaFindings, presentDiagnostic } from '../src/ui/diagnostics.js';
    import type { DiagnosticInput, DiagnosticContext, DiagnosticView, DiagnosticAddress } from './diagnostic-types';
    let { issue, context = {}, diagnostic, reveal }: { issue?: string | DiagnosticInput; context?: DiagnosticContext; diagnostic?: DiagnosticView; reveal?: (address: DiagnosticAddress) => void } = $props();
    let view = $derived(diagnostic ?? presentDiagnostic(issue, context));
    let finding = $derived(diagnosticSchemaFindings(view)[0]);
    let address = $derived(view.address);
    let navigable = $derived(!!(reveal && address && typeof address.workflowId === 'string' && address.workflowId.trim() && address.workflowId.length <= 256 && typeof address.nodeId === 'string' && address.nodeId.trim() && address.nodeId.length <= 256 && Array.isArray(address.instancePath) && address.instancePath.length <= 8 && address.instancePath.every(part => typeof part === 'string' && part.trim() && part.length <= 256)));
    const severityLabel = (severity: DiagnosticView['severity']) => ({ info: 'Information', warning: 'Warning', error: 'Error' }[severity]);
</script>

<div class="pc-diagnostic" data-diagnostic={view.id} data-severity={view.severity}>
    <strong><span class="pc-diagnostic-severity">{severityLabel(view.severity)}:</span>{' '}{view.title}</strong>
    <p>{view.message}</p>
    {#if finding}<p data-diagnostic-finding><code>{finding.path || '/'} · {finding.keyword}</code>: {finding.message}</p>{/if}
    {#if view.technical}<details><summary>Technical details</summary>{#if view.technical.code}<code>{view.technical.code}</code>{/if}{#if view.technical.message}<p>{view.technical.message}</p>{/if}</details>{/if}
    {#if navigable}<button type="button" onclick={() => { if (navigable && address) reveal?.({ ...address, instancePath: [...address.instancePath] }); }}>Show node</button>{/if}
</div>

<style>
    .pc-diagnostic { margin: 7px 0; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; color: var(--pc-muted, #a1a59b); }
    .pc-diagnostic[data-severity='warning'] { color: var(--pc-warn, #c6ad75); }
    .pc-diagnostic[data-severity='error'] { color: var(--pc-error, #e08f8f); }
    strong { font-weight: 500; } p { margin: 3px 0; } details { margin-top: 5px; color: var(--pc-muted, #a1a59b); }
    summary { cursor: pointer; } code { font-size: 11px; white-space: pre-wrap; }
    button { margin-top: 5px; padding: 3px 7px; border: 1px solid var(--pc-border, #3a3c35); border-radius: 2px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
    :is(summary, button):focus-visible { outline: 2px solid var(--pc-accent, #e18a24); outline-offset: 2px; }
</style>
