<script lang="ts">
    import { readControlRows, allocateControlRowId } from '../src/ui/control-input-adapters.js';
    import type { JsonValue } from '../src/workflow/operations/json-data';
    import type { DetailControl } from './detail-types';
    type StructuredDetailControl = DetailControl & { structured?: string };
    type Row = Record<string, unknown>;
    let { control, text, disabled = false, ontext, onDraft, draftValue, idPrefix, error = '' }: { control: StructuredDetailControl; text: string; disabled?: boolean; ontext: (text: string) => void; onDraft?: (value: unknown) => void; draftValue?: unknown; idPrefix: string; error?: string } = $props();
    const phases = ['onset', 'peak', 'plateau', 'decline', 'aftermath'];
    function finiteJson(value: unknown): boolean {
        if (typeof value === 'number') return Number.isFinite(value);
        if (Array.isArray(value)) return value.every(finiteJson);
        return value === null || typeof value !== 'object' || Object.values(value).every(finiteJson);
    }
    let rowName = $derived(control.structured === 'fields' ? 'field' : control.structured === 'sections' ? 'section' : control.structured === 'slots' ? 'slot' : control.structured === 'numeric-map' ? 'value' : control.structured === 'durations' ? 'duration' : ['patterns','extract'].includes(control.structured ?? '') ? 'pattern' : 'rule');
    let rowLimit = $derived(control.inputSpec?.limits.maxItems ?? (control.structured === 'fields' || control.structured === 'patterns' ? 128 : control.structured === 'slots' ? 16 : control.structured === 'numeric-map' ? 32 : control.structured === 'durations' ? 5 : 64));
    let rowMinimum = $derived(control.structured === 'slots' ? ['join.inputs','collect.inputs'].includes(control.inputSpec?.id ?? '') ? 1 : 2 : 0);
    function parseRows(): Row[] | null {
        try {
            const value = draftValue === undefined ? JSON.parse(text) : draftValue;
            const id = ({fields:'select-fields.fields',sections:'compose.sections',slots:'context-join.inputs','numeric-map':'state.updates',durations:'state.durations',rules:'text-rules.rules',patterns:'pattern.rules:literal',extract:'extract.patterns'} as Record<string,string>)[control.structured ?? ''];
            const result = readControlRows(control.inputSpec ?? {id,version:1,editor:'rows',formats:['rows','json'],storage:'json-value',limits:{maxItems:rowLimit}}, value as JsonValue);
            return result.ok ? result.data.rows as Row[] : null;
        } catch { return null; }
    }
    let rows = $derived(parseRows());
    let raw = $state(false);
    let editingRaw = $derived(raw || !rows);
    let rawText = $derived(editingRaw && draftValue !== undefined ? JSON.stringify(draftValue, null, 2) : text);
    function rawInput(value: string) { if (!disabled) { raw = true; ontext(value); } }
    function emit(value: unknown) { if (!disabled) { if (onDraft) onDraft(value); else ontext(JSON.stringify(value, null, 2)); } }
    function emitRows(value: Row[]) { emit(['numeric-map', 'durations'].includes(control.structured ?? '') ? Object.fromEntries(value.map(row => [String(row.name), row.number])) : value); }
    function change(index: number, key: string, value: unknown) {
        if (disabled || !rows) return;
        emitRows(rows.map((row, position) => position === index ? { ...row, [key]: value } : row));
    }
    function add() {
        if (disabled || !rows || rows.length >= rowLimit) return;
        let suffix = 1; while (rows.some(row => row.name === rowName + suffix)) suffix++;
        const id = allocateControlRowId(control.structured === 'slots' ? rowMinimum === 2 ? 'context' : 'slot' : 'pattern', rows.map(row => String(row.id)));
        emitRows([...rows, control.structured === 'fields' ? { name: rowName + suffix, path: [] } : control.structured === 'sections' ? { name: rowName + suffix, text: '' } : control.structured === 'slots' ? { id, label: 'Input ' + id.split('-').at(-1), ...(rowMinimum === 1 ? {required:true} : {}) } : control.structured === 'numeric-map' ? { name: rowName + suffix, number: 0 } : control.structured === 'durations' ? { name: phases.find(phase => !rows.some(row => row.name === phase)), number: 1 } : control.structured === 'patterns' ? {id,pattern:'text'} : control.structured === 'extract' ? {id,literal:'text',label:''} : { kind: 'literal', pattern: 'text', replacement: '' }]);
    }
    function numberField(index: number, input: HTMLInputElement) {
        const value = input.valueAsNumber;
        if (disabled || !rows) return;
        if (!Number.isFinite(value) || (control.structured === 'durations' && (!Number.isSafeInteger(value) || value < 1 || value > 64))) {
            input.value = String(rows[index].number); return;
        }
        change(index, 'number', value);
    }
    function mapName(index: number, input: HTMLInputElement | HTMLSelectElement) {
        if (disabled || !rows) return;
        if (!input.value.trim() || input.value.length > 128 || rows.some((row, position) => position !== index && row.name === input.value)) {
            input.value = String(rows[index].name); return;
        }
        change(index, 'name', input.value);
    }
    function jsonField(index: number, key: string, value: string) {
        if (disabled || !rows) return;
        try { const parsed: unknown = JSON.parse(value); if (!finiteJson(parsed)) throw new Error('Nonfinite JSON'); change(index, key, parsed); }
        catch {
            // An unfinished nested JSON value belongs to the same parent draft as raw editing.
            let suffix = 0, marker = '__structured_json_0__';
            while ((draftValue === undefined ? text : JSON.stringify(draftValue)).includes(marker)) marker = '__structured_json_' + ++suffix + '__';
            const next = rows.map((row, position) => position === index ? { ...row, [key]: marker } : row);
            raw = true;
            ontext(JSON.stringify(next, null, 2).replace(JSON.stringify(marker), () => value));
        }
    }
    function useDefault(index: number, enabled: boolean) {
        if (disabled || !rows) return;
        const next = rows.map((row, position) => {
            if (position !== index) return row;
            const item = { ...row }; if (enabled) item.default = null; else delete item.default; return item;
        }); emitRows(next);
    }
    function remove(index: number) { if (!disabled && rows && rows.length > rowMinimum) emitRows(rows.filter((_, position) => position !== index)); }
    function move(index: number, offset: number) {
        if (disabled || !rows || index + offset < 0 || index + offset >= rows.length) return;
        const next = [...rows]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; emitRows(next);
    }
