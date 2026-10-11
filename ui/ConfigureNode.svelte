<script lang="ts">
 import {workflowDataPresetFor} from '../src/workflow/workflow-data-defaults.js';
 import DiagnosticMessage from './DiagnosticMessage.svelte';
 import DetailControlEditor from './DetailControl.svelte';
 import {projectNodeControls,controlInputPresentation} from '../src/ui/node-control-projection.js';
 import {parseControlInput} from '../src/ui/control-input-contracts.js';
 import {cloneJsonValue} from '../src/workflow/operations/json-data.js';
 import {cloneDefinitionData} from '../src/workflow/definition-data.js';
 import {onMount,tick} from 'svelte';
 import type {ConfigureNodeView,ConfigureNodeActions} from './storage-setup-types';
 import type {StructuredDraftState,DetailControl} from './detail-types';
 import type {ControlInputFormat} from '../src/ui/control-input-contracts';
 import type {SchemaDraftState} from '../src/ui/schema-authoring';
 import type {ControlImportState} from '../src/ui/control-table-import';
 import type {JsonValue} from '../src/workflow/operations/json-data';
 const inputError=(error:{code:string;message:string})=>error.code==='INVALID_CONTROL_JSON'?error.code+': '+error.message:error.message;
 let {view,actions}:{view:ConfigureNodeView;actions?:ConfigureNodeActions}=$props();
 type Draft={structuredDraft?:StructuredDraftState;schemaDraft?:SchemaDraftState;text?:string;value?:unknown;format?:ControlInputFormat;contract:string;error?:string};
 let recordModes=$state.raw<Record<string,{contract:string;mode:'terms'|'rows'}>>({});
 let importStates=$state.raw<Record<string,{contract:string;state:ControlImportState}>>({});
 const importOpen=$derived(Object.values(importStates).some(value=>value.state.open));
 function importState(control:DetailControl,state:ControlImportState){if(pending||!actions)return;const checked=cloneJsonValue(state);if(!checked.ok)return;importStates={...importStates,[control.key]:{contract:contract(control),state:checked.data.value as unknown as ControlImportState}};}
 let dialog:HTMLDivElement,data=$state<Record<string,unknown>>({}),drafts=$state<Record<string,Draft>>({}),controls=$state(''),advanced=$state(false),phase=$state<'pre'|'post'>('pre'),target=$state(''),helper=$state(''),pending=$state(false),failure=$state('');let capture='',generation=0,advancedBaseline:Record<string,unknown>={},advancedInvalid=false;
 const typedSnapshot=(value:unknown)=>{const checked=cloneJsonValue(value);if(!checked.ok)throw Error(checked.error.message);return checked.data.value;};
 const controlsSnapshot=()=>{const checked=cloneDefinitionData(data,{operation:view.operation});if(!checked.ok)throw Error(checked.error.message);return checked.data as Record<string,unknown>;};
 const selectedHelper=$derived(view.helpers.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(data.helper)));
 const fields=$derived(projectNodeControls(view.operation,data,{phase}));
 const automaticTarget=$derived(view.operation==='read-file'?workflowDataPresetFor(view.operation):null);
 const usesDocument=$derived(view.operation==='read-file'||view.operation==='story-clock'||view.operation==='commit-outcomes');
 const contract=(control:DetailControl)=>JSON.stringify([control.inputSpec?.id,control.inputSpec?.version,control.editor,control.representation]);
 const textFor=(control:DetailControl)=>drafts[control.key]?.text ?? controlInputPresentation(control,drafts[control.key]?.format).text;
 const formatFor=(control:DetailControl)=>drafts[control.key]?.format??controlInputPresentation(control).format;
 $effect(()=>{if(view.key===capture)return;capture=view.key;generation++;controls=view.controls;advanced=false;drafts={};importStates={};recordModes={};phase=view.phase;pending=false;failure='';try{data=JSON.parse(controls);target=String(data.targetId??data.clockId??'');helper=view.helpers.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(data.helper))?.key??'';}catch{data={};target='';helper='';}const key=capture;void tick().then(()=>{if(view.key===key)dialog?.querySelector<HTMLElement>('select,textarea,input')?.focus({preventScroll:true});});});
 onMount(()=>{const anchor=document.activeElement as HTMLElement;return ()=>anchor?.focus({preventScroll:true});});
 function setControl(key:string,value:unknown){
  let source=controlsSnapshot();
  if(advanced){try{const parsed=JSON.parse(controls);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error();source=parsed;}catch{failure='Use a JSON object before selecting a configured value.';target=String(data.targetId??data.clockId??'');helper=view.helpers.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(data.helper))?.key??'';return;}}
  data={...source,[key]:value};failure='';const next=projectNodeControls(view.operation,data,{phase});recordModes=Object.fromEntries(Object.entries(recordModes).filter(([key,value])=>next.some(control=>control.key===key&&contract(control)===value.contract)));importStates=Object.fromEntries(Object.entries(importStates).filter(([key,value])=>next.some(control=>control.key===key&&contract(control)===value.contract)));drafts=Object.fromEntries(Object.entries(drafts).filter(([key,draft])=>next.some(control=>control.key===key&&contract(control)===draft.contract)));if(advanced)controls=JSON.stringify(controlsSnapshot(),null,2);
 }
 function bindingValue(role:string,field:'profileId'|'model'){const value=data.roleOverrides as Record<string,Record<string,string|null>>|undefined;return value?.[role]?.[field];}
 function bindingMode(role:string,field:'profileId'|'model'){const value=bindingValue(role,field);return value===undefined?'inherit':value===null?'block':'override';}
 function setBinding(role:string,field:'profileId'|'model',mode:string,value:string|null){
  if(pending||!actions)return false;
  let source:Record<string,unknown>=controlsSnapshot() as Record<string,unknown>;
  if(advanced){try{source=JSON.parse(controls);if(!source||typeof source!=='object'||Array.isArray(source))throw Error();}catch{failure='Use a JSON object before selecting a configured value.';return false;}}
  const choice=view.helpers.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(source.helper)),row=choice?.bindings?.roles.find(row=>row.role===role);
  if(!row||row[field==='profileId'?'profile':'model'].editable===false)return false;
  const roleControl=fields.find(control=>control.key==='roleOverrides'),spec=roleControl?.inputSpec;
  if(!spec||!roleControl)return false;
  const fieldDraft=advanced?undefined:drafts.roleOverrides;
  if(fieldDraft){
   const input=fieldDraft.value!==undefined?{format:'rows' as const,value:typedSnapshot(fieldDraft.value) as JsonValue}:{format:fieldDraft.format??'json' as ControlInputFormat,text:fieldDraft.text??textFor(roleControl)};
   const parsed=parseControlInput(spec,{...input,currentValue:(source.roleOverrides??{}) as JsonValue});
   if(!parsed.ok){drafts={...drafts,roleOverrides:{...fieldDraft,error:inputError(parsed.error)}};failure='Repair the Role overrides draft before using selectors.';return false;}
   source={...source,roleOverrides:parsed.data.value};
  }
  const checked=parseControlInput(spec,{format:'rows',value:(source.roleOverrides??{}) as JsonValue});
  const own=source.roleOverrides??{};
  if(!checked.ok && (advanced || !own || typeof own!=='object' || Array.isArray(own) || Object.values(own).some(binding=>!binding || typeof binding!=='object' || Array.isArray(binding)))){failure='Repair the Advanced JSON role bindings before using selectors.';return false;}
  const overrides={...(checked.ok?checked.data.value:own) as Record<string,Record<string,string|null>>},binding={...(overrides[role]??{})};
  if(mode==='inherit'){delete binding[field];if(field==='profileId'&&binding.model===null)delete binding.model;}
  else {binding[field]=mode==='block'?null:value;if(field==='profileId'&&!Object.hasOwn(binding,'model'))binding.model=null;}
  if(Object.keys(binding).length)overrides[role]=binding;else delete overrides[role];
  setControl('roleOverrides',overrides);
  const next={...drafts};delete next.roleOverrides;drafts=next;return true;
 }
 function draft(control:DetailControl,next:Partial<Draft>){drafts={...drafts,[control.key]:{...drafts[control.key],...next,contract:contract(control),error:''}};failure='';}
 function schemaDraft(control:DetailControl,state:SchemaDraftState){if(pending||!actions)return;if(JSON.stringify(drafts[control.key]?.schemaDraft)===JSON.stringify(state))return;draft(control,{schemaDraft:state,text:drafts[control.key]?.text??textFor(control)});}
 function structuredDraft(control:DetailControl,state:StructuredDraftState){if(pending||!actions)return;const current=drafts[control.key];if(!state.invalid && !current)return;if(JSON.stringify(current?.structuredDraft)===JSON.stringify(state))return;draft(control,{structuredDraft:state});}
 function candidate():Record<string,unknown>|null {
  const result:Record<string,unknown>={...controlsSnapshot()};
  for(const control of fields){const value=drafts[control.key];if(value?.structuredDraft?.invalid){drafts={...drafts,[control.key]:{...value,error:value.structuredDraft.feedback}};failure='Repair the unfinished draft before creating the node.';return null;}if(value?.schemaDraft?.invalid && (value.text??textFor(control))!==''){drafts={...drafts,[control.key]:{...value,error:value.schemaDraft.feedback}};failure='Repair the schema draft before creating the node.';return null;}if(!value){
   if(control.inputSpec?.editor!=='path')continue;
   const checked=parseControlInput(control.inputSpec,{format:'rows',value:control.value as JsonValue});
   if(!checked.ok){draft(control,{text:JSON.stringify(control.value),format:'json',error:checked.error.message});failure='Check the highlighted settings before creating the node.';return null;}
   continue;
  }
   const input=value.value!==undefined?{format:'rows' as const,value:typedSnapshot(value.value) as JsonValue}:{format:control.inputSpec?.editor==='path'?'json':value.format??(control.structured?'json':formatFor(control)) as ControlInputFormat,text:value.text??textFor(control)};
   const parsed=parseControlInput(control.inputSpec!,{...input,currentValue:control.value as JsonValue});
   if(!parsed.ok){drafts={...drafts,[control.key]:{...value,error:inputError(parsed.error)}};failure='Check the highlighted settings before creating the node.';return null;}
   result[control.key]=parsed.data.value;
  }return result;
 }
 function advancedSource():string {
  const result:Record<string,unknown>={...controlsSnapshot()},sources=new Map<string,string>();
  for(const control of fields){const value=drafts[control.key];if(!value)continue;
   if(value.structuredDraft?.invalid){result[control.key]=value.structuredDraft.invalidText;continue;}
   if(value.schemaDraft?.invalid && (value.text??textFor(control))!==''){result[control.key]=value.schemaDraft.invalidText;continue;}
   const input=value.value!==undefined?{format:'rows' as const,value:typedSnapshot(value.value) as JsonValue}:{format:control.inputSpec?.editor==='path'?'json':value.format??(control.structured?'json':formatFor(control)) as ControlInputFormat,text:value.text??textFor(control)};
   const parsed=parseControlInput(control.inputSpec!,{...input,currentValue:control.value as JsonValue});
   if(parsed.ok)result[control.key]=parsed.data.value;
   else if(value.value!==undefined)result[control.key]=typedSnapshot(value.value);
   else {result[control.key]=control.value;sources.set(control.key,control.inputSpec?.storage==='json-text'?JSON.stringify(value.text??textFor(control)):value.text??textFor(control));}
  }
  return '{'+Object.keys(result).map(key=>JSON.stringify(key)+':'+(sources.has(key)?sources.get(key):JSON.stringify(result[key]))).join(',')+'}';
 }
 function advancedCandidate(validateFields=true):Record<string,unknown>|null {
  try {
   const checked=cloneDefinitionData(JSON.parse(controls),{operation:view.operation});
   if(!checked.ok||!checked.data||Array.isArray(checked.data)||typeof checked.data!=='object')throw Error();
   const value=checked.data as Record<string,unknown>;
   if(validateFields)for(const control of projectNodeControls(view.operation,value,{phase}).filter(control=>['value','path','fields','schema','questions','schedules'].includes(control.inputSpec?.editor??''))){
    const input=control.inputSpec?.storage==='json-text'?{format:'json' as const,text:typeof control.value==='string'?control.value:undefined}:{format:'rows' as const,value:control.value as JsonValue};
    const parsed=parseControlInput(control.inputSpec!,input);
    if(!parsed.ok){failure=inputError(parsed.error);return null;}
   }
   return value;
  } catch {failure='Use a valid JSON object before returning to the form or creating the node.';return null;}
 }
 function switchMode(){
  if(advanced){
   const parsed=advancedCandidate(false);if(!parsed)return;
   const next=projectNodeControls(view.operation,parsed,{phase});
   drafts=Object.fromEntries(Object.entries(drafts).filter(([key,draft])=>{
    const control=next.find(control=>control.key===key&&contract(control)===draft.contract);if(!control)return false;
    if(JSON.stringify(parsed[key])===JSON.stringify(advancedBaseline[key]))return true;
    if(advancedInvalid&&draft.structuredDraft?.invalid&&parsed[key]===draft.structuredDraft.invalidText)return true;
    if(advancedInvalid&&draft.schemaDraft?.invalid&&parsed[key]===draft.schemaDraft.invalidText)return true;
    if(advancedInvalid&&draft.value!==undefined&&JSON.stringify(parsed[key])===JSON.stringify(draft.value))return true;
    if(advancedInvalid&&draft.text!==undefined)try{return JSON.stringify(parsed[key])===JSON.stringify(control.inputSpec?.storage==='json-text'?draft.text:JSON.parse(draft.text));}catch{}
    return false;
   }));
   importStates=Object.fromEntries(Object.entries(importStates).filter(([key,value])=>next.some(control=>control.key===key&&contract(control)===value.contract)));
   recordModes=Object.fromEntries(Object.entries(recordModes).filter(([key,value])=>next.some(control=>control.key===key&&contract(control)===value.contract)));
   data=parsed;advanced=false;failure='';advancedInvalid=false;
  }else{
   const next=candidate();advancedInvalid=!next;controls=next?JSON.stringify(next,null,2):advancedSource();
   advancedBaseline=next??controlsSnapshot();advanced=true;
  }
 }
 async function apply(event:SubmitEvent){event.preventDefault();if(!actions||pending)return;if(importOpen){failure='Confirm or cancel the open table import before creating the node.';return;}const next=advanced?advancedCandidate():candidate();if(!next)return;const text=advanced?controls:JSON.stringify(next),key=view.key,request=++generation;pending=true;failure='';try{const result:any=await actions.apply(key,text,phase);if(key===view.key&&request===generation&&!result?.ok)failure=(result?.error ? result.error.code + ': ' + result.error.message : undefined)??'The node could not be prepared.';}catch{if(key===view.key&&request===generation)failure='The node could not be prepared.';}finally{if(key===view.key&&request===generation)pending=false;}}
 function keys(event:KeyboardEvent){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();actions?.cancel(view.key);}if(event.key==='Tab'){const elements=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')],first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}
</script>
<div class="pc-workspace-overlay"><div class="pc-workspace-dialog pc-configure-node" role="dialog" aria-modal="true" aria-label="Configure node" tabindex="-1" bind:this={dialog} onkeydowncapture={keys} onpaste={event=>event.stopPropagation()}>
 <header><h2>Configure {view.title}</h2><button type="button" aria-label="Close node configuration" onclick={()=>actions?.cancel(view.key)}>×</button></header>
 <p>Complete the required settings before creating the node. Cancel leaves the graph unchanged.</p>
 <form onsubmit={apply}>
  <label>Stage<select aria-label="Node stage" bind:value={phase} disabled={view.phaseLocked||pending}><option value="pre">Preparation</option><option value="post">Response</option></select></label>
  {#if usesDocument}<label>Workflow data document<select aria-label="Workflow data document" bind:value={target} onchange={()=>setControl(view.operation==='story-clock'?'clockId':'targetId',target)} disabled={pending || !actions}><option value="">Choose an authorized target</option>{#if automaticTarget && !view.targets.some(doc=>doc.targetId===automaticTarget.targetId)}<option value={automaticTarget.targetId}>{automaticTarget.name} (automatic)</option>{/if}{#each view.targets.filter(doc=>!['story-clock','commit-outcomes'].includes(view.operation)||doc.format==='json') as doc (doc.targetId)}<option value={doc.targetId}>{doc.name} ({doc.targetId})</option>{/each}</select></label>{#if !view.targets.length && !automaticTarget}<p>Authorize a document in Workflow › Configure › Workflow Data, then reopen node creation.</p>{/if}{/if}
  {#if view.operation==='for-each'}<label>Pinned Data helper<select aria-label="Pinned Data helper" bind:value={helper} onchange={()=>{const choice=view.helpers.find(choice=>choice.key===helper);if(choice)setControl('helper',choice.ref);}} disabled={pending || !actions}><option value="">Choose an existing item/result helper</option>{#each view.helpers.filter(choice=>data.mode!=='projected-state'||choice.stateful) as choice (choice.key)}<option value={choice.key}>{choice.label}{choice.stateful?' (projected state)':''}</option>{/each}</select></label><p>Helpers use exact pinned versions with Data item and result ports. Set iteration mode and requestBoundPerIteration in the controls below.</p>{/if}
  {#if view.operation==='for-each' && selectedHelper?.bindings}
   <details open><summary>Helper model bindings</summary>{#each selectedHelper.bindings.roles as row (row.role)}<fieldset><legend>{row.label}</legend>
    <label>Connection profile<select aria-label={row.role+' connection profile'} value={bindingValue(row.role,'profileId')??''} disabled={pending||!actions||row.profile.editable===false} onchange={event=>{if(!setBinding(row.role,'profileId',event.currentTarget.value?'override':'inherit',event.currentTarget.value||null))event.currentTarget.value=bindingValue(row.role,'profileId')??'';}}><option value="">Use helper connection</option>{#each row.profile.options??[] as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
    <label>Model mode<select aria-label={row.role+' model mode'} value={bindingMode(row.role,'model')} disabled={pending||!actions||row.model.editable===false} onchange={event=>{if(!setBinding(row.role,'model',event.currentTarget.value,event.currentTarget.value==='override'?bindingValue(row.role,'model')??'':null))event.currentTarget.value=bindingMode(row.role,'model');}}>{#each row.model.allowedModes as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
    {#if bindingMode(row.role,'model')==='override'}<label>Model identifier<input aria-label={row.role+' model identifier'} value={bindingValue(row.role,'model')??''} disabled={pending||!actions||row.model.editable===false} oninput={event=>setBinding(row.role,'model','override',event.currentTarget.value)} /></label>{/if}
    <small>{row.effective}</small>{#if row.caveat}<small>{row.caveat}</small>{/if}
   </fieldset>{/each}{#if selectedHelper.bindings.issue}<p>{selectedHelper.bindings.issue}</p>{:else if !selectedHelper.bindings.roles.length}<p>This helper has no text model calls to configure.</p>{/if}</details>
  {/if}
  <button type="button" aria-label="Configuration format" disabled={pending} onclick={switchMode}>{advanced?'Use form':'Advanced JSON'}</button>
  {#if advanced}<label>Declared node controls<textarea aria-label="Node controls JSON" rows="14" maxlength="200000" bind:value={controls} disabled={pending || !actions}></textarea></label>
  {:else}
   {#each fields.filter(control=>!(usesDocument && ['targetId','clockId'].includes(control.key)) && !(view.operation==='for-each' && control.key==='helper')) as control (control.key)}
    <DetailControlEditor recordMode={recordModes[control.key]?.mode??'rows'} onRecordMode={mode=>{if(!pending&&actions)recordModes={...recordModes,[control.key]:{contract:contract(control),mode}};}} draftFormat={drafts[control.key]?.format} importState={importStates[control.key]?.state} onImportState={state=>importState(control,state)} importIdentity={view.key+contract(control)} {control} text={textFor(control)} format={formatFor(control)} error={drafts[control.key]?.error??''} disabled={pending || !actions} idPrefix={'pc-configure-'+control.key} saveButton={false} draftValue={drafts[control.key]?.value} structuredIdentity={view.key+contract(control)+JSON.stringify(control.value)} structuredDraft={drafts[control.key]?.structuredDraft} onStructuredDraft={state=>structuredDraft(control,state)} schemaIdentity={view.key+contract(control)} schemaDraft={drafts[control.key]?.schemaDraft} onSchemaDraft={state=>schemaDraft(control,state)} onDraft={value=>draft(control,{value,text:undefined})} ontext={text=>draft(control,{text,value:undefined})} onformat={format=>{if(drafts[control.key]?.value!==undefined){draft(control,{format});return;}const present=controlInputPresentation(control,format);draft(control,drafts[control.key]?.text===undefined?{format:present.format,text:present.text}:{format});}} onvalue={value=>setControl(control.key,value)} onnumber={input=>{if(input.validity.valid&&Number.isFinite(input.valueAsNumber))setControl(control.key,input.valueAsNumber);}} onsave={()=>{}} />
   {/each}
  {/if}
  {#if failure}<div><DiagnosticMessage issue={failure} /></div>{/if}
  <footer><button type="button" onclick={()=>actions?.cancel(view.key)}>Cancel</button><button type="submit" disabled={!actions||pending||importOpen}>{pending?'Preparing…':'Create node'}</button></footer>
 </form>
</div></div>
<style>
 .pc-configure-node {width:min(540px,calc(100% - 28px));max-height:calc(100% - 28px);overflow:auto;box-sizing:border-box;padding:16px;font-size:12px;} header,footer {display:flex;gap:8px;align-items:center;} h2 {flex:1;margin:0;font-size:16px;} p {line-height:1.5;color:var(--pc-muted,#aeb7ba);} label {display:block;margin:12px 0;} select,textarea,input {display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:6px;border:1px solid var(--pc-border,#ffffff30);background:var(--pc-canvas,#141516);color:inherit;font:inherit;} textarea {resize:vertical;font-family:monospace;} button {padding:5px 8px;background:var(--pc-block,#2a2c2e);color:inherit;border:1px solid var(--pc-border,#ffffff30);font:inherit;} footer {justify-content:flex-end;} :disabled {opacity:.5;} :is(select,textarea,input,button):focus-visible {outline:2px solid var(--pc-flow,#e18a24);outline-offset:1px;}
</style>
