<script lang="ts">
    import { untrack } from 'svelte';
    import { formatJsonValueDraftAtPath } from '../src/ui/json-value-authoring.js';
    import { validateJsonSchema, updateSchemaAtPath, removeSchemaKeyword } from '../src/ui/schema-authoring.js';
    import type { SchemaDraftState } from '../src/ui/schema-authoring';
    import type { JsonValue, JsonPath } from '../src/workflow/operations/json-data';
    import JsonValueControl from './JsonValueControl.svelte';
    type SchemaNode = Record<string, JsonValue>;
    let { text, ontext, oninvalid, draftState, onDraftState, label = 'Schema', idPrefix, optional = true, disabled = false, error = '' }: { draftState?: SchemaDraftState; onDraftState?: (state: SchemaDraftState) => void; text: string; ontext: (text: string) => void; oninvalid?: (text: string, path?: readonly (string | number)[]) => void; label?: string; idPrefix: string; optional?: boolean; disabled?: boolean; error?: string } = $props();
    function initial() { return draftState; }
    let path = $state<string[]>([...(initial()?.path ?? [])]), raw = $state(initial()?.raw ?? false), rawText = $state(initial()?.rawText ?? ''), feedback = $state(initial()?.feedback ?? ''), invalid = $state(initial()?.invalid ?? false), inactiveText = $state(initial()?.inactiveText ?? '');
    let invalidText = $state(initial()?.invalidText ?? ''), invalidPath = $state<(string|number)[]>([...(initial()?.invalidPath ?? [])]);
    let newProperty = $state(''), page = $state(0);
    let numberDrafts = $state<Record<string,string>>({...initial()?.numberDrafts});
    let typedDrafts = $state.raw<Record<string,JsonValue>>({...initial()?.typedDrafts});
    let invalidKeyword = $state(initial()?.invalidKeyword ?? '');
    let typedTextDrafts = $state<Record<string,string>>({...initial()?.typedTextDrafts});
    $effect(()=> { const authored={path:[...path],raw,rawText,feedback,invalid,inactiveText,invalidText,invalidPath:[...invalidPath],invalidKeyword,numberDrafts:{...numberDrafts},typedDrafts:{...typedDrafts},typedTextDrafts:{...typedTextDrafts}}; untrack(()=>onDraftState?.(authored)); });
    const pageSize = 64;
    const types = ['null','boolean','object','array','number','integer','string'];
    const numbers = ['minItems','maxItems','minLength','maxLength','minimum','maximum'];
    const annotations = ['title','description','$schema'];
    function parse(source: string) {
        try { return validateJsonSchema(JSON.parse(source)); }
        catch { return { ok: false as const, error: { code: 'INVALID_SCHEMA_JSON', message: 'Finish valid schema JSON.' } }; }
    }
    const enabled = $derived(text !== '');
    const checked = $derived(enabled ? parse(text) : validateJsonSchema({}));
    const schema = $derived(checked.ok ? checked.data.schema as SchemaNode : {});
    function nodeAt(root: SchemaNode, keys: readonly string[]): SchemaNode {
        let node: JsonValue = root;
        for (const key of keys) {
            if (!node || typeof node !== 'object' || Array.isArray(node) || !Object.hasOwn(node,key)) return {};
            node = node[key];
        }
        return node as SchemaNode;
    }
    const node = $derived(nodeAt(schema,path));
    const properties = $derived(node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties) ? node.properties as SchemaNode : {});
    const keys = $derived(Object.keys(properties));
    const visibleKeys = $derived(keys.slice(page*pageSize,(page+1)*pageSize));
    const required = $derived(Array.isArray(node.required) ? node.required as string[] : []);
    const editingRaw = $derived(raw || !checked.ok);
    const token = $derived(path.map(key=>key.length+':'+key).join('|'));
    function reject(source: string, message: string, at: readonly (string | number)[] = path) { invalid = true; invalidText=source; invalidPath=[...at]; feedback = message; oninvalid?.(source,at); }
    function attempted(next: Record<string,JsonValue>) {
        function replace(root: SchemaNode, keys: readonly string[]): SchemaNode {
            if(!keys.length)return {...root,...next};
            const key=keys[0], output={...root};
            Object.defineProperty(output,key,{value:replace(root[key] as SchemaNode,keys.slice(1)),enumerable:true});
            return output;
        }
        return JSON.stringify(replace(schema,path));
    }
    function commit(result: ReturnType<typeof updateSchemaAtPath>, source = text) {
        if (!result.ok) { reject(source,result.error.message); return; }
        invalid = false; invalidText=''; invalidPath=[]; invalidKeyword=''; feedback = ''; ontext(JSON.stringify(result.data.schema));
    }
    function patch(next: Record<string,JsonValue>, repair = false) {
        if (disabled || invalid && !repair) return;
        commit(updateSchemaAtPath(schema,path,next),attempted(next));
    }
    function remove(keyword: string) { if (disabled || invalid) return; commit(removeSchemaKeyword(schema,path,keyword)); }
    function toggle(keyword: string, next: boolean, initial: JsonValue) { if (disabled || invalid) return; if (next) patch({[keyword]:initial}); else remove(keyword); }
    function navigate(next: string[]) { if (disabled || invalid) return; path=next; newProperty=''; page=0; feedback=''; }
    function addProperty() {
        if (disabled || invalid) return;
        if (Object.hasOwn(properties,newProperty)) { feedback='That exact property already exists.'; return; }
        const next = {...properties}; Object.defineProperty(next,newProperty,{value:{},enumerable:true}); patch({properties:next}); newProperty='';
    }
    function removeProperty(key: string) {
        if (disabled || invalid) return;
        const next={...properties}; delete next[key];
        const nextRequired=required.filter(name=>name!==key);
        const changed=updateSchemaAtPath(schema,path,{properties:next,...(Object.hasOwn(node,'required') ? {required:nextRequired} : {})});
        commit(changed.ok && required.includes(key) && !nextRequired.length ? removeSchemaKeyword(changed.data.schema,path,'required') : changed);
        if (page*pageSize>=keys.length-1) page=Math.max(0,page-1);
    }
    function requireProperty(key: string, next: boolean) {
        if (disabled || invalid) return;
        const names=next ? required.includes(key) ? required : [...required,key] : required.filter(name=>name!==key);
        if(names.length) patch({required:names}); else if(Object.hasOwn(node,'required')) remove('required');
    }
    function numeric(keyword: string, source: string) {
        if (disabled || invalid && invalidKeyword!==keyword) return;
        numberDrafts[token+'|'+keyword]=source;
        if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(source) || !Number.isFinite(Number(source)) || (['minItems','maxItems','minLength','maxLength'].includes(keyword) && (!Number.isSafeInteger(Number(source)) || Number(source)<0))) { invalidKeyword=keyword; reject(source,'Finish a valid '+keyword+' number.'); return; }
        delete numberDrafts[token+'|'+keyword]; patch({[keyword]:Number(source)},true);
    }
    function typed(keyword: string, next: JsonValue) {
        if(disabled || invalid && invalidKeyword!==keyword)return;
        const result=updateSchemaAtPath(schema,path,{[keyword]:next});
        if(!result.ok) { typedDrafts={...typedDrafts,[token+'|'+keyword]:next}; invalidKeyword=keyword; reject(attempted({[keyword]:next}),result.error.message,[...path,keyword]); return; }
        const drafts={...typedDrafts}; delete drafts[token+'|'+keyword]; typedDrafts=drafts; delete typedTextDrafts[token+'|'+keyword]; commit(result);
    }
    function typedInvalid(keyword: string, source: string, at: JsonPath) {
        if(disabled || invalid && invalidKeyword!==keyword)return;
        const value=Object.hasOwn(typedDrafts,token+'|'+keyword) ? typedDrafts[token+'|'+keyword] : node[keyword];
        const formatted=formatJsonValueDraftAtPath(value,at,source);
        if(formatted.ok)typedTextDrafts[token+'|'+keyword]=formatted.data.text;
        invalidKeyword=keyword; reject(source,'Finish the '+keyword+' value.',[...path,keyword,...at]);
    }
    function typedText(keyword: string, source: string) {
        if(disabled || invalid && invalidKeyword!==keyword)return;
        typedTextDrafts[token+'|'+keyword]=source;
        try { typed(keyword,JSON.parse(source)); }
        catch { invalidKeyword=keyword; reject(source,'Finish the '+keyword+' JSON.',[...path,keyword]); }
    }
    function jsonInput(source: string) {
        if (disabled) return; rawText=source;
        const result=parse(source);
        if (!result.ok) { reject(source,result.error.message,[]); return; }
        invalid=false; invalidText=''; invalidPath=[]; feedback=''; numberDrafts={}; typedDrafts={}; typedTextDrafts={}; invalidKeyword=''; path=[]; ontext(source);
    }
    function mode() {
        if(disabled)return;
        if(editingRaw) { if(invalid || !checked.ok)return; raw=false; }
        else { rawText=invalid ? invalidText : text; raw=true; }
    }
    function enable(next: boolean) {
        if(disabled)return;
        if(next) { const restored=inactiveText || '{}'; ontext(restored); }
        else { inactiveText=text; ontext(''); }
    }
