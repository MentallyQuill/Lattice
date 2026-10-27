<script lang="ts">
    import { updateJsonValueAtPath, formatJsonValueDraftAtPath } from '../src/ui/json-value-authoring.js';
    import { cloneJsonValue } from '../src/workflow/operations/json-data.js';
    import type { JsonValue, JsonPath } from '../src/workflow/operations/json-data';
    type ValueType = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
    let { value, onchange, oninvalid, label = 'Value', idPrefix, disabled = false, error = '', embedded = false }: {
        value: JsonValue; onchange: (value: JsonValue) => void; oninvalid?: (text: string, path: JsonPath) => void;
        label?: string; idPrefix: string; disabled?: boolean; error?: string; embedded?: boolean;
    } = $props();
    const checked = $derived(cloneJsonValue(value));
    const root = $derived(checked.ok ? checked.data.value : null);
    const signature = $derived(checked.ok ? JSON.stringify(checked.data.value) : '');
    let raw = $state(false), rawText = $state(''), feedback = $state('');
    let expanded = $state<string[]>([]), pages = $state<Record<string, number>>({});
    let keyDrafts = $state<Record<string, string>>({}), drafts = $state<Record<string, string>>({});
    let textDrafts = $state<Record<string, string>>({});
    let invalidPath = $state<JsonPath | null>(null), invalidSource = $state('');
    let submittedSignature = '';
    const pageSize = 64, tokens = new Map<string, string>();
    const token = (at: JsonPath) => JSON.stringify(at);
    function nodeId(at: JsonPath) { const key=token(at);if(!tokens.has(key))tokens.set(key,idPrefix+'-value-'+tokens.size);return tokens.get(key)!; }
    const same = (a: JsonPath, b: JsonPath) => token(a)===token(b);
    const editable = (at: JsonPath) => !disabled && (invalidPath===null || same(invalidPath,at));
    const editingRaw = $derived(raw || !checked.ok);
    $effect(()=>{if(raw && invalidPath===null && signature!==submittedSignature && checked.ok)rawText=JSON.stringify(checked.data.value,null,2);});
    function atPath(at: JsonPath): JsonValue {
        let node=root;
        for(const key of at){if(node===null || typeof node!=='object')return null;const property=Object.getOwnPropertyDescriptor(node,key);if(!property||!('value' in property))return null;node=property.value;}
        return node;
    }
    const kind = (node: JsonValue): ValueType => node===null?'null':Array.isArray(node)?'array':typeof node as ValueType;
    const keysAt = (node: JsonValue): (string|number)[] => node!==null&&typeof node==='object'?Array.isArray(node)?node.map((_,i)=>i):Object.keys(node):[];
    function preview(node: JsonValue) { const type=kind(node);return type==='array'?`${(node as JsonValue[]).length} items`:type==='object'?`${Object.keys(node as object).length} properties`:type==='null'?'Null':type==='boolean'?(node?'True':'False'):String(node).slice(0,100); }
    function reject(source: string, at: JsonPath, message: string) { invalidPath=[...at];invalidSource=source;feedback=message;oninvalid?.(source,[...at]); }
    function publish(at: JsonPath, next: JsonValue, source = JSON.stringify(next)) {
        if(!editable(at))return;const result=updateJsonValueAtPath(value,at,{action:'set',value:next});
        if(!result.ok){reject(source,at,result.error.message);return;}
        delete drafts[token(at)];delete textDrafts[token(at)];invalidPath=null;invalidSource='';feedback='';submittedSignature=JSON.stringify(result.data.value);onchange(result.data.value);
    }
    function changeType(at: JsonPath, type: ValueType) {
        if(!editable(at))return;const defaults:Record<ValueType,JsonValue>={string:'',number:0,boolean:false,null:null,object:{},array:[]};publish(at,defaults[type]);
    }
    function numberInput(at: JsonPath, source: string) {
        if(!editable(at))return;drafts[token(at)]=source;
        if(!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(source)||!Number.isFinite(Number(source))){reject(source,at,'Finish a valid JSON number.');return;}publish(at,Number(source),source);
    }
    function stringInput(at: JsonPath, source: string) { if(!editable(at))return;textDrafts[token(at)]=source;publish(at,source,JSON.stringify(source)); }
    function toggle(at: JsonPath) { const key=token(at);expanded=expanded.includes(key)?expanded.filter(item=>item!==key):[...expanded,key]; }
    function remove(at: JsonPath) {
        if(!editable(at)||!at.length)return;const result=updateJsonValueAtPath(value,at,{action:'remove'});
        if(!result.ok){feedback=result.error.message;return;}invalidPath=null;invalidSource='';feedback='';onchange(result.data.value);
    }
    function addProperty(at: JsonPath) {
        if(!editable(at))return;const current=atPath(at), key=keyDrafts[token(at)]??'';
        if(current===null||typeof current!=='object'||Array.isArray(current))return;
        if(Object.hasOwn(current,key)){feedback='That exact key already exists.';return;}
        const result=updateJsonValueAtPath(value,[...at,key],{action:'set',value:null});if(!result.ok){feedback=result.error.message;return;}
        keyDrafts[token(at)]='';expanded=[...expanded,token([...at,key])];feedback='';onchange(result.data.value);
    }
    function addItem(at: JsonPath) {
        if(!editable(at))return;const current=atPath(at);if(!Array.isArray(current))return;const child=[...at,current.length];
        const result=updateJsonValueAtPath(value,child,{action:'set',value:null});if(!result.ok){feedback=result.error.message;return;}
        pages[token(at)]=Math.floor(current.length/pageSize);expanded=[...expanded,token(child)];feedback='';onchange(result.data.value);
    }
    function move(parent: JsonPath, index: number, offset: number) {
        if(!editable(parent))return;const current=atPath(parent);if(!Array.isArray(current)||index+offset<0||index+offset>=current.length)return;
        const next=[...current];[next[index],next[index+offset]]=[next[index+offset],next[index]];publish(parent,next);
    }
    function mode() {
        if(editingRaw){if(invalidPath!==null||!checked.ok)return;raw=false;return;}
        const recovery=invalidPath!==null?formatJsonValueDraftAtPath(value,invalidPath,invalidSource):null;
        rawText=recovery?.ok?recovery.data.text:checked.ok?JSON.stringify(checked.data.value,null,2):'';raw=true;
    }
    function rawInput(source: string) {
        if(disabled)return;rawText=source;
        try {const parsed=JSON.parse(source), result=cloneJsonValue(parsed);if(!result.ok){reject(source,[],result.error.message);return;}
            invalidPath=null;invalidSource='';feedback='';drafts={};textDrafts={};submittedSignature=JSON.stringify(result.data.value);onchange(result.data.value);
        } catch {reject(source,[],'Finish valid JSON before returning to the field editor.');}
    }
