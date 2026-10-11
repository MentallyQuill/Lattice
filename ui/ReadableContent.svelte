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
        <p>{displayed.report.totalOccurrences ?? 'Unknown'} occurrences · {displayed.report.matchedRuleCount ?? 'Unknown'} matched rules</p>
        <table><thead><tr><th>Rule</th><th>Pattern</th><th>Count</th></tr></thead><tbody>{#each displayed.report.rules as rule}<tr><td>{rule.label ?? rule.id}</td><td><code>{rule.pattern}</code></td><td>{rule.count ?? 'Unknown'}</td></tr>{/each}</tbody></table>
        <details><summary>Occurrences</summary>{#each displayed.report.occurrences as occurrence}<p>{occurrence.ruleId} · {occurrence.start}–{occurrence.end}</p><pre>{occurrence.text}</pre>{/each}</details>
        {#each displayed.report.diagnostics as diagnostic}<p class="pc-readable-note">{diagnostic.message}</p>{/each}
    {:else if displayed.kind === 'text-filter'}
        <p>{displayed.report.status === 'complete' ? 'Selected removals' : 'Proposed removals'} · {displayed.report.retainedUnitCount} retained units</p>
        {#each displayed.report.units as unit}<pre>{unit.text}</pre>{/each}
        {#each displayed.report.diagnostics as diagnostic}<p class="pc-readable-note">{diagnostic.message}</p>{/each}
    {:else}<p class="pc-readable-note">{displayed.reason}</p>{/if}
    {#if rendered.omittedFormatting}<p class="pc-readable-note">Some formatting or embedded resources were omitted for safe display.</p>{/if}
    {#if rendered.truncated}<p class="pc-readable-note">Formatting display limit reached; only part is shown. Copy uses the underlying retained text.</p>{/if}
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