</script>

<div class="pc-structured-control" data-structured-control={control.structured}>
    <div class="pc-structured-mode"><button type="button" aria-label={'Edit ' + control.label + (editingRaw ? ' as rows' : ' as JSON')} disabled={disabled || (editingRaw && !rows)} onclick={() => { if (!disabled && rows) raw = !editingRaw; }}>{editingRaw ? 'Use rows' : 'Advanced JSON'}</button></div>
    {#if editingRaw}
        <label for={idPrefix + '-raw'}>{control.label} (JSON)</label><textarea class="pc-structured-raw" id={idPrefix + '-raw'} aria-label={control.label} aria-invalid={!!error} aria-describedby={error ? idPrefix + '-error' : undefined} value={rawText} {disabled} oninput={event => rawInput(event.currentTarget.value)} spellcheck="false"></textarea>
        {#if !rows}<small>This shape needs Advanced JSON. Authored values are retained; rows are available for supported shapes.</small>{/if}
    {:else if rows}
        <div class="pc-structured-rows">
            {#each rows as row, index}
                <fieldset class="pc-structured-row"><legend>{rowName[0].toUpperCase() + rowName.slice(1)} {index + 1}</legend>
                    {#if control.structured === 'durations'}
                        <label for={idPrefix + '-phase-' + index}>Phase</label><select id={idPrefix + '-phase-' + index} aria-label={'Duration ' + (index + 1) + ' phase'} value={String(row.name)} {disabled} onchange={event => mapName(index, event.currentTarget)}>{#each phases as phase}<option value={phase} disabled={rows.some((other, position) => position !== index && other.name === phase)}>{phase[0].toUpperCase() + phase.slice(1)}</option>{/each}</select>
                        <label for={idPrefix + '-steps-' + index}>Steps</label><input type="number" id={idPrefix + '-steps-' + index} aria-label={'Duration ' + (index + 1) + ' steps'} value={Number(row.number)} min="1" max="64" step="1" {disabled} onchange={event => numberField(index, event.currentTarget)} />
                    {:else if control.structured === 'numeric-map'}
                        <label for={idPrefix + '-name-' + index}>Name</label><input id={idPrefix + '-name-' + index} aria-label={'Value ' + (index + 1) + ' name'} value={String(row.name)} maxlength="128" {disabled} onchange={event => mapName(index, event.currentTarget)} />
                        <label for={idPrefix + '-number-' + index}>Value</label><input type="number" id={idPrefix + '-number-' + index} aria-label={'Value ' + (index + 1) + ' number'} value={Number(row.number)} min={control.min} max={control.max} step="any" {disabled} onchange={event => numberField(index, event.currentTarget)} />
                    {:else if control.structured === 'fields'}
                        <label for={idPrefix + '-name-' + index}>Name</label><input id={idPrefix + '-name-' + index} aria-label={'Field ' + (index + 1) + ' name'} value={String(row.name)} {disabled} oninput={event => change(index, 'name', event.currentTarget.value)} />
                        <label for={idPrefix + '-path-' + index}>Path (JSON array)</label><input id={idPrefix + '-path-' + index} aria-label={'Field ' + (index + 1) + ' path (JSON array)'} value={JSON.stringify(row.path)} {disabled} onchange={event => jsonField(index, 'path', event.currentTarget.value)} />
                        <label class="pc-structured-check"><input type="checkbox" aria-label={'Field ' + (index + 1) + ' required'} checked={row.required !== false} {disabled} onchange={event => change(index, 'required', event.currentTarget.checked)} /> Required</label>
                        <label class="pc-structured-check"><input type="checkbox" aria-label={'Field ' + (index + 1) + ' use default'} checked={Object.hasOwn(row, 'default')} {disabled} onchange={event => useDefault(index, event.currentTarget.checked)} /> Use default when missing</label><small>Defaults apply when Required is off.</small>
                        {#if Object.hasOwn(row, 'default')}<label for={idPrefix + '-default-' + index}>Default (JSON)</label><textarea id={idPrefix + '-default-' + index} aria-label={'Field ' + (index + 1) + ' default (JSON)'} value={JSON.stringify(row.default, null, 2)} {disabled} onchange={event => jsonField(index, 'default', event.currentTarget.value)}></textarea>{/if}
                    {:else if control.structured === 'patterns' || control.structured === 'extract'}
                        <label for={idPrefix + '-pattern-id-' + index}>ID</label><input id={idPrefix + '-pattern-id-' + index} aria-label={'Pattern ' + (index + 1) + ' ID'} value={String(row.id)} {disabled} oninput={event => change(index, 'id', event.currentTarget.value)} />
                        <label for={idPrefix + '-phrase-' + index}>{control.structured === 'extract' ? 'Phrase' : 'Expression'}</label><input id={idPrefix + '-phrase-' + index} aria-label={'Pattern ' + (index + 1) + (control.structured === 'extract' ? ' phrase' : ' expression')} value={String(row[control.structured === 'extract' ? 'literal' : 'pattern'])} {disabled} oninput={event => change(index, control.structured === 'extract' ? 'literal' : 'pattern', event.currentTarget.value)} />
                        <label for={idPrefix + '-label-' + index}>Label (optional)</label><input id={idPrefix + '-label-' + index} aria-label={'Pattern ' + (index + 1) + ' label'} value={String(row.label ?? '')} {disabled} oninput={event => change(index, 'label', event.currentTarget.value)} />
                    {:else if control.structured === 'slots'}
                        <label for={idPrefix + '-slot-id-' + index}>ID</label><input id={idPrefix + '-slot-id-' + index} aria-label={'Slot ' + (index + 1) + ' ID'} value={String(row.id)} maxlength="128" {disabled} oninput={event => change(index, 'id', event.currentTarget.value)} />
                        <label for={idPrefix + '-slot-label-' + index}>Label</label><input id={idPrefix + '-slot-label-' + index} aria-label={'Slot ' + (index + 1) + ' label'} value={String(row.label)} maxlength="80" {disabled} oninput={event => change(index, 'label', event.currentTarget.value)} />
                        {#if rowMinimum === 1}<label class="pc-structured-check"><input type="checkbox" aria-label={'Slot ' + (index + 1) + ' required'} checked={row.required === true} {disabled} onchange={event => change(index, 'required', event.currentTarget.checked)} /> Required</label>{/if}
                    {:else if control.structured === 'sections'}
                        <label for={idPrefix + '-name-' + index}>Name</label><input id={idPrefix + '-name-' + index} aria-label={'Section ' + (index + 1) + ' name'} value={String(row.name)} {disabled} oninput={event => change(index, 'name', event.currentTarget.value)} />
                        <label for={idPrefix + '-text-' + index}>Text</label><textarea id={idPrefix + '-text-' + index} aria-label={'Section ' + (index + 1) + ' text'} value={String(row.text)} {disabled} oninput={event => change(index, 'text', event.currentTarget.value)}></textarea>
                        <label for={idPrefix + '-section-kind-' + index}>Kind</label><select id={idPrefix + '-section-kind-' + index} aria-label={'Section ' + (index + 1) + ' kind'} value={String(row.kind ?? 'text')} {disabled} onchange={event => change(index, 'kind', event.currentTarget.value)}><option value="text">Text</option><option value="guidance">Guidance</option></select>
                        <label class="pc-structured-check"><input type="checkbox" aria-label={'Section ' + (index + 1) + ' required'} checked={row.required === true} {disabled} onchange={event => change(index, 'required', event.currentTarget.checked)} /> Required input</label>
                        <label for={idPrefix + '-section-skip-' + index}>Skipped source</label><select id={idPrefix + '-section-skip-' + index} aria-label={'Section ' + (index + 1) + ' skipped source'} value={String(row.onSkipped ?? 'fallback')} {disabled} onchange={event => change(index, 'onSkipped', event.currentTarget.value)}><option value="fallback">Use fallback text</option><option value="omit">Omit section</option></select>
                    {:else}
                    <label for={idPrefix + '-kind-' + index}>Kind</label><select id={idPrefix + '-kind-' + index} aria-label={'Rule ' + (index + 1) + ' kind'} value={String(row.kind)} {disabled} onchange={event => change(index, 'kind', event.currentTarget.value)}><option value="literal">Literal</option><option value="regex">Regular expression</option></select>
                    <label for={idPrefix + '-pattern-' + index}>Pattern</label><input id={idPrefix + '-pattern-' + index} aria-label={'Rule ' + (index + 1) + ' pattern'} value={String(row.pattern)} {disabled} oninput={event => change(index, 'pattern', event.currentTarget.value)} />
                    <label for={idPrefix + '-replacement-' + index}>Replacement</label><textarea id={idPrefix + '-replacement-' + index} aria-label={'Rule ' + (index + 1) + ' replacement'} value={String(row.replacement ?? '')} {disabled} oninput={event => change(index, 'replacement', event.currentTarget.value)}></textarea>
                    <label for={idPrefix + '-flags-' + index}>Flags</label><input id={idPrefix + '-flags-' + index} aria-label={'Rule ' + (index + 1) + ' flags'} value={String(row.flags ?? '')} {disabled} oninput={event => change(index, 'flags', event.currentTarget.value)} />
                    {/if}
                    <div class="pc-structured-actions">{#if !['numeric-map', 'durations'].includes(control.structured ?? '')}<button type="button" aria-label={'Move ' + rowName + ' ' + (index + 1) + ' up'} disabled={disabled || index === 0} onclick={() => move(index, -1)}>Move up</button><button type="button" aria-label={'Move ' + rowName + ' ' + (index + 1) + ' down'} disabled={disabled || index === rows.length - 1} onclick={() => move(index, 1)}>Move down</button>{/if}<button type="button" aria-label={'Remove ' + rowName + ' ' + (index + 1)} disabled={disabled || rows.length <= rowMinimum} onclick={() => remove(index)}>Remove</button></div>
                </fieldset>
            {/each}
        </div>
        <button type="button" aria-label={"Add " + rowName} disabled={disabled || rows.length >= rowLimit} onclick={add}>Add {rowName}</button>
    {/if}
</div>

<style>
    .pc-structured-control, .pc-structured-rows { min-width: 0; color: var(--pc-text); font: inherit; }
    .pc-structured-row { min-width: 0; margin: 8px 0; padding: 8px 0; border: 0; border-top: 1px solid var(--pc-border); }
    legend { padding: 0 4px 0 0; color: var(--pc-muted); font-size: 12px; }
    label { display: block; margin: 7px 0 3px; font-size: 12px; }
    input:not([type='checkbox']), select, textarea { box-sizing: border-box; display: block; width: 100%; min-width: 0; min-height: 28px; padding: 5px 6px; border: 1px solid var(--pc-border); border-radius: 2px; background: var(--pc-field); color: var(--pc-text); font: inherit; font-size: 12px; }
    .pc-structured-check { display: flex; align-items: center; gap: 5px; }
    input[type="checkbox"] { accent-color: var(--pc-accent); }
    textarea { min-height: 55px; resize: vertical; line-height: 1.5; }
    .pc-structured-row textarea { min-height: 100px; }
    button { min-height: 28px; padding: 4px 6px; border: 1px solid var(--pc-border); border-radius: 2px; background: var(--pc-control); color: var(--pc-text); font: inherit; font-size: 12px; cursor: pointer; }
    button:hover:not(:disabled) { background: var(--pc-panel); }
    .pc-structured-mode { display: flex; justify-content: flex-end; margin: 4px 0; }
    .pc-structured-raw { min-height: 110px; font-family: var(--pc-mono, monospace); }
    small { display: block; margin-top: 5px; color: var(--pc-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
    .pc-structured-actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
    :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    :disabled { opacity: .55; cursor: default; }
</style>