</script>

{#snippet editor(at: JsonPath)}
    {@const current=atPath(at)}{@const type=kind(current)}{@const key=token(at)}
    <div class="value-body" id={nodeId(at)} data-value-node data-value-path={key} role="group" aria-label={at.length?label+' · '+at.map(part=>typeof part==='number'?'Index '+part:'Key '+part).join(' / '):label}>
        <div class="type-row"><label for={nodeId(at)+'-type'}>Type</label><select id={nodeId(at)+'-type'} aria-label={label+' type'} value={type} disabled={!editable(at)} onchange={event=>changeType(at,event.currentTarget.value as ValueType)}><option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="null">Null</option><option value="object">Object</option><option value="array">Array</option></select></div>
        {#if type==='string'}<label for={nodeId(at)+'-string'}>Text</label><textarea id={nodeId(at)+'-string'} aria-label={label+' string'} value={textDrafts[key]??String(current)} disabled={!editable(at)} oninput={event=>stringInput(at,event.currentTarget.value)}></textarea>
        {:else if type==='number'}<label for={nodeId(at)+'-number'}>Number</label><input id={nodeId(at)+'-number'} aria-label={label+' number'} inputmode="decimal" aria-invalid={Object.hasOwn(drafts,key)} value={drafts[key]??String(current)} disabled={!editable(at)} oninput={event=>numberInput(at,event.currentTarget.value)}/>
        {:else if type==='boolean'}<label class="check"><input type="checkbox" role="switch" aria-label={label+' boolean'} checked={current===true} disabled={!editable(at)} onchange={event=>publish(at,event.currentTarget.checked)}/>True <span>{current?'On':'Off'}</span></label>
        {:else if type==='null'}<small>Null is an explicit value.</small>
        {:else}
            {@const keys=keysAt(current)}{@const page=Math.min(pages[key]??0,Math.max(0,Math.ceil(keys.length/pageSize)-1))}
            {#each keys.slice(page*pageSize,(page+1)*pageSize) as childKey (childKey)}
                {@const child=[...at,childKey]}{@const open=expanded.includes(token(child))}
                <div class="child"><button class="value-toggle" type="button" aria-label={'Edit '+label+' '+(type==='array'?'index ':'key ')+childKey} aria-expanded={open} aria-controls={nodeId(child)} onclick={()=>toggle(child)}><span><strong>{type==='array'?'Index '+childKey:childKey===''?'(empty key)':String(childKey)}</strong><small>{kind(atPath(child))} · {preview(atPath(child))}</small></span><span aria-hidden="true">{open?'⌄':'›'}</span></button>
                    {#if open}{@render editor(child)}<div class="actions">{#if type==='array'}<button type="button" aria-label={'Move '+label+' index '+childKey+' up'} disabled={!editable(at)||childKey===0} onclick={()=>move(at,Number(childKey),-1)}>Move up</button><button type="button" aria-label={'Move '+label+' index '+childKey+' down'} disabled={!editable(at)||childKey===keys.length-1} onclick={()=>move(at,Number(childKey),1)}>Move down</button>{/if}<button type="button" aria-label={'Remove '+label+' '+(type==='array'?'index ':'key ')+childKey} disabled={!editable(child)} onclick={()=>remove(child)}>Remove</button></div>{/if}
                </div>
            {/each}
            {#if keys.length>pageSize}<div class="actions"><button type="button" aria-label={'Previous '+label+' children'} disabled={page===0} onclick={()=>pages[key]=page-1}>Previous</button><small>Page {page+1} of {Math.ceil(keys.length/pageSize)}</small><button type="button" aria-label={'Next '+label+' children'} disabled={(page+1)*pageSize>=keys.length} onclick={()=>pages[key]=page+1}>Next</button></div>{/if}
            {#if type==='object'}<form onsubmit={event=>{event.preventDefault();addProperty(at);}}><label for={nodeId(at)+'-new-key'}>Exact property key</label><div class="add-row"><input id={nodeId(at)+'-new-key'} aria-label={label+' new key'} value={keyDrafts[key]??''} disabled={!editable(at)} oninput={event=>{if(editable(at))keyDrafts[key]=event.currentTarget.value;}}/><button type="submit" aria-label={'Add '+label+' property'} disabled={!editable(at)}>Add property</button></div></form>
            {:else}<button class="add-item" type="button" aria-label={'Add '+label+' item'} disabled={!editable(at)} onclick={()=>addItem(at)}>+ Add item</button>{/if}
        {/if}
    </div>
{/snippet}

<div class="json-value-control" data-json-value-control>
    <div class="mode"><button type="button" aria-label={'Edit '+label+' as '+(editingRaw?'fields':'JSON')} disabled={editingRaw&&(invalidPath!==null||!checked.ok)} onclick={mode}>{editingRaw?'Use field editor':'Edit JSON'}</button></div>
    {#if editingRaw}<label for={idPrefix+'-json'}>{label} JSON</label><textarea id={idPrefix+'-json'} aria-label={label+' JSON'} aria-invalid={invalidPath!==null||!!error||!checked.ok} value={rawText} readonly={disabled} oninput={event=>rawInput(event.currentTarget.value)}></textarea>
    {:else}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the bounded value tree.) -->
        <div class="value-scroll" class:embedded role={embedded?'group':'region'} aria-label={label+' fields'} tabindex={embedded?undefined:0}>{@render editor([])}</div>
    {/if}
    {#if feedback||error||!checked.ok}<small role="status">{feedback||error||(!checked.ok?checked.error.message:'')}</small>{/if}
</div>

<style>
    .json-value-control,.value-body,.child{min-width:0;box-sizing:border-box;color:var(--pc-text);font:inherit}
    .value-scroll{max-height:400px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;padding-right:3px}.mode{display:flex;justify-content:flex-end;margin:4px 0}
    .value-scroll.embedded{max-height:none;overflow:visible;padding-right:0}
    .type-row,.add-row{display:flex;align-items:center;gap:6px;min-width:0}.type-row>label{flex:none}.type-row>select,.add-row>input{flex:1;min-width:0}
    label{display:block;margin:6px 0 3px;font-size:11px}input:not([type='checkbox']),select,textarea{box-sizing:border-box;width:100%;min-width:0;min-height:28px;padding:5px 6px;background:var(--pc-field);color:var(--pc-text);border:1px solid var(--pc-border);border-radius:var(--pc-r-sm,3px);font:inherit}
    textarea{display:block;min-height:70px;resize:vertical;line-height:1.5}.value-body .value-body{margin-left:7px;border-left:1px solid var(--pc-border);padding-left:7px}
    .child{border-top:1px solid var(--pc-border);margin-top:7px;padding-top:3px}.value-toggle{display:flex;align-items:center;justify-content:space-between;gap:7px;width:100%;text-align:left;background:transparent;border-color:transparent;padding:6px 1px}.value-toggle>span:first-child{min-width:0}.value-toggle strong{display:block;font-weight:500;overflow-wrap:anywhere}.value-toggle small{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
    button{min-height:28px;padding:4px 7px;border:1px solid var(--pc-border);border-radius:var(--pc-r-sm,3px);background:var(--pc-control);color:var(--pc-text);font:inherit;cursor:pointer;overflow-wrap:anywhere}
    .actions{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 8px 7px}.add-item{margin-top:7px}.add-row>button{flex:none;font-size:10px}
    small{color:var(--pc-muted);font-size:10px;line-height:1.5;overflow-wrap:anywhere}.check{display:flex;gap:6px;align-items:center}.check span{margin-left:auto;color:var(--pc-muted)}input[type='checkbox']{accent-color:var(--pc-accent)}
    :is(button,input,select,textarea):focus-visible{outline:2px solid var(--pc-accent);outline-offset:1px}:disabled{opacity:.55;cursor:default}
</style>
