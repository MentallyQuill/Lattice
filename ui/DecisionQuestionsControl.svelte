<script lang="ts">
    import { updateJsonValueAtPath } from '../src/ui/json-value-authoring.js';
    import { compileQuestionRows } from '../src/ui/decision-authoring.js';
    import type { DecisionDraftState } from '../src/ui/decision-authoring';
    import { allocateControlRowId } from '../src/ui/control-input-adapters.js';
    import { cloneJsonValue, stringifyJsonValue } from '../src/workflow/operations/json-data.js';
    import type { JsonValue, JsonPath } from '../src/workflow/operations/json-data';
    import JsonValueControl from './JsonValueControl.svelte';
    type Row = Record<string,JsonValue>;
    let { value, onchange, oninvalid, draftState, onDraftState, idPrefix, label='Questions', disabled=false, error='' }: {value:JsonValue;onchange:(value:JsonValue)=>void;oninvalid?:(text:string)=>void;draftState?:DecisionDraftState;onDraftState?:(state:DecisionDraftState)=>void;idPrefix:string;label?:string;disabled?:boolean;error?:string}=$props();
    function initial(){return draftState;}
    function initialValue(){return value;}
    function readRows(input:JsonValue):Row[] | null {
        const checked=cloneJsonValue(input);
        if(!checked.ok || !checked.data.value || typeof checked.data.value!=='object' || Array.isArray(checked.data.value))return null;
        const result=Object.entries(checked.data.value).map<Row|null>(([id,question])=>question && typeof question==='object' && !Array.isArray(question)?{...question,id}:null);
        return result.every(row=>row!==null && ['noul','choice','score'].includes(String(row.type)) && Object.hasOwn(row,'instructions') && Object.keys(row).every(key=>['id','type','instructions','criteria'].includes(key)))?result as Row[]:null;
    }
    function encoded(input:JsonValue){const result=stringifyJsonValue(input);return result.ok?result.data.text:'';}
    let rows=$state.raw<Row[]>((initial()?.rows as Row[])??readRows(initialValue())??[]),raw=$state(initial()?.raw??readRows(initialValue())===null),rawText=$state(initial()?.rawText??encoded(initialValue())),feedback=$state(initial()?.feedback??''),invalid=$state(initial()?.invalid??false),invalidText=$state(initial()?.invalidText??'');
    let drafts=$state<Record<string,string>>({...initial()?.drafts});
    let draftPaths=$state.raw<Record<string,JsonPath>>({...initial()?.draftPaths});
    $effect(()=>onDraftState?.({rows,raw,rawText,feedback,invalid,invalidText,drafts:{...drafts},draftPaths:{...draftPaths}}));
    function reject(text:string,message:string){invalid=true;invalidText=text;feedback=message;oninvalid?.(text);}
    function publish(){const result=compileQuestionRows(rows,value);if(!result.ok){reject(encoded(rows),result.error.message);return;}if(Object.keys(drafts).length){reject(encoded(rows),'Finish the retained typed value drafts.');return;}invalid=false;feedback='';onchange(result.data.value);}
    function edit(index:number,key:string,next:JsonValue){if(disabled)return;rows=rows.map((row,i)=>i===index?{...row,[key]:next}:row);publish();}
    function type(index:number,next:string){if(disabled)return;const {criteria,...row}=rows[index];rows=rows.map((item,i)=>i===index?{...row,type:next,...(next==='choice'?{criteria:{'choice-1':null,'choice-2':null}}:next==='score'?{criteria:['','']}: {})}:item);publish();}
    function remove(index:number){if(disabled)return;const id=String(rows[index].id);for(const token of Object.keys(drafts))if(token.startsWith(JSON.stringify(id)+':')){delete drafts[token];delete draftPaths[token];}rows=rows.filter((_,i)=>i!==index);publish();}
    function move(index:number,offset:number){if(disabled || index+offset<0 || index+offset>=rows.length)return;const next=[...rows];[next[index],next[index+offset]]=[next[index+offset],next[index]];rows=next;publish();}
    function add(){if(disabled || rows.length>=32)return;rows=[...rows,{id:allocateControlRowId('question',rows.map(row=>String(row.id))),type:'noul',instructions:''}];publish();}
    function mode(){if(disabled)return;if(raw){raw=false;return;}if(!invalid || !rawText)rawText=encoded(Object.fromEntries(rows.map(({id,...question})=>[String(id),question])));raw=true;}
    function rawInput(text:string){if(disabled)return;rawText=text;try{const parsed=JSON.parse(text),candidate=readRows(parsed);if(candidate===null)throw Error('Use supported question cards with exact instructions and criteria.');const result=compileQuestionRows(candidate);if(!result.ok)throw Error(result.error.message);rows=candidate;drafts={};draftPaths={};invalid=false;feedback='';onchange(result.data.value);}catch(failure){reject(text,failure instanceof Error?failure.message:'Finish questions JSON.');}}
    function typedInvalid(index:number,field:string,text:string,path:JsonPath){if(disabled)return;const key=JSON.stringify(String(rows[index].id))+':'+field;drafts[key]=text;draftPaths={...draftPaths,[key]:[...path]};reject(text,'Finish the typed '+field+' value before saving.');}
    function typedEdit(index:number,field:string,next:JsonValue){if(disabled)return;const key=JSON.stringify(String(rows[index].id))+':'+field;delete drafts[key];delete draftPaths[key];edit(index,field,next);}
    function repair(index:number,field:string,text:string){if(disabled)return;const key=JSON.stringify(String(rows[index].id))+':'+field;drafts[key]=text;try{const result=updateJsonValueAtPath(rows[index][field],draftPaths[key]??[],{action:'set',value:JSON.parse(text)});if(!result.ok)throw Error(result.error.message);typedEdit(index,field,result.data.value);}catch(failure){reject(text,failure instanceof Error?failure.message:'Finish the retained JSON value.');}}

