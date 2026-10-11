<script lang="ts">
    import { untrack } from 'svelte';
    import type { ControlInputSpec } from '../src/ui/control-input-contracts';
    import type { JsonValue } from '../src/workflow/operations/json-data';
    import type { ControlImportDraft } from '../src/ui/control-table-import';
    import { controlTableImportFields, parseControlTableImport } from '../src/ui/control-table-import.js';
    import { parseDelimitedInput } from '../src/ui/delimited-input.js';
    import { cloneJsonValue } from '../src/workflow/operations/json-data.js';
    let { spec, value, draft, onDraft, onConfirm, onCancel, disabled = false, admissionDisabled = false }: {
        disabled?:boolean; admissionDisabled?:boolean;
        spec: ControlInputSpec;
        value: JsonValue;
        draft?: ControlImportDraft;
        onDraft?: (draft: ControlImportDraft) => void;
        /** Feed the reviewed candidate to the ordinary parent draft/save path. */
        onConfirm: (value: JsonValue) => void;
        onCancel?: () => void;
    } = $props();
    function initial(source: ControlImportDraft | undefined): ControlImportDraft {
        if (source) {
            const checked = cloneJsonValue(source);
            if (checked.ok) {
                const candidate = checked.data.value as unknown as ControlImportDraft;
                if (typeof candidate?.text === 'string' && [',', '\t'].includes(candidate.delimiter) && ['add', 'replace'].includes(candidate.action) && candidate.columns && typeof candidate.columns === 'object' && !Array.isArray(candidate.columns) && Object.values(candidate.columns).every(header => typeof header === 'string')) return candidate;
            }
        }
        return { text: '', delimiter: ',', action: 'replace', columns: {} };
    }
    // Parent retains onDraft by spec.id + version; restored text never implies confirmation.
    let importDraft = $state<ControlImportDraft>(untrack(() => initial(draft)));
    let attempted = $state(untrack(() => importDraft.text.length > 0));
    let reviewed = $state(false);
    let boundaryError = $state('');
    let reviewedValue = $state('');
    let reviewedSpec = $state('');
    const blocked = $derived(disabled || admissionDisabled);
    const fields = $derived(controlTableImportFields(spec));
    const parsed = $derived(parseDelimitedInput(importDraft.text, importDraft.delimiter));
    const headers = $derived(parsed.ok ? [...new Set(parsed.data.rows[0].filter(Boolean))] : []);
    const result = $derived(attempted ? parseControlTableImport(spec, importDraft.text, { delimiter: importDraft.delimiter, columns: importDraft.columns, action: importDraft.action, currentValue: value }) : undefined);
    const canConfirm = $derived(reviewed && result?.ok && reviewedValue === JSON.stringify(value) && reviewedSpec === JSON.stringify(spec));
    function change(next: ControlImportDraft) {
        if(blocked)return false;
        reviewed = false;
        const checked = cloneJsonValue({open:true,draft:next});
        if (!checked.ok) { boundaryError = 'Table draft exceeds the bounded JSON budget. Shorten the pasted text.'; return false; }
        importDraft = (checked.data.value as unknown as {draft:ControlImportDraft}).draft;
        boundaryError = '';
        onDraft?.({ ...importDraft, columns: { ...importDraft.columns } });
        return true;
    }
    function mapColumn(field: string, header: string) {
        const columns = { ...importDraft.columns };
        if (header) columns[field] = header; else delete columns[field];
        change({ ...importDraft, columns });
    }
    function review() {
        if(blocked)return;
        attempted = true;
        reviewedValue = JSON.stringify(value);
        reviewedSpec = JSON.stringify(spec);
        reviewed = true;
    }
    function confirm() {
        if (blocked || !canConfirm || !result?.ok) return;
        reviewed = false;
        onConfirm(result.data.value);
    }
    function display(cell: JsonValue) { return typeof cell === 'string' ? cell : JSON.stringify(cell); }
