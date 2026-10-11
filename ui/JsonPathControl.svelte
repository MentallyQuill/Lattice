<script lang="ts">
    import { validateJsonPath } from '../src/ui/json-value-authoring.js';
    import type { JsonPath } from '../src/workflow/operations/json-data';
    type Segment = { id: number; kind: 'key' | 'index'; text: string };
    let { value, onchange, oninvalid, label = 'Path', idPrefix, disabled = false, allowIndices = false, maxItems = 64, error = '' }: { value: JsonPath; onchange: (value: JsonPath) => void; oninvalid?: (text: string) => void; label?: string; idPrefix: string; disabled?: boolean; allowIndices?: boolean; maxItems?: number; error?: string } = $props();
    let sequence = 0;
    let rows = $state<Segment[]>([]);
    let committed = $state<JsonPath | undefined>();
    let raw = $state(false), rawText = $state(''), feedback = $state('');
    const allowed = $derived(validateJsonPath(value, { allowIndices, maxItems }));
    const editingRaw = $derived(raw || !allowed.ok);
    const validIndex = (text: string) => /^(0|[1-9]\d*)$/.test(text) && Number.isSafeInteger(Number(text));
    function same(a: JsonPath, b: JsonPath | undefined) { return !!b && a.length === b.length && a.every((key, index) => key === b[index]); }
    $effect(() => {
        if (!allowed.ok) { committed = undefined; rows = []; rawText = JSON.stringify(value, null, 2) ?? ''; return; }
        if (!same(value, committed)) {
            committed = [...value]; rows = value.map(key => ({ id: sequence++, kind: typeof key === 'number' ? 'index' : 'key', text: String(key) }));
            if (editingRaw) rawText = JSON.stringify(value, null, 2);
        }
    });
    function source() {
        // A lone unfinished index must stay an empty slot, never become a valid empty path.
        const emptySlot = rows.length === 1 && rows[0].kind === 'index' && rows[0].text.trim() === '';
        return '[' + rows.map(row => row.kind === 'key' ? JSON.stringify(row.text) : row.text).join(',') + (emptySlot ? ',' : '') + ']';
    }
    function publish() {
        if (disabled) return;
        if (rows.some(row => row.kind === 'index' && (!allowIndices || !validIndex(row.text)))) { feedback = 'Finish each nonnegative integer index.'; oninvalid?.(source()); return; }
        const next = rows.map(row => row.kind === 'key' ? row.text : Number(row.text));
        const checked = validateJsonPath(next, { allowIndices, maxItems });
        if (!checked.ok) { feedback = checked.error.message; oninvalid?.(source()); return; }
        feedback = ''; committed = next; onchange(next);
    }
    function change(index: number, key: 'kind' | 'text', next: string) {
        if (disabled) return;
        rows = rows.map((row, position) => position === index ? { ...row, [key]: next, ...(key === 'kind' ? { text: next === 'index' ? '0' : row.text } : {}) } as Segment : row); publish();
    }
    function move(index: number, offset: number) {
        if (disabled || index + offset < 0 || index + offset >= rows.length) return;
        const next = [...rows]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; rows = next; publish();
    }
    function add(kind: 'key' | 'index') { if (disabled || rows.length >= maxItems || kind === 'index' && !allowIndices) return; rows = [...rows, { id: sequence++, kind, text: kind === 'index' ? '0' : '' }]; publish(); }
    function rawInput(text: string) {
        if (disabled) return; rawText = text;
        try {
            const checked = validateJsonPath(JSON.parse(text), { allowIndices, maxItems });
            if (!checked.ok) throw new Error(checked.error.message);
            feedback = ''; committed = undefined; onchange(checked.data.value);
        } catch (failure) { feedback = failure instanceof Error ? failure.message : 'Finish the path JSON.'; oninvalid?.(text); }
    }
    function mode() { if (disabled) return; if (editingRaw) { if (!feedback && allowed.ok) raw = false; } else { rawText = source(); raw = true; } }
</script>
<div class="json-path" data-json-path>
    <button type="button" aria-label={'Edit ' + label + (editingRaw ? ' as segments' : ' as JSON')} {disabled} onclick={mode}>{editingRaw ? 'Use segments' : 'Advanced JSON'}</button>
    {#if editingRaw}
        <label for={idPrefix + '-json'}>{label} (JSON)</label><textarea id={idPrefix + '-json'} aria-label={label + ' JSON'} aria-invalid={!!feedback || !!error} value={rawText} {disabled} oninput={event => rawInput(event.currentTarget.value)}></textarea>
        {#if !allowed.ok}<small>This path needs Advanced JSON for the consuming schema.</small>{/if}
    {:else}
        <small>Each key is exact. Dots and commas remain part of its name.</small>
        {#each rows as row, index (row.id)}
            <div class="segment">
                {#if allowIndices}<select aria-label={label + ' segment ' + (index + 1) + ' kind'} value={row.kind} {disabled} onchange={event => change(index, 'kind', event.currentTarget.value)}><option value="key">Key</option><option value="index">Index</option></select>{:else}<span>Key</span>{/if}
                <input id={idPrefix + '-segment-' + row.id} aria-label={label + ' segment ' + (index + 1) + ' ' + row.kind} inputmode={row.kind === 'index' ? 'numeric' : 'text'} value={row.text} aria-invalid={row.kind === 'index' && !validIndex(row.text)} {disabled} oninput={event => change(index, 'text', event.currentTarget.value)} />
                <div class="actions"><button type="button" aria-label={'Move ' + label + ' segment ' + (index + 1) + ' up'} disabled={disabled || index === 0} onclick={() => move(index, -1)}>Up</button><button type="button" aria-label={'Move ' + label + ' segment ' + (index + 1) + ' down'} disabled={disabled || index === rows.length - 1} onclick={() => move(index, 1)}>Down</button><button type="button" aria-label={'Remove ' + label + ' segment ' + (index + 1)} {disabled} onclick={() => { if (!disabled) { rows = rows.filter((_, position) => position !== index); publish(); } }}>Remove</button></div>
            </div>
        {/each}
        <div class="actions"><button type="button" aria-label={'Add ' + label + ' key'} disabled={disabled || rows.length >= maxItems} onclick={() => add('key')}>Add key</button>{#if allowIndices}<button type="button" aria-label={'Add ' + label + ' index'} disabled={disabled || rows.length >= maxItems} onclick={() => add('index')}>Add index</button>{/if}</div>
    {/if}
    {#if feedback || error}<small role="status">{feedback || error}</small>{/if}
</div>
<style>
    .json-path { min-width: 0; } .segment { border-top: 1px solid var(--pc-border); padding: 5px 0; } input, select, textarea { box-sizing: border-box; width: 100%; min-width: 0; padding: 5px; margin: 3px 0; border: 1px solid var(--pc-border); background: var(--pc-field); color: var(--pc-text); font: inherit; } button { padding: 4px 6px; background: var(--pc-control); color: var(--pc-text); border: 1px solid var(--pc-border); font: inherit; } .actions { display: flex; flex-wrap: wrap; gap: 4px; } small, label, span { display: block; font-size: 12px; margin: 3px 0; } small { color: var(--pc-muted); } textarea { min-height: 70px; resize: vertical; } :disabled { opacity: .55; } :is(input,select,textarea,button):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
</style>
