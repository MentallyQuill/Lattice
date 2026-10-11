<script lang="ts">
    import { updateJsonValueAtPath } from '../src/ui/json-value-authoring.js';
    import { cloneJsonValue, stringifyJsonValue } from '../src/workflow/operations/json-data.js';
    import type { JsonValue, JsonPath } from '../src/workflow/operations/json-data';
    type ValueType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
    let { value, onchange, oninvalid, label = 'Value', idPrefix, disabled = false, error = '' }: { value: JsonValue; onchange: (value: JsonValue) => void; oninvalid?: (text: string, path: JsonPath) => void; label?: string; idPrefix: string; disabled?: boolean; error?: string } = $props();
    let path = $state<JsonPath>([]), raw = $state(false), rawText = $state(''), feedback = $state('');
    let drafts = $state<Record<string, string>>({});
    let textDrafts = $state<Record<string, string>>({});
    let newKey = $state(''), page = $state(0);
    const pageSize = 64;
    const checked = $derived(cloneJsonValue(value));
    const token = $derived(path.map(key => typeof key + ':' + String(key).length + ':' + key).join('|'));
    function atPath(root: JsonValue, keys: JsonPath): JsonValue {
        let node = root;
        for (const key of keys) {
            if (!node || typeof node !== 'object') return null;
            const property = Object.getOwnPropertyDescriptor(node, key);
            if (!property || !Object.hasOwn(property, 'value')) return null;
            node = property.value;
        }
        return node;
    }
    const current = $derived(checked.ok ? atPath(checked.data.value, path) : null);
    const kind = $derived(current === null ? 'null' : Array.isArray(current) ? 'array' : typeof current as ValueType);
    const editingRaw = $derived(raw || !checked.ok);
    const keys = $derived(current !== null && typeof current === 'object' ? Array.isArray(current) ? current.map((_, index) => index) : Object.keys(current) : []);
    const visibleKeys = $derived(keys.slice(page * pageSize, (page + 1) * pageSize));
    const unfinished = $derived(Object.hasOwn(drafts, token));
    function navigate(next: JsonPath) { if (disabled || unfinished) return; path = next; page = 0; newKey = ''; feedback = ''; }
    function childEdit(key: string | number, edit: { action: 'set'; value: JsonValue } | { action: 'remove' }) {
        if (disabled || unfinished) return;
        const result = updateJsonValueAtPath(value, [...path, key], edit);
        if (!result.ok) { feedback = result.error.message; return; }
        feedback = ''; onchange(result.data.value);
        if (page * pageSize >= keys.length - (edit.action === 'remove' ? 1 : 0)) page = Math.max(0, page - 1);
    }
    function addProperty() {
        if (disabled || unfinished || current === null || typeof current !== 'object' || Array.isArray(current)) return;
        if (Object.hasOwn(current, newKey)) { feedback = 'That exact key already exists.'; return; }
        childEdit(newKey, { action: 'set', value: null }); newKey = '';
    }
    function move(index: number, offset: number) {
        if (disabled || unfinished || !Array.isArray(current) || index + offset < 0 || index + offset >= current.length) return;
        const next = [...current]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; replace(next);
    }
    const stringText = $derived(Object.hasOwn(textDrafts, token) ? textDrafts[token] : String(current));
    const numberText = $derived(Object.hasOwn(drafts, token) ? drafts[token] : String(current));
    function invalid(text: string, message: string) { drafts[token] = text; feedback = message; oninvalid?.(text, [...path]); }
    function replace(next: JsonValue) {
        if (disabled) return;
        const result = updateJsonValueAtPath(value, path, { action: 'set', value: next });
        if (!result.ok) {
            if (typeof next === 'string') textDrafts[token] = next;
            invalid(JSON.stringify(next), result.error.message); return;
        }
        delete drafts[token]; delete textDrafts[token]; feedback = ''; onchange(result.data.value);
    }
    function changeType(next: ValueType) {
        if (disabled) return;
        const values: Record<ValueType, JsonValue> = { string: '', number: 0, boolean: false, null: null, object: {}, array: [] };
        if (Object.hasOwn(values, next)) replace(values[next]);
    }
    function numberInput(text: string) {
        if (disabled) return;
        if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text))) { invalid(text, 'Finish a finite number.'); return; }
        replace(Number(text));
    }
    function rawInput(text: string) {
        if (disabled) return; rawText = text;
        try {
            const parsed = cloneJsonValue(JSON.parse(text));
            if (!parsed.ok) throw new Error(parsed.error.message);
            const result = updateJsonValueAtPath(value, path, { action: 'set', value: parsed.data.value });
            if (!result.ok) throw new Error(result.error.message);
            delete drafts[token]; delete textDrafts[token]; feedback = ''; onchange(result.data.value);
        } catch (failure) { invalid(text, failure instanceof Error ? failure.message : 'Finish the JSON value.'); }
    }
    function mode() {
        if (disabled) return;
        if (editingRaw && checked.ok) raw = false;
        else { const encoded = stringifyJsonValue(current); rawText = Object.hasOwn(drafts, token) ? drafts[token] : encoded.ok ? encoded.data.text : ''; raw = true; }
    }
