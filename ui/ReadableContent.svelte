<script lang="ts">
    import { renderReadableMarkdown } from '../src/ui/preview-markdown.js';
    import type { ReadableContent, PreviewMessage } from '../src/ui/recorded-preview';
    let { content, onCopyText, onCopyMessage }: {
        content: ReadableContent;
        onCopyText?: (text: string) => void | Promise<void>;
        onCopyMessage?: (message: PreviewMessage) => void | Promise<void>;
    } = $props();
    let rendered = $derived(renderReadableMarkdown(content, window));
    let displayed = $derived(rendered.displayContent);
</script>

<div class="pc-readable-content">
    {#if displayed.kind === 'text'}
        {#if onCopyText}<button type="button" onclick={() => onCopyText?.(content.kind === 'text' ? content.text : '')}>Copy {displayed.truncated ? 'partial text' : 'text'}</button>{/if}
        <div class="pc-readable-prose">{@html rendered.parts[0]?.html ?? ''}</div>
        {#if displayed.truncated}<p class="pc-readable-note">Only part of the retained text is displayed.</p>{/if}
    {:else if displayed.kind === 'messages'}
        {#if !displayed.messages.length}<p class="pc-readable-note">No captured messages</p>{/if}
        {#each displayed.messages.slice(0, rendered.parts.length) as message, index (message.id)}
            <article class="pc-readable-message" data-preview-message>
                <header><strong>{message.speaker ?? message.role}</strong><span>{message.id}</span>{#if message.timestamp}<span>{message.timestamp}</span>{/if}
                {#if onCopyMessage}<button type="button" onclick={() => onCopyMessage?.(message)}>Copy {message.truncated ? 'partial message' : 'message'}</button>{/if}</header>
                <div class="pc-readable-prose">{@html rendered.parts[index].html}</div>
                {#if message.truncated || rendered.parts[index].truncated}<p class="pc-readable-note">Only part of this message is displayed.</p>{/if}
            </article>
        {/each}
        {#if displayed.omittedMessages + rendered.omittedMessages}<p class="pc-readable-note">{displayed.omittedMessages + rendered.omittedMessages} messages omitted from this display.</p>{/if}
        {#if displayed.snapshotOmittedMessages}<p class="pc-readable-note">{displayed.snapshotOmittedMessages} messages omitted from the recording.</p>{/if}
    {:else if displayed.kind === 'json'}
        <pre class="pc-readable-json">{displayed.text}</pre>
        {#if displayed.truncated}<p class="pc-readable-note">Only part of the retained JSON is displayed.</p>{/if}
    {:else if displayed.kind === 'pattern-matches'}
        <p class="pc-readable-note">Recorded Pattern report · {displayed.report.status}</p>
        <p>{displayed.report.totalOccurrences ?? 'Unknown'} occurrences · {displayed.report.matchedRuleCount ?? 'Unknown'} matched rules · Matched: {displayed.report.matched === null ? 'Unknown' : displayed.report.matched ? 'Yes' : 'No'}</p>
        {#if displayed.report.status === 'unresolved'}<p class="pc-readable-note">Detection is unresolved; counts and the routing decision are unknown.</p>{/if}
        {#if displayed.report.status === 'complete' && displayed.report.totalOccurrences === 0}<p class="pc-readable-note">No occurrences detected.</p>{/if}
        <table><thead><tr><th>Rule</th><th>Pattern</th><th>Count</th></tr></thead><tbody>{#each displayed.report.rules as rule}<tr data-preview-pattern-rule><td>{rule.label ?? rule.id}</td><td><code>{rule.pattern}</code></td><td>{rule.count ?? 'Unknown'}</td></tr>{/each}</tbody></table>
        <details><summary>Occurrences · {displayed.report.occurrences.length} displayed</summary>{#each displayed.report.occurrences as occurrence}<div data-preview-occurrence><p>{occurrence.ruleId} · {occurrence.start}–{occurrence.end} · {occurrence.protected ? 'Protected' : 'Unprotected'} · {occurrence.editable ? 'Editable' : 'Not editable'}</p><pre>{occurrence.text}</pre>{#if occurrence.truncated}<p class="pc-readable-note">Only part of this occurrence text is displayed.</p>{/if}</div>{/each}</details>
        {#if displayed.report.omittedRules}<p class="pc-readable-note">{displayed.report.omittedRules} rules omitted from this display.</p>{/if}
        {#if displayed.report.omittedOccurrences}<p class="pc-readable-note">{displayed.report.omittedOccurrences} occurrences omitted from this display.</p>{/if}
        {#if displayed.report.truncated}<p class="pc-readable-note">Only part of the retained report is displayed; aggregate counts describe the recorded report.</p>{/if}
        {#each displayed.report.diagnostics as diagnostic}<p class="pc-readable-note"><code>{diagnostic.code}</code>: {diagnostic.message}</p>{/each}
        {#if displayed.report.omittedDiagnostics}<p class="pc-readable-note">{displayed.report.omittedDiagnostics} diagnostics omitted from this display.</p>{/if}
    {:else if displayed.kind === 'text-filter'}
        <p class="pc-readable-note">Recorded Filter report · {displayed.report.status} · {displayed.report.action} · {displayed.report.unit}</p>
        <p>{displayed.report.status === 'complete' ? 'Selected removals' : 'Proposed removals'} · {displayed.report.retainedUnitCount} retained units</p>
        <p class="pc-readable-note">Body length: {displayed.report.originalBodyLength} → {displayed.report.resultBodyLength} UTF-16 units{displayed.report.status === 'complete' ? '' : ' (proposed result)'}</p>
        {#if displayed.report.status === 'blocked'}<p class="pc-readable-note">Atomic deletion was blocked; no filtered Draft was produced.</p>
        {:else if displayed.report.status === 'empty'}<p class="pc-readable-note">The proposed output is empty or whitespace-only; no filtered Draft was produced.</p>
        {:else if !displayed.report.units.length && !displayed.report.omittedUnits}<p class="pc-readable-note">No units selected; the Draft is unchanged.</p>{/if}
        {#each displayed.report.units as unit}<div data-preview-filter-unit><p class="pc-readable-note">{unit.start}–{unit.end} · {unit.blocked ? 'Blocked' : displayed.report.status === 'complete' ? 'Removed' : 'Proposed removal'}</p><pre>{unit.text}</pre>{#if unit.truncated}<p class="pc-readable-note">Only part of this unit text is displayed.</p>{/if}</div>{/each}
        {#if displayed.report.omittedUnits}<p class="pc-readable-note">{displayed.report.omittedUnits} units omitted from this display.</p>{/if}
        {#if displayed.report.truncated}<p class="pc-readable-note">Only part of the retained report is displayed; retained-unit counts describe the recorded report.</p>{/if}
        {#each displayed.report.diagnostics as diagnostic}<p class="pc-readable-note"><code>{diagnostic.code}</code>: {diagnostic.message}</p>{/each}
        {#if displayed.report.omittedDiagnostics}<p class="pc-readable-note">{displayed.report.omittedDiagnostics} diagnostics omitted from this display.</p>{/if}
    {:else}<p class="pc-readable-note">{displayed.reason}</p>{/if}
    {#if displayed.kind === 'pattern-matches' || displayed.kind === 'text-filter'}<p class="pc-readable-note">Recorded report; it does not establish the current Draft state or authorize edits.</p>{/if}
    {#if rendered.omittedFormatting}<p class="pc-readable-note">Some formatting or embedded resources were omitted for safe display.</p>{/if}
    {#if rendered.truncated}<p class="pc-readable-note">Formatting display limit reached; only part is shown. {displayed.kind === 'pattern-matches' || displayed.kind === 'text-filter' ? 'Use Source to inspect the bounded retained evidence.' : 'Copy uses the underlying retained text.'}</p>{/if}
</div>

<style>
    .pc-readable-content { min-width: 0; font-size: 16px; line-height: 1.55; overflow-wrap: anywhere; }
    .pc-readable-prose { max-width: 80ch; min-width: 0; }
    .pc-readable-prose :global(:is(p, blockquote, ul, ol, pre, table, details)) { margin: 0 0 .8em; }
    .pc-readable-prose :global(:is(h1, h2, h3, h4, h5, h6)) { line-height: 1.25; margin: .8em 0 .4em; }
    .pc-readable-prose :global(blockquote) { margin-left: 0; padding-left: 1em; border-left: 2px solid var(--pc-border, #3a3c35); }
    .pc-readable-prose :global(a) { color: var(--pc-accent, #e18a24); }
    .pc-readable-prose :global(pre), pre { margin: 0; max-width: 100%; overflow-x: auto; white-space: pre; font: 13px/1.55 monospace; }
    .pc-readable-prose :global(code), code { font-family: monospace; }
    .pc-readable-prose :global(table), table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
    .pc-readable-prose :global(:is(th, td)), th, td { padding: .3em .6em; border: 1px solid var(--pc-border, #3a3c35); text-align: left; }
    .pc-readable-json { margin: 0; }
    .pc-readable-message { padding: 12px 0; border-top: 1px solid var(--pc-border, #3a3c35); }
    .pc-readable-message header { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-bottom: 8px; font-size: 12px; }
    .pc-readable-message header span { color: var(--pc-muted, #a1a59b); }
    .pc-readable-note { color: var(--pc-muted, #a1a59b); font-size: 12px; line-height: 1.5; margin: 8px 0 0; }
    button { min-height: 28px; max-width: 100%; padding: 4px 7px; background: transparent; border: 1px solid var(--pc-border, #3a3c35); color: inherit; font: inherit; font-size: 12px; line-height: 1.4; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--pc-accent, #e18a24); outline-offset: 2px; }
</style>
