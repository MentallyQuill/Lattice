<script lang="ts">
    import {parseControlInput,formatControlInput} from '../src/ui/control-input-contracts.js';
    import type {ControlInputFormat} from '../src/ui/control-input-contracts';
    import type {JsonValue} from '../src/workflow/operations/json-data';
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import TermListControl from './TermListControl.svelte';
    import HotkeyControl from './HotkeyControl.svelte';
    import StructuredControl from './StructuredControl.svelte';
    import type { DetailControl } from './detail-types';
    let { control, text, error = '', disabled = false, pending = false, idPrefix, ontext, onDraft, draftValue, onvalue, onnumber, onsave, saveButton = true, format = 'auto', onformat }: {
        control: DetailControl; text: string; saveButton?: boolean; format?: ControlInputFormat; onformat?: (format:ControlInputFormat)=>void; error?: string; disabled?: boolean; pending?: boolean; idPrefix: string;
        ontext: (text: string) => void; onDraft?: (value: unknown) => void; draftValue?: unknown; onvalue: (value: unknown) => void; onnumber: (input: HTMLInputElement) => void; onsave: () => void;
    } = $props();
    let termMode = $state(false);
    let switchError = $state('');
    const recordEntry = $derived(['patterns','extract'].includes(control.structured ?? ''));
    function switchRows() {
        if(disabled || !control.inputSpec) return;
        const result = parseControlInput(control.inputSpec,draftValue===undefined?{format:termMode?format:'json',text,currentValue:control.value as JsonValue}:{format:'rows',value:draftValue as JsonValue,currentValue:control.value as JsonValue});
        if(termMode && !result.ok) {switchError=result.error.message;return;}
        if(!termMode && result.ok){
            const exported=formatControlInput(control.inputSpec,result.data.value,'auto');
            if(exported.ok){onformat?.('auto');ontext(exported.data);}
            else {if(onDraft)onDraft(result.data.value);else ontext(JSON.stringify(result.data.value,null,2));onformat?.('json');}
        } else if(result.ok){if(onDraft)onDraft(result.data.value);else ontext(JSON.stringify(result.data.value,null,2));}
        else onformat?.('json');
        // Use expression/term text only when export proves it preserves records; otherwise keep explicit JSON.
        termMode=!termMode;switchError='';
    }
    const entry = $derived(control.inputSpec?.editor === 'list');
    const shortChoices = () => control.editor === 'enum' && (control.options?.length ?? 0) > 1 && (control.options?.length ?? 0) <= 3 && control.options!.every(option => option.label.length <= 10);
    const provenance = () => control.effective !== undefined && control.effective !== text && control.source !== 'Saved setting' ? control.source : '';
</script>

