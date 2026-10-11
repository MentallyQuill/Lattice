<script lang="ts">
    import {parseControlInput,formatControlInput} from '../src/ui/control-input-contracts.js';
    import type {ControlInputFormat} from '../src/ui/control-input-contracts';
    import type {JsonValue} from '../src/workflow/operations/json-data';
    import DiagnosticMessage from './DiagnosticMessage.svelte';
    import TermListControl from './TermListControl.svelte';
    import HotkeyControl from './HotkeyControl.svelte';
    import ControlImport from './ControlImport.svelte';
    import {controlTableImportFields} from '../src/ui/control-table-import.js';
    import type {ControlImportState,ControlImportDraft} from '../src/ui/control-table-import';
    import StructuredControl from './StructuredControl.svelte';
    import DecisionQuestionsControl from './DecisionQuestionsControl.svelte';
    import ScheduleControl from './ScheduleControl.svelte';
    import type {DecisionDraftState} from '../src/ui/decision-authoring';
    import type {ScheduleDraftState} from '../src/ui/schedule-authoring';
    import type {StructuredDraftState} from './detail-types';
    import SchemaControl from './SchemaControl.svelte';
    import JsonValueControl from './JsonValueControl.svelte';
    import JsonPathControl from './JsonPathControl.svelte';
    import { cloneJsonValue } from '../src/workflow/operations/json-data.js';
    import { formatJsonValueDraftAtPath, validateJsonPath } from '../src/ui/json-value-authoring.js';
    import type { JsonPath } from '../src/workflow/operations/json-data';
    import type { SchemaDraftState } from '../src/ui/schema-authoring';
    import type { DetailControl } from './detail-types';
    let { control, text, error = '', disabled = false, pending = false, idPrefix, ontext, onDraft, draftValue, structuredDraft, onStructuredDraft, structuredIdentity = '', schemaDraft, onSchemaDraft, schemaIdentity = '', importState, onImportState, importIdentity = '', onvalue, onnumber, onsave, saveButton = true, format = 'auto', draftFormat, onformat, recordMode, onRecordMode }: {
        recordMode?:'terms'|'rows'; onRecordMode?:(mode:'terms'|'rows')=>void; importState?:ControlImportState; onImportState?:(state:ControlImportState)=>void; importIdentity?:string;
        control: DetailControl; text: string; structuredIdentity?:string; structuredDraft?:StructuredDraftState; onStructuredDraft?:(state:StructuredDraftState)=>void; schemaIdentity?:string; schemaDraft?:SchemaDraftState; onSchemaDraft?:(state:SchemaDraftState)=>void; saveButton?: boolean; format?: ControlInputFormat; draftFormat?:ControlInputFormat; onformat?: (format:ControlInputFormat)=>void; error?: string; disabled?: boolean; pending?: boolean; idPrefix: string;
        ontext: (text: string) => void; onDraft?: (value: unknown) => void; draftValue?: unknown; onvalue: (value: unknown) => void; onnumber: (input: HTMLInputElement) => void; onsave: () => void;
    } = $props();
    let localRecordMode = $state<'terms'|'rows'>('rows');
    const termMode = $derived((recordMode ?? localRecordMode) === 'terms');
    function setRecordMode(mode:'terms'|'rows'){localRecordMode=mode;onRecordMode?.(mode);}
    function structuredText(source:string){if(disabled)return;onformat?.('json');ontext(source);}
    let switchError = $state('');
    let localSchemaDraft=$state.raw<SchemaDraftState>();
    function schemaStateChange(state:SchemaDraftState){if(disabled)return;localSchemaDraft=state;onSchemaDraft?.(state);}
    const recordEntry = $derived(['patterns','extract'].includes(control.structured ?? ''));
    function switchRows() {
        if(disabled || !control.inputSpec) return;
        const result = parseControlInput(control.inputSpec,draftValue===undefined?{format:termMode?format:'json',text,currentValue:control.value as JsonValue}:{format:'rows',value:draftValue as JsonValue,currentValue:control.value as JsonValue});
        if(termMode && !result.ok) {switchError=result.error.message;return;}
        if(!termMode && result.ok){
            const exported=formatControlInput(control.inputSpec,result.data.value,'auto');
            if(exported.ok){onformat?.('auto');ontext(exported.data);}
            else {if(onDraft)onDraft(result.data.value);else ontext(JSON.stringify(result.data.value,null,2));onformat?.('json');}
        } else if(result.ok){if(onDraft)onDraft(result.data.value);else ontext(JSON.stringify(result.data.value,null,2));onformat?.('json');}
        else onformat?.('json');
        // Use expression/term text only when export proves it preserves records; otherwise keep explicit JSON.
        setRecordMode(termMode?'rows':'terms');switchError='';
    }
    const structured = $derived(['questions','schedules'].includes(control.inputSpec?.editor ?? ''));
    let localStructuredDraft=$state.raw<StructuredDraftState>();
    function structuredStateChange(state:StructuredDraftState){if(disabled||pending)return;localStructuredDraft=state;onStructuredDraft?.(state);}
    const structuredValue=$derived.by(()=>{try{return draftValue===undefined?JSON.parse(text):draftValue;}catch{return control.value;}});
    const typedEntry = $derived(control.editor === 'json' && ['value','path'].includes(control.inputSpec?.editor ?? ''));
    const typed = $derived.by(() => {
        try {
            const value = draftValue === undefined ? JSON.parse(text) : draftValue;
            return control.inputSpec?.editor === 'path'
                ? validateJsonPath(value,{allowIndices:['select-fields.path','format.path'].includes(control.inputSpec.id),maxItems:control.inputSpec.limits.maxItems??64})
                : control.inputSpec?.id==='time-trigger.metadata' ? parseControlInput(control.inputSpec,{format:'rows',value}) : cloneJsonValue(value);
        }
        catch { return { ok: false as const }; }
    });
    function typedChange(value: JsonValue) { if (disabled || pending) return; if (onDraft) onDraft(value); else ontext(JSON.stringify(value, null, 2)); }
    function typedText(source:string) { if(disabled||pending)return; if(control.inputSpec?.editor==='path')onformat?.('json'); ontext(source); }
    function typedInvalid(source: string, path: JsonPath = []) {
        if (disabled || pending || !typed.ok) return;
        const result = formatJsonValueDraftAtPath(typed.data.value, path, source);
        if (result.ok) typedText(result.data.text); else switchError = result.error.message;
    }
    let localImportState=$state.raw<ControlImportState>({open:false,draft:{text:'',delimiter:',',action:'replace',columns:{}}});
    const tableState=$derived(importState??localImportState);
    const tableSupported=$derived(!!control.inputSpec && controlTableImportFields(control.inputSpec).length>0);
    // Valid row editors already admit typed candidates. Avoid reparsing every row keystroke;
    // entering import review validates the full current candidate again.
    const tableValue=$derived(draftValue!==undefined&&!tableState.open?{ok:true as const,data:{value:draftValue as JsonValue}}:control.inputSpec?parseControlInput(control.inputSpec,draftValue===undefined?{format:control.structured?draftFormat??(recordEntry&&termMode?format:'json'):format,text,currentValue:control.value as JsonValue}:{format:'rows',value:draftValue as JsonValue,currentValue:control.value as JsonValue}):null);
    function tableStateChange(state:ControlImportState){if(disabled||pending)return;const checked=cloneJsonValue(state);if(!checked.ok)return;localImportState=checked.data.value as unknown as ControlImportState;onImportState?.(localImportState);}
    function tableDraft(draft:ControlImportDraft){tableStateChange({open:true,draft});}
    function confirmTable(value:JsonValue){if(disabled||pending||!tableValue?.ok)return;typedChange(value);if(recordEntry){onformat?.('json');setRecordMode('rows');}tableStateChange({...tableState,open:false});}
    const entry = $derived(control.inputSpec?.editor === 'list');
    const shortChoices = () => control.editor === 'enum' && (control.options?.length ?? 0) > 1 && (control.options?.length ?? 0) <= 3 && control.options!.every(option => option.label.length <= 10);
    const provenance = () => control.effective !== undefined && control.effective !== text && control.source !== 'Saved setting' ? control.source : '';
