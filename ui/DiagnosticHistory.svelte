<script lang="ts">
    import { diagnosticSchemaFindings } from '../src/ui/diagnostics.js';
    import type { DiagnosticHistoryActions, DiagnosticHistoryView } from './diagnostic-history-types';
    import type { DiagnosticError, DiagnosticLog } from '../src/workflow/diagnostic-history';
    let { view, actions }: { view: DiagnosticHistoryView | null; actions?: DiagnosticHistoryActions } = $props();
    const statusLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
    const isoTime = (value: number) => Number.isFinite(value) ? new Date(value).toISOString() : undefined;
    const timestamp = (value: number) => Number.isFinite(value) ? new Date(value).toLocaleString() : 'Unknown time';
    const retainedFailure = (entry: DiagnosticLog) => entry.attempts.find(attempt => attempt.validationError || attempt.error);
    let selected = $derived(view?.entries.find(entry => entry.id === view?.selectedId) ?? null);
    let scopeAvailable = $derived(!!view?.scopeKey && !view.loading);
</script>

<section class="pc-diagnostic-history" aria-label="Saved diagnostic logs">
    <label class="pc-diagnostic-toggle"><input type="checkbox" aria-label="Save diagnostic logs" checked={view?.enabled ?? false} disabled={!view || !actions?.setEnabled} onchange={event => { if (view) actions?.setEnabled(event.currentTarget.checked); }} />Save model responses</label>
    <p>Failure metadata is always retained locally in this browser, including when this switch is off. Model output text requires this opt-in and may contain private story text.</p>
    <p>Turning this on applies to the next run. Turning it off stops response capture immediately. Saved logs stay available until cleared or removed by retention limits.</p>
    <p>Successful and cancelled runs are saved only with this switch on. Keeps up to 50 runs and 5 MiB per user; oldest logs are removed first.</p>
    <h4>Saved logs</h4>
    <div class="pc-diagnostic-history-actions">
        <button type="button" data-diagnostic-export disabled={!scopeAvailable || !view?.entries.length || !actions?.export} onclick={() => { if (scopeAvailable && view?.entries.length) actions?.export(view.scopeKey); }}>Export logs</button>
        <button type="button" data-diagnostic-clear disabled={!scopeAvailable || !actions?.clear} onclick={() => { if (scopeAvailable && view) actions?.clear(view.scopeKey); }}>Clear logs for this chat</button>
    </div>
    {#if view?.issue}<p class="pc-diagnostic-storage-issue">{view.issue}</p>{/if}
    {#if view?.loading}<p>Loading saved logs…</p>{:else if !view?.entries.length}<p>No saved logs for this chat.</p>{/if}
    <ol class="pc-diagnostic-log-list">
        {#each view?.entries ?? [] as entry (entry.id)}
            {@const failure = retainedFailure(entry)}
            {@const error = entry.error ?? failure?.validationError ?? failure?.error}
            {@const failedAddress = entry.error?.address ?? failure?.address}
            <li data-diagnostic-log={entry.id}>
                <button type="button" class="pc-diagnostic-log-select" aria-expanded={view?.selectedId === entry.id} disabled={!actions?.select} onclick={() => actions?.select(entry.id)}>
                    <strong>{entry.origin.workflowName || entry.origin.workflowId}</strong>
                    <span><time datetime={isoTime(entry.origin.startedAt)}>{timestamp(entry.origin.startedAt)}</time> · {statusLabel(entry.status)} · {entry.attempts.length} {entry.attempts.length === 1 ? 'attempt' : 'attempts'}</span>
                    {#if failedAddress}<span>Node: {[...failedAddress.instancePath, failedAddress.nodeId].join(' / ')}</span>{:else if error?.nodeId}<span>Node: {error.nodeId}</span>{/if}
                    {#if error}<span class="pc-diagnostic-log-error">{error.code}: {error.message}</span>{/if}
                </button>
            </li>
        {/each}
    </ol>
    {#if selected}
        <div class="pc-diagnostic-selection" data-diagnostic-selection={selected.id}>
            <h4>{selected.origin.workflowName || selected.origin.workflowId}</h4>
            <p>{statusLabel(selected.status)} · {selected.actualCalls} of {selected.callBound} requests</p>
            <p>Started: {timestamp(selected.origin.startedAt)} · Finished: {timestamp(selected.endedAt)}</p>
            {#if selected.truncated}<p class="pc-diagnostic-notice">This log was truncated to fit the retention limits.</p>{/if}
            {#if selected.error}{@render errorDetails(selected.error, 'Run error')}{/if}
            <ol class="pc-diagnostic-attempts">
                {#each selected.attempts as attempt, index (`${index}`)}
                    <li data-diagnostic-attempt={attempt.attempt}>
                        <h5>Attempt {attempt.attempt} · {[...attempt.address.instancePath, attempt.address.nodeId].join(' / ')}</h5>
                        <p>Transport: {attempt.status ? statusLabel(attempt.status) : 'Unknown'}{#if attempt.durationMs !== undefined} · {Math.round(attempt.durationMs)} ms{/if}</p>
                        {#if attempt.startedAt !== undefined}<p>Started: {timestamp(attempt.startedAt)}</p>{/if}
                        {#if attempt.finish !== undefined}<p>Finish: {attempt.finish ?? 'Unknown'}</p>{/if}
                        {#if attempt.binding}
                            <p>Connection: {attempt.binding.connectionId ?? attempt.binding.profileId ?? 'Unknown'}{#if attempt.binding.model} · Model: {attempt.binding.model}{/if}{#if attempt.binding.role} · Role: {attempt.binding.role}{/if}</p>
                        {/if}
                        {#if attempt.usage}<details><summary>Reported usage</summary><dl>{#each Object.entries(attempt.usage) as [key, value]}<div><dt>{key}:</dt><dd>{' '}{value}</dd></div>{/each}</dl></details>{/if}
                        {#if attempt.error}{@render errorDetails(attempt.error, 'Request error')}{/if}
                        {#if attempt.validationError}{@render errorDetails(attempt.validationError, 'Validation')}{/if}
                        {#if attempt.retry}<p>Retry: {attempt.retry.reasonCode} · {attempt.retry.delayMs} ms delay · next attempt {attempt.retry.nextAttempt}</p>{/if}
                        {#if attempt.response}
                            <div class="pc-diagnostic-response">
                                {#if attempt.response.visibility === 'actor-private'}<h6>Private model output · Actor: {attempt.response.actorId ?? 'Unknown'}</h6>{:else if attempt.response.visibility === 'public'}<h6>Model output</h6>{/if}
                                {#if attempt.response.visibility === 'public' || attempt.response.visibility === 'actor-private'}
                                    {#if attempt.response.text !== undefined}<pre data-diagnostic-response>{attempt.response.text || '(Empty response)'}</pre>{/if}
                                    {#if attempt.response.truncated}<p class="pc-diagnostic-notice">Response text was truncated to fit the retention limits.</p>{/if}
                                {/if}
                                {#if attempt.response.omitted}<p>Response omitted: {attempt.response.omitted}</p>{:else if attempt.response.visibility === 'hidden'}<p>Response omitted: hidden output.</p>{/if}
                            </div>
                        {/if}
                    </li>
                {/each}
            </ol>
        </div>
    {/if}
</section>

{#snippet errorDetails(error: DiagnosticError, label: string)}
    {@const findings = diagnosticSchemaFindings(error)}
    <div class="pc-diagnostic-log-error"><p>{label}: {error.code} · {error.message}</p>
        {#if error.truncated}<p class="pc-diagnostic-notice">Error details were truncated.</p>{/if}
        {#if findings.length}<ul class="pc-diagnostic-findings">{#each findings as finding}<li><code>{finding.path || '/'} · {finding.keyword}</code><p>{finding.message}</p></li>{/each}</ul>{/if}
    </div>
{/snippet}

<style>
    .pc-diagnostic-history { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--pc-border); min-width: 0; }
    .pc-diagnostic-toggle { display: flex; flex-direction: row; align-items: center; gap: 7px; font-weight: 500; }
    .pc-diagnostic-toggle input { width: auto; margin: 0; flex: none; accent-color: var(--pc-accent); }
    p { color: var(--pc-muted); font-size: 11px; line-height: 1.5; margin: 6px 0; overflow-wrap: anywhere; }
    h4 { font-size: 12px; margin: 14px 0 8px; }
    .pc-diagnostic-log-list { list-style: none; padding: 0; margin: 0; }
    li { border: 1px solid var(--pc-border); border-radius: 4px; margin-bottom: 6px; overflow: hidden; }
    button { font: inherit; color: var(--pc-text); border: 1px solid var(--pc-border); background: var(--pc-control); border-radius: 3px; padding: 5px 8px; cursor: pointer; }
    button:disabled { cursor: default; opacity: .6; }
    button:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 2px; }
    .pc-diagnostic-log-select { display: grid; gap: 5px; width: 100%; padding: 9px; border: 0; border-radius: 0; text-align: left; overflow-wrap: anywhere; }
    .pc-diagnostic-log-select span { color: var(--pc-muted); font-size: 11px; }
    .pc-diagnostic-log-select[aria-expanded='true'] { box-shadow: inset 2px 0 var(--pc-accent); }
    .pc-diagnostic-log-select .pc-diagnostic-log-error { color: var(--pc-error); }
    .pc-diagnostic-history-actions { display: flex; flex-wrap: wrap; gap: 7px; margin: 8px 0; }
    .pc-diagnostic-storage-issue { color: var(--pc-warn, var(--pc-muted)); }
    .pc-diagnostic-selection { margin-top: 12px; min-width: 0; }
    .pc-diagnostic-attempts { list-style: none; padding: 0; margin: 10px 0 0; }
    .pc-diagnostic-attempts > li { padding: 9px; }
    h5, h6 { margin: 0 0 7px; font-size: 11px; font-weight: 500; overflow-wrap: anywhere; }
    h6 { margin-top: 10px; }
    .pc-diagnostic-response { min-width: 0; }
    pre { padding: 8px; border: 1px solid var(--pc-border); border-radius: 3px; background: var(--pc-field); color: var(--pc-text); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; line-height: 1.5; max-height: 320px; overflow: auto; }
    .pc-diagnostic-log-error p { color: var(--pc-error); }
    .pc-diagnostic-findings { padding-left: 16px; margin: 6px 0; }
    .pc-diagnostic-findings li { border: 0; border-radius: 0; margin: 4px 0; overflow-wrap: anywhere; }
    code { font-size: 10px; white-space: pre-wrap; }
    details { margin: 5px 0; color: var(--pc-muted); font-size: 11px; }
    summary { cursor: pointer; }
    summary:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 2px; }
    dl { margin: 7px 0; } dl div { display: flex; flex-wrap: wrap; gap: 5px; } dt, dd { margin: 0; }
    .pc-diagnostic-notice { color: var(--pc-warn, var(--pc-muted)); }
</style>