<div class:pc-control-number={control.editor === 'number'} class="pc-detail-control">
    {#if entry || recordEntry && termMode}
        {#if recordEntry}<button type="button" aria-label={'Use '+control.label+' rows'} {disabled} onclick={switchRows}>Use rows</button>{/if}
        <TermListControl {control} {text} {format} {draftValue} {disabled} {idPrefix} {error} {ontext} {onformat} />
        {#if switchError}<small role="status">{switchError}</small>{/if}
    {:else if control.inputSpec?.id === 'for-each.helper' && control.helperChoices}
        <label for={idPrefix+'-helper'}>Pinned Data helper</label><select id={idPrefix+'-helper'} aria-label="Pinned Data helper" value={control.helperChoices.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(control.value))?.key??''} {disabled} onchange={event=>{if(!disabled){const choice=control.helperChoices?.find(choice=>choice.key===event.currentTarget.value);if(choice)onvalue(choice.ref);}}}><option value="">Choose an existing item/result helper</option>{#each control.helperChoices as choice (choice.key)}<option value={choice.key}>{choice.label} · v{choice.ref.version}</option>{/each}</select>
        <details><summary>Advanced JSON</summary><label for={idPrefix+'-helper-json'}>{control.label} (JSON)</label><textarea id={idPrefix+'-helper-json'} aria-label={control.label} value={text} {disabled} aria-invalid={!!error} aria-describedby={error?idPrefix+'-error':undefined} oninput={event=>{if(!disabled)ontext(event.currentTarget.value);}}></textarea></details>
    {:else if control.inputSpec?.editor === 'hotkey'}
        <span class="pc-control-label">{control.label}</span><HotkeyControl {control} {text} {draftValue} {disabled} {idPrefix} {error} {ontext} {onDraft} />
    {:else if control.structured && control.editor === 'json'}
        <span class="pc-control-label">{control.label}</span>
        {#if recordEntry}<button type="button" aria-label={'Use '+control.label+' terms'} {disabled} onclick={switchRows}>Terms / CSV</button>{/if}
        <StructuredControl {control} {text} {disabled} {ontext} {onDraft} {draftValue} {idPrefix} {error} />
    {:else if control.editor === 'boolean'}
        <label class="pc-detail-check"><input aria-label={control.label} type="checkbox" checked={Boolean(control.value)} {disabled} onchange={event => { if (!disabled) onvalue(event.currentTarget.checked); }} />{control.label}</label>
    {:else if shortChoices()}
        <span class="pc-control-label">{control.label}</span>
        <div class="pc-control-segments" role="radiogroup" aria-label={control.label}>
            {#each control.options ?? [] as option (option.value)}
                <label><input type="radio" name={idPrefix + '-choice'} aria-label={option.label} value={option.value} checked={String(control.value) === option.value} {disabled} onchange={event => { if (!disabled && event.currentTarget.checked) onvalue(option.value); }} /><span>{option.label}</span></label>
            {/each}
        </div>
    {:else}
        <label for={idPrefix + '-editor'}>{control.label}</label>
        {#if control.editor === 'enum'}
            <select id={idPrefix + '-editor'} aria-label={control.label} value={String(control.value)} {disabled} onchange={event => { if (!disabled) onvalue(event.currentTarget.value); }}>{#each control.options ?? [] as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select>
        {:else if control.editor === 'number'}
            <input id={idPrefix + '-editor'} aria-label={control.label} type="number" min={control.min} max={control.max} step={control.step ?? 1} aria-invalid={!!error} aria-describedby={error ? idPrefix + '-error' : undefined} value={Number(control.value)} {disabled} onchange={event => { if (!disabled) onnumber(event.currentTarget); }} />
        {:else if control.editor === 'json' || control.editor === 'lines'}
            <textarea id={idPrefix + '-editor'} aria-label={control.label} aria-invalid={!!error} aria-describedby={error ? idPrefix + '-error' : undefined} value={text} {disabled} oninput={event => { if (!disabled) ontext(event.currentTarget.value); }}></textarea>
        {:else if control.singleLine && control.editor === 'text' && !text.includes('\n') && !text.includes('\r')}
            <input id={idPrefix + '-editor'} aria-label={control.label} type="text" value={text} {disabled} onchange={event => { if (!disabled) onvalue(event.currentTarget.value); }} />
        {:else}
            <textarea id={idPrefix + '-editor'} aria-label={control.label} value={text} {disabled} onchange={event => { if (!disabled) onvalue(event.currentTarget.value); }}></textarea>
        {/if}
    {/if}
    {#if saveButton && (control.editor === 'json' || control.editor === 'lines')}<button type="button" data-save-control={control.key} disabled={disabled || pending} onclick={() => { if (!disabled && !pending) onsave(); }}>{pending ? 'Validating…' : 'Save ' + control.label}</button>{/if}
    {#if control.help}<small>{control.help}</small>{/if}
    {#if control.exposureNote}<small>{control.exposureNote}</small>{:else if provenance()}<small>{provenance()} · Effective: {control.effective}</small>{/if}
    {#if error}<div id={idPrefix + '-error'} class="pc-detail-error"><DiagnosticMessage issue={error} context={{ inputLabel: control.label }} /></div>{/if}
</div>

<style>
    .pc-detail-control { min-width: 0; margin: 9px 0; }
    label, .pc-control-label { display: block; color: var(--pc-text); font-size: 11px; line-height: 1.5; }
    input:not([type='checkbox']), select, textarea { width: 100%; min-width: 0; box-sizing: border-box; margin-top: 4px; min-height: 28px; padding: 5px 7px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-field); color: var(--pc-text); font: inherit; }
    textarea { display: block; min-height: 88px; resize: vertical; line-height: 1.5; }
    .pc-control-number { display: grid; grid-template-columns: minmax(0, 1fr) minmax(58px, 38%); align-items: center; gap: 3px 8px; }
    .pc-control-number input { margin-top: 0; padding-right: 2px; } .pc-control-number :is(small, .pc-detail-error) { grid-column: 1 / -1; }
    .pc-control-segments { display: flex; margin-top: 4px; gap: 0; min-width: 0; padding: 3px; border-radius: 4px; background: var(--pc-field); }
    .pc-control-segments label { position: relative; flex: 1; min-width: 0; text-align: center; }
    .pc-control-segments input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
    .pc-control-segments span { display: block; box-sizing: border-box; padding: 5px 3px; border: 0; border-radius: 4px; background: transparent; overflow-wrap: anywhere; }
    .pc-control-segments input:checked + span { background: color-mix(in srgb, var(--pc-text) 12%, var(--pc-control)); color: var(--pc-text); }
    .pc-control-segments input:focus-visible + span { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    .pc-control-segments input:disabled + span { opacity: .55; }
    .pc-detail-check { display: flex; align-items: center; gap: 6px; } input[type='checkbox'] { accent-color: var(--pc-accent); flex: none; margin: 0; }
    small { display: block; margin-top: 4px; color: var(--pc-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    button { margin-top: 5px; min-height: 26px; max-width: 100%; padding: 4px 8px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-control); color: var(--pc-text); font: inherit; font-size: 11px; cursor: pointer; overflow-wrap: anywhere; }
    button:hover:not(:disabled) { background: color-mix(in srgb, var(--pc-text) 10%, var(--pc-control)); } :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    :disabled { opacity: .55; cursor: default; } .pc-detail-error { color: var(--pc-error); font-size: 11px; overflow-wrap: anywhere; margin: 6px 0; }
</style>