</script>

<div class:pc-control-number={control.editor === 'number'} class="pc-detail-control">
    {#if tableSupported && !tableState.open}<button type="button" aria-label={'Import '+control.label+' table'} disabled={disabled||pending||!tableValue?.ok} onclick={()=>{if(tableValue?.ok)tableStateChange({...tableState,open:true});}}>Import {control.label} table</button>{/if}
    {#if tableSupported && tableState.open && control.inputSpec}
        {#key importIdentity}<ControlImport spec={control.inputSpec} value={tableValue?.ok?tableValue.data.value:[]} draft={tableState.draft} onDraft={tableDraft} onConfirm={confirmTable} onCancel={()=>tableStateChange({...tableState,open:false})} disabled={disabled||pending} admissionDisabled={!tableValue?.ok}/>{/key}
        {#if !tableValue?.ok}<small role="alert">Repair the current {control.label} entry before importing.</small>{/if}
    {:else if entry || recordEntry && termMode}
        {#if recordEntry}<button type="button" aria-label={'Use '+control.label+' rows'} {disabled} onclick={switchRows}>Use rows</button>{/if}
        <TermListControl {control} {text} {format} {draftValue} {disabled} {idPrefix} {error} {ontext} {onformat} />
        {#if switchError}<small role="status">{switchError}</small>{/if}
    {:else if control.inputSpec?.editor === 'schema'}
        {#key schemaIdentity}<SchemaControl {text} {ontext} draftState={schemaDraft} onDraftState={schemaStateChange} label={control.label} {idPrefix} disabled={disabled || pending} {error} optional={control.editor==='json' && !!control.allowEmpty} />{/key}
    {:else if structured}
        {#key structuredIdentity}
            {#if control.inputSpec?.editor==='questions'}<DecisionQuestionsControl value={structuredValue as JsonValue} onchange={typedChange} oninvalid={ontext} draftState={structuredDraft as DecisionDraftState} onDraftState={structuredStateChange} label={control.label} {idPrefix} disabled={disabled||pending} {error}/>
            {:else}<ScheduleControl value={structuredValue as JsonValue} onchange={typedChange} oninvalid={ontext} draftState={structuredDraft as ScheduleDraftState} onDraftState={structuredStateChange} label={control.label} {idPrefix} disabled={disabled||pending} {error}/>{/if}
        {/key}
    {:else if typedEntry}
        {#if typed.ok}
            {#if control.inputSpec?.editor === 'path'}<JsonPathControl value={typed.data.value as JsonPath} onchange={typedChange} oninvalid={source => typedInvalid(source)} label={control.label} {idPrefix} {disabled} {error} allowIndices={['select-fields.path','format.path'].includes(control.inputSpec.id)} maxItems={control.inputSpec.limits.maxItems ?? 64} />
            {:else}<JsonValueControl value={typed.data.value} onchange={typedChange} oninvalid={typedInvalid} label={control.label} {idPrefix} disabled={disabled||pending} {error} />{/if}
        {:else}<label for={idPrefix + '-typed-raw'}>{control.label} (Advanced JSON)</label><textarea id={idPrefix + '-typed-raw'} aria-label={control.label + ' JSON'} value={draftValue===undefined?text:JSON.stringify(draftValue,null,2)} disabled={disabled||pending} aria-invalid="true" oninput={event => typedText(event.currentTarget.value)}></textarea><small>Finish this draft to return to the typed editor.</small>{/if}
    {:else if control.inputSpec?.id === 'for-each.helper' && control.helperChoices}
        <label for={idPrefix+'-helper'}>Pinned Data helper</label><select id={idPrefix+'-helper'} aria-label="Pinned Data helper" value={control.helperChoices.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(control.value))?.key??''} {disabled} onchange={event=>{if(!disabled){const choice=control.helperChoices?.find(choice=>choice.key===event.currentTarget.value);if(choice)onvalue(choice.ref);}}}><option value="">Choose an existing item/result helper</option>{#each control.helperChoices as choice (choice.key)}<option value={choice.key}>{choice.label} · v{choice.ref.version}</option>{/each}</select>
        <details><summary>Advanced JSON</summary><label for={idPrefix+'-helper-json'}>{control.label} (JSON)</label><textarea id={idPrefix+'-helper-json'} aria-label={control.label} value={text} {disabled} aria-invalid={!!error} aria-describedby={error?idPrefix+'-error':undefined} oninput={event=>{if(!disabled)ontext(event.currentTarget.value);}}></textarea></details>
    {:else if control.inputSpec?.editor === 'hotkey'}
        <span class="pc-control-label">{control.label}</span><HotkeyControl {control} {text} {draftValue} {disabled} {idPrefix} {error} {ontext} {onDraft} />
    {:else if control.structured && control.editor === 'json'}
        <span class="pc-control-label">{control.label}</span>
        {#if recordEntry}<button type="button" aria-label={'Use '+control.label+' terms'} {disabled} onclick={switchRows}>Terms / CSV</button>{/if}
        <StructuredControl {control} {text} {disabled} ontext={structuredText} {onDraft} {draftValue} {idPrefix} {error} />
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
    {#if saveButton && (control.editor === 'json' || control.editor === 'lines')}<button type="button" data-save-control={control.key} disabled={disabled || pending || tableState.open || structured && !!(structuredDraft ?? localStructuredDraft)?.invalid || control.inputSpec?.editor==='schema' && text!=='' && !!(schemaDraft ?? localSchemaDraft)?.invalid} onclick={() => { if (!disabled && !pending && !tableState.open && !(structured && (structuredDraft ?? localStructuredDraft)?.invalid) && !(control.inputSpec?.editor==='schema' && text!=='' && (schemaDraft ?? localSchemaDraft)?.invalid)) onsave(); }}>{pending ? 'Validating…' : 'Save ' + control.label}</button>{/if}
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