</script>
<div class="cards">
    <button type="button" aria-label={raw?'Use question cards':'Advanced questions JSON'} {disabled} onclick={mode}>{raw?'Use question cards':'Advanced JSON'}</button>
    {#if raw}<label for={idPrefix+'-json'}>{label} JSON</label><textarea id={idPrefix+'-json'} aria-label="Questions JSON" value={rawText} {disabled} oninput={event=>rawInput(event.currentTarget.value)}></textarea>
    {:else}
        <small>{rows.length} of 32 questions. Identity stays fixed when words or order change.</small>
        {#each rows as row,index (row.id)}
            <fieldset {disabled}><legend>Question {index+1}</legend><small>Identity: {row.id}</small>
                <label for={idPrefix+'-type-'+index}>Answer type</label><select id={idPrefix+'-type-'+index} aria-label={'Question '+(index+1)+' type'} value={row.type} onchange={event=>type(index,event.currentTarget.value)}><option value="noul">Yes / no</option><option value="choice">Named choices</option><option value="score">Ordered score rubric</option></select>
                {#if typeof row.instructions==='string'}<label for={idPrefix+'-instructions-'+index}>Instructions</label><textarea id={idPrefix+'-instructions-'+index} aria-label={'Question '+(index+1)+' instructions'} value={row.instructions} oninput={event=>edit(index,'instructions',event.currentTarget.value)}></textarea><button type="button" aria-label={'Use structured question '+(index+1)+' instructions'} onclick={()=>edit(index,'instructions',{text:row.instructions})}>Use structured instructions</button>
                {:else}<JsonValueControl value={row.instructions} onchange={next=>typedEdit(index,'instructions',next)} oninvalid={(text,path)=>typedInvalid(index,'instructions',text,path)} label={'Question '+(index+1)+' instructions'} idPrefix={idPrefix+'-instructions-'+index} {disabled}/>{/if}
                {#if row.type==='noul'}<label class="check"><input type="checkbox" aria-label={'Question '+(index+1)+' descriptions enabled'} checked={Object.hasOwn(row,'criteria')} onchange={event=>{if(disabled)return;if(event.currentTarget.checked)edit(index,'criteria',{true:'',false:''});else {const {criteria,...next}=row;rows=rows.map((item,i)=>i===index?next:item);publish();}}}/> Answer descriptions</label>{/if}
                {#if Object.hasOwn(row,'criteria')}<JsonValueControl value={row.criteria} onchange={next=>typedEdit(index,'criteria',next)} oninvalid={(text,path)=>typedInvalid(index,'criteria',text,path)} label={'Question '+(index+1)+(row.type==='score'?' rubric levels':row.type==='choice'?' alternatives':' answer descriptions')} idPrefix={idPrefix+'-criteria-'+index} {disabled}/>{/if}
                {#each ['instructions','criteria'] as field}{#if Object.hasOwn(drafts,JSON.stringify(String(row.id))+':'+field)}<label for={idPrefix+'-unfinished-'+field+'-'+index}>Unfinished {field} JSON</label><textarea id={idPrefix+'-unfinished-'+field+'-'+index} aria-label={'Question '+(index+1)+' '+field+' unfinished JSON'} value={drafts[JSON.stringify(String(row.id))+':'+field]} oninput={event=>repair(index,field,event.currentTarget.value)}></textarea><button type="button" aria-label={'Discard question '+(index+1)+' '+field+' draft'} onclick={()=>{if(disabled)return;delete drafts[JSON.stringify(String(row.id))+':'+field];delete draftPaths[JSON.stringify(String(row.id))+':'+field];publish();}}>Discard unfinished value</button>{/if}{/each}
                <div class="actions"><button type="button" aria-label={'Move question '+(index+1)+' up'} disabled={disabled || index===0} onclick={()=>move(index,-1)}>Up</button><button type="button" aria-label={'Move question '+(index+1)+' down'} disabled={disabled || index===rows.length-1} onclick={()=>move(index,1)}>Down</button><button type="button" aria-label={'Remove question '+(index+1)} onclick={()=>remove(index)}>Remove</button></div>
            </fieldset>
        {/each}
        <button type="button" aria-label="Add question" disabled={disabled || rows.length>=32} onclick={add}>Add question</button>
    {/if}
    {#if feedback || error}<small role="status">{feedback || error}</small>{/if}
</div>
<style>
    .cards{min-width:0}label,small{display:block;margin:5px 0;font-size:12px}small{color:var(--pc-muted);white-space:pre-wrap;overflow-wrap:anywhere}fieldset{min-width:0;border:1px solid var(--pc-border);margin:8px 0;padding:8px}input:not([type='checkbox']),select,textarea{box-sizing:border-box;width:100%;min-width:0;padding:5px;background:var(--pc-field);color:var(--pc-text);border:1px solid var(--pc-border);font:inherit}textarea{min-height:70px;resize:vertical}button{padding:4px 6px;background:var(--pc-control);color:var(--pc-text);border:1px solid var(--pc-border);font:inherit}.actions,.check{display:flex;flex-wrap:wrap;gap:4px;align-items:center}:disabled{opacity:.55}:is(input,select,textarea,button):focus-visible{outline:2px solid var(--pc-accent);outline-offset:1px}
</style>