</script>
<div class="schema-control" data-schema-control>
    {#if optional}<label class="check"><input type="checkbox" aria-label={label+' schema enabled'} checked={enabled} {disabled} onchange={event=>enable(event.currentTarget.checked)} /> Enable schema</label>{/if}
    {#if enabled || !optional}
        <button type="button" aria-label={'Edit '+label+' schema as '+(editingRaw?'builder':'JSON')} {disabled} onclick={mode}>{editingRaw?'Use schema builder':'Advanced JSON'}</button>
        {#if editingRaw}
            <label for={idPrefix+'-schema-json'}>{label} (JSON)</label><textarea id={idPrefix+'-schema-json'} aria-label={label+' schema JSON'} value={raw || invalid ? rawText : text} {disabled} aria-invalid={invalid || !checked.ok || !!error} oninput={event=>jsonInput(event.currentTarget.value)}></textarea>
        {:else}
            {#if path.length}<div class="location"><span>{path.filter((_,index)=>index===0 || path[index-1]==='properties' || path[index]==='items').join(' / ')}</span><button type="button" aria-label={'Back '+label+' schema'} disabled={disabled || invalid} onclick={()=>navigate(path[path.length-1]==='items'?path.slice(0,-1):path.slice(0,-2))}>Back</button></div>{/if}
            <label for={idPrefix+'-schema-type'}>Type</label><select id={idPrefix+'-schema-type'} aria-label={label+' schema type'} value={node.type ?? ''} disabled={disabled || invalid} onchange={event=>event.currentTarget.value?patch({type:event.currentTarget.value}):remove('type')}><option value="">Any supported JSON type</option>{#each types as type}<option value={type}>{type}</option>{/each}</select>
            {#each annotations as keyword}
                <label class="check"><input type="checkbox" aria-label={label+' '+keyword+' enabled'} checked={Object.hasOwn(node,keyword)} disabled={disabled || invalid} onchange={event=>toggle(keyword,event.currentTarget.checked,'')} /> {keyword}</label>
                {#if Object.hasOwn(node,keyword)}<label for={idPrefix+'-'+keyword}>{keyword}</label><input id={idPrefix+'-'+keyword} aria-label={label+' '+keyword} value={String(node[keyword])} disabled={disabled || invalid} oninput={event=>patch({[keyword]:event.currentTarget.value})} />{/if}
            {/each}
            {#each numbers as keyword}
                <label class="check"><input type="checkbox" aria-label={label+' '+keyword+' enabled'} checked={Object.hasOwn(node,keyword)} disabled={disabled || invalid} onchange={event=>toggle(keyword,event.currentTarget.checked,0)} /> {keyword}</label>
                {#if Object.hasOwn(node,keyword)}<label for={idPrefix+'-'+keyword}>{keyword}</label><input id={idPrefix+'-'+keyword} aria-label={label+' '+keyword} inputmode="decimal" value={numberDrafts[token+'|'+keyword] ?? String(node[keyword])} disabled={disabled || invalid && invalidKeyword!==keyword} aria-invalid={Object.hasOwn(numberDrafts,token+'|'+keyword)} oninput={event=>numeric(keyword,event.currentTarget.value)} />{/if}
            {/each}
            <label class="check"><input type="checkbox" aria-label={label+' additionalProperties enabled'} checked={Object.hasOwn(node,'additionalProperties')} disabled={disabled || invalid} onchange={event=>toggle('additionalProperties',event.currentTarget.checked,true)} /> Limit additional properties</label>
            {#if Object.hasOwn(node,'additionalProperties')}<label class="check"><input type="checkbox" aria-label={label+' additionalProperties'} checked={node.additionalProperties===true} disabled={disabled || invalid} onchange={event=>patch({additionalProperties:event.currentTarget.checked})} /> Allow additional properties</label>{/if}
            {#each ['enum','const'] as keyword}
                <label class="check"><input type="checkbox" aria-label={label+' '+keyword+' enabled'} checked={Object.hasOwn(node,keyword)} disabled={disabled || invalid} onchange={event=>toggle(keyword,event.currentTarget.checked,keyword==='enum'?[null]:null)} /> {keyword==='enum'?'Allowed values':'Exact value'}</label>
                {#if Object.hasOwn(node,keyword)}
                    {#if Object.hasOwn(typedTextDrafts,token+'|'+keyword)}<label for={idPrefix+'-'+keyword+'-draft'}>{keyword} (JSON)</label><textarea id={idPrefix+'-'+keyword+'-draft'} aria-label={label+' '+keyword+' JSON'} value={typedTextDrafts[token+'|'+keyword]} aria-invalid="true" disabled={disabled || invalid && invalidKeyword!==keyword} oninput={event=>typedText(keyword,event.currentTarget.value)}></textarea>
                    {:else}<JsonValueControl value={Object.hasOwn(typedDrafts,token+'|'+keyword) ? typedDrafts[token+'|'+keyword] : node[keyword]} onchange={next=>typed(keyword,next)} oninvalid={(source,at)=>typedInvalid(keyword,source,at)} label={label+' '+keyword} idPrefix={idPrefix+'-'+keyword} disabled={disabled || invalid && invalidKeyword!==keyword} />{/if}
                {/if}
            {/each}
            <small>{keys.length} properties. Property names are exact keys.</small>
            {#each visibleKeys as key (key)}<div class="property"><button type="button" aria-label={'Edit '+label+' property '+key} disabled={disabled || invalid} onclick={()=>navigate([...path,'properties',key])}>{key || '(empty key)'}</button><label class="check"><input type="checkbox" aria-label={label+' required '+key} checked={required.includes(key)} disabled={disabled || invalid} onchange={event=>requireProperty(key,event.currentTarget.checked)} /> Required</label><button type="button" aria-label={'Remove '+label+' property '+key} disabled={disabled || invalid} onclick={()=>removeProperty(key)}>Remove</button></div>{/each}
            {#each required.filter(key=>!Object.hasOwn(properties,key)) as key}<label class="check"><input type="checkbox" aria-label={label+' required '+key} checked disabled={disabled || invalid} onchange={event=>requireProperty(key,event.currentTarget.checked)} /> Required key: {key}</label>{/each}
            {#if keys.length>pageSize}<div class="actions"><button type="button" aria-label={'Previous '+label+' properties'} disabled={disabled || invalid || page===0} onclick={()=>{if(!disabled&&!invalid)page--;}}>Previous</button><small>Page {page+1} of {Math.ceil(keys.length/pageSize)}</small><button type="button" aria-label={'Next '+label+' properties'} disabled={disabled || invalid || (page+1)*pageSize>=keys.length} onclick={()=>{if(!disabled&&!invalid)page++;}}>Next</button></div>{/if}
            <label for={idPrefix+'-new-property'}>Exact property key</label><input id={idPrefix+'-new-property'} aria-label={label+' new property'} value={newProperty} disabled={disabled || invalid} oninput={event=>{if(!disabled&&!invalid)newProperty=event.currentTarget.value;}} /><button type="button" aria-label={'Add '+label+' property'} disabled={disabled || invalid} onclick={addProperty}>Add property</button>
            <label class="check"><input type="checkbox" aria-label={label+' items enabled'} checked={Object.hasOwn(node,'items')} disabled={disabled || invalid} onchange={event=>toggle('items',event.currentTarget.checked,{})} /> Item schema</label>
            {#if Object.hasOwn(node,'items')}<button type="button" aria-label={'Edit '+label+' items'} disabled={disabled || invalid} onclick={()=>navigate([...path,'items'])}>Edit item schema</button>{/if}
        {/if}
    {/if}
    {#if feedback || error || !checked.ok}<small role="status">{feedback || error || (!checked.ok ? checked.error.message : '')}</small>{/if}
</div>
<style>
    .schema-control { min-width: 0; } label, small { display: block; margin: 5px 0; font-size: 12px; } small { color: var(--pc-muted); } input:not([type='checkbox']), select, textarea { width: 100%; box-sizing: border-box; min-width: 0; padding: 5px; border: 1px solid var(--pc-border); background: var(--pc-field); color: var(--pc-text); font: inherit; } textarea { min-height: 100px; resize: vertical; } button { padding: 4px 6px; margin: 3px 0; background: var(--pc-control); color: var(--pc-text); border: 1px solid var(--pc-border); font: inherit; } .property, .actions, .check, .location { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; } .property { margin: 4px 0; } :disabled { opacity: .55; } :is(input,select,textarea,button):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
</style>