</script>
<div class="json-value" data-json-value>
    <button type="button" aria-label={'Edit ' + label + (editingRaw ? ' as typed value' : ' as JSON')} {disabled} onclick={mode}>{editingRaw ? 'Use typed value' : 'Advanced JSON'}</button>
    {#if editingRaw}
        <label for={idPrefix + '-json'}>{label} (JSON)</label><textarea id={idPrefix + '-json'} aria-label={label + ' JSON'} aria-invalid={!!feedback || !!error} value={rawText} {disabled} oninput={event => rawInput(event.currentTarget.value)}></textarea>
    {:else}
        {#if path.length}<div class="location"><span>{path.map(key => (typeof key === 'number' ? 'Index ' : 'Key ') + key).join(' / ')}</span><button type="button" aria-label={'Back ' + label} disabled={disabled || unfinished} onclick={() => navigate(path.slice(0, -1))}>Back</button></div>{/if}
        <label for={idPrefix + '-type'}>{label} type</label><select id={idPrefix + '-type'} aria-label={label + ' type'} value={kind} {disabled} onchange={event => changeType(event.currentTarget.value as ValueType)}><option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="null">Null</option><option value="object">Object</option><option value="array">Array</option></select>
        {#if kind === 'string'}<label for={idPrefix + '-string'}>Text</label><textarea id={idPrefix + '-string'} aria-label={label + ' string'} value={stringText} {disabled} aria-invalid={unfinished} oninput={event => replace(event.currentTarget.value)}></textarea>
        {:else if kind === 'number'}<label for={idPrefix + '-number'}>Number</label><input id={idPrefix + '-number'} aria-label={label + ' number'} inputmode="decimal" aria-invalid={Object.hasOwn(drafts, token)} value={numberText} {disabled} oninput={event => numberInput(event.currentTarget.value)} />
        {:else if kind === 'boolean'}<label class="check"><input type="checkbox" aria-label={label + ' boolean'} checked={current === true} {disabled} onchange={event => replace(event.currentTarget.checked)} /> True</label>
        {:else if kind === 'null'}<small>Null is an explicit value.</small>
        {:else if kind === 'object' || kind === 'array'}
            <small>{keys.length} {kind === 'object' ? 'properties' : 'items'}. Select one to edit its value.</small>
            {#each visibleKeys as key (key)}
                <div class="child"><button type="button" aria-label={'Edit ' + label + ' ' + (kind === 'array' ? 'index ' : 'key ') + key} disabled={disabled || unfinished} onclick={() => navigate([...path, key])}>{kind === 'array' ? 'Index ' + key : 'Key: ' + key}</button>
                    <div class="actions">{#if kind === 'array'}<button type="button" aria-label={'Move ' + label + ' index ' + key + ' up'} disabled={disabled || unfinished || key === 0} onclick={() => move(Number(key), -1)}>Up</button><button type="button" aria-label={'Move ' + label + ' index ' + key + ' down'} disabled={disabled || unfinished || key === keys.length - 1} onclick={() => move(Number(key), 1)}>Down</button>{/if}<button type="button" aria-label={'Remove ' + label + ' ' + (kind === 'array' ? 'index ' : 'key ') + key} disabled={disabled || unfinished} onclick={() => childEdit(key, { action: 'remove' })}>Remove</button></div>
                </div>
            {/each}
            {#if keys.length > pageSize}<div class="actions"><button type="button" aria-label={'Previous ' + label + ' children'} disabled={disabled || page === 0} onclick={() => { if (!disabled) page--; }}>Previous</button><small>Page {page + 1} of {Math.ceil(keys.length / pageSize)}</small><button type="button" aria-label={'Next ' + label + ' children'} disabled={disabled || (page + 1) * pageSize >= keys.length} onclick={() => { if (!disabled) page++; }}>Next</button></div>{/if}
            {#if kind === 'object'}<label for={idPrefix + '-new-key'}>Exact property key</label><input id={idPrefix + '-new-key'} aria-label={label + ' new key'} value={newKey} disabled={disabled || unfinished} oninput={event => { if (!disabled) newKey = event.currentTarget.value; }} /><button type="button" aria-label={'Add ' + label + ' property'} disabled={disabled || unfinished} onclick={addProperty}>Add property</button>
            {:else}<button type="button" aria-label={'Add ' + label + ' item'} disabled={disabled || unfinished} onclick={() => childEdit(keys.length, { action: 'set', value: null })}>Add item</button>{/if}
        {/if}
    {/if}
    {#if feedback || error}<small role="status">{feedback || error}</small>{/if}
</div>
<style>
    .json-value { min-width: 0; } label, small { display: block; margin: 5px 0; font-size: 12px; } small { color: var(--pc-muted); } input:not([type='checkbox']), select, textarea { box-sizing: border-box; width: 100%; min-width: 0; padding: 5px; margin: 3px 0; background: var(--pc-field); color: var(--pc-text); border: 1px solid var(--pc-border); font: inherit; } textarea { min-height: 70px; resize: vertical; } button { padding: 4px 6px; background: var(--pc-control); color: var(--pc-text); border: 1px solid var(--pc-border); font: inherit; } .child { padding: 5px 0; border-top: 1px solid var(--pc-border); overflow-wrap: anywhere; } .child > button { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; } .actions, .location { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; } .location span { font-size: 12px; overflow-wrap: anywhere; } .check { display: flex; align-items: center; gap: 5px; } :disabled { opacity: .55; } :is(input,select,textarea,button):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
</style>