</script>

<section class="control-import" aria-label="Table import">
    <p>Paste a table with a header row. Map each supported field to a column, then review before confirming.</p>
    <div class="import-options">
        <label>Delimiter <select disabled={blocked} aria-label="Table delimiter" value={importDraft.delimiter} onchange={event => change({ ...importDraft, delimiter: event.currentTarget.value as ',' | '\t' })}>
            <option value=",">CSV (commas)</option><option value={'\t'}>TSV (tabs)</option>
        </select></label>
        <label>Action <select disabled={blocked} aria-label="Import action" value={importDraft.action} onchange={event => change({ ...importDraft, action: event.currentTarget.value as 'add' | 'replace' })}>
            <option value="add">Add rows</option><option value="replace">Replace rows</option>
        </select></label>
    </div>
    <label>Table data <textarea disabled={blocked} aria-label="Table data" value={importDraft.text} rows="6" spellcheck="false" oninput={event => { if (!change({ ...importDraft, text: event.currentTarget.value })) event.currentTarget.value = importDraft.text; }}></textarea></label>
    <p class="import-help">Paths use JSON arrays of exact keys or indices. Required uses true or false; defaults use JSON values. Blank optional typed cells stay absent.</p>
    <div class="import-columns">
        {#each fields as field}
            <label>{field} column <select disabled={blocked} aria-label={'Map ' + field + ' column'} value={importDraft.columns[field] ?? ''} onchange={event => mapColumn(field, event.currentTarget.value)}>
                <option value="">Omit column</option>
                {#each headers as header}<option value={header}>{header}</option>{/each}
            </select></label>
        {/each}
    </div>
    {#if boundaryError}<p role="alert">{boundaryError}</p>{/if}
    {#if result && !result.ok}
        <p role="alert">{#if result.error.row !== undefined}Row {result.error.row}, cell {result.error.cell}: {/if}{result.error.message}</p>
    {:else if result?.ok}
        <p role="status">{result.data.rows.length} imported {result.data.rows.length === 1 ? 'row' : 'rows'}. {importDraft.action === 'add' ? 'Add to' : 'Replace'} existing rows on confirmation.</p>
        {#each result.data.warnings as warning}<p role="status">{warning}</p>{/each}
        <div class="import-review">
            <table aria-label="Imported rows"><thead><tr><th scope="col">Row</th>{#each fields as field}<th scope="col">{field}</th>{/each}</tr></thead>
                <tbody>{#each result.data.rows as row, index}<tr><th scope="row">{index + 1}</th>{#each fields as field}<td>{Object.hasOwn(row as object, field) ? display((row as Record<string, JsonValue>)[field]) : 'Absent'}</td>{/each}</tr>{/each}</tbody>
            </table>
        </div>
    {/if}
    <div class="import-actions">
        <button type="button" onclick={review} disabled={blocked || !fields.length || !!boundaryError}>Review import</button>
        <button type="button" onclick={confirm} disabled={blocked || !canConfirm || !!boundaryError}>Confirm import</button>
        <button type="button" {disabled} onclick={() => {if(!disabled)onCancel?.();}}>Cancel import</button>
    </div>
</section>

<style>
    .control-import { display: grid; gap: .6rem; min-width: 0; }
    .control-import p { margin: 0; }
    .import-options, .import-columns, .import-actions { display: flex; flex-wrap: wrap; gap: .6rem; }
    label { display: grid; gap: .25rem; min-width: 0; }
    textarea { box-sizing: border-box; width: 100%; resize: vertical; font-family: monospace; }
    .import-help { font-size: .85em; opacity: .8; }
    .import-review { overflow: auto; max-height: 20rem; }
    table { border-collapse: collapse; width: 100%; font-size: .9em; }
    th, td { text-align: left; vertical-align: top; border: 1px solid var(--lattice-border, #777); padding: .35rem; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
