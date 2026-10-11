<script lang="ts">
 import DiagnosticMessage from './DiagnosticMessage.svelte';
 import DetailControlEditor from './DetailControl.svelte';
 import {projectNodeControls,controlInputPresentation} from '../src/ui/node-control-projection.js';
 import {parseControlInput} from '../src/ui/control-input-contracts.js';
 import {onMount,tick} from 'svelte';
 import type {ConfigureNodeView,ConfigureNodeActions} from './storage-setup-types';
 import type {DetailControl} from './detail-types';
 import type {ControlInputFormat} from '../src/ui/control-input-contracts';
 import type {JsonValue} from '../src/workflow/operations/json-data';
 let {view,actions}:{view:ConfigureNodeView;actions?:ConfigureNodeActions}=$props();
 type Draft={text?:string;value?:unknown;format?:ControlInputFormat;contract:string;error?:string};
 let dialog:HTMLDivElement,data=$state<Record<string,unknown>>({}),drafts=$state<Record<string,Draft>>({}),controls=$state(''),advanced=$state(false),phase=$state<'pre'|'post'>('pre'),target=$state(''),helper=$state(''),pending=$state(false),failure=$state('');let capture='',generation=0,advancedBaseline:Record<string,unknown>={};
 const selectedHelper=$derived(view.helpers.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(data.helper)));
 const fields=$derived(projectNodeControls(view.operation,data,{phase}));
 const usesDocument=$derived(view.operation==='read-file'||view.operation==='story-clock'||view.operation==='commit-outcomes');
 const contract=(control:DetailControl)=>JSON.stringify([control.inputSpec?.id,control.inputSpec?.version,control.editor,control.representation]);
 const textFor=(control:DetailControl)=>drafts[control.key]?.text ?? controlInputPresentation(control,drafts[control.key]?.format).text;
 const formatFor=(control:DetailControl)=>drafts[control.key]?.format??controlInputPresentation(control).format;
 $effect(()=>{if(view.key===capture)return;capture=view.key;generation++;controls=view.controls;advanced=false;drafts={};phase=view.phase;pending=false;failure='';try{data=JSON.parse(controls);target=String(data.targetId??data.clockId??'');helper=view.helpers.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(data.helper))?.key??'';}catch{data={};target='';helper='';}const key=capture;void tick().then(()=>{if(view.key===key)dialog?.querySelector<HTMLElement>('select,textarea,input')?.focus({preventScroll:true});});});
 onMount(()=>{const anchor=document.activeElement as HTMLElement;return ()=>anchor?.focus({preventScroll:true});});
 function setControl(key:string,value:unknown){
  let source=$state.snapshot(data);
  if(advanced){try{const parsed=JSON.parse(controls);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error();source=parsed;}catch{failure='Use a JSON object before selecting a configured value.';target=String(data.targetId??data.clockId??'');helper=view.helpers.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(data.helper))?.key??'';return;}}
  data={...source,[key]:value};failure='';const next=projectNodeControls(view.operation,data,{phase});drafts=Object.fromEntries(Object.entries(drafts).filter(([key,draft])=>next.some(control=>control.key===key&&contract(control)===draft.contract)));if(advanced)controls=JSON.stringify($state.snapshot(data),null,2);
 }
 function bindingValue(role:string,field:'profileId'|'model'){const value=data.roleOverrides as Record<string,Record<string,string|null>>|undefined;return value?.[role]?.[field];}
 function bindingMode(role:string,field:'profileId'|'model'){const value=bindingValue(role,field);return value===undefined?'inherit':value===null?'block':'override';}
 function setBinding(role:string,field:'profileId'|'model',mode:string,value:string|null){
  if(pending||!actions)return;
  let source=$state.snapshot(data);
  if(advanced){try{source=JSON.parse(controls);if(!source||typeof source!=='object'||Array.isArray(source))throw Error();}catch{failure='Use a JSON object before selecting a configured value.';return;}}
  const choice=view.helpers.find(choice=>JSON.stringify(choice.ref)===JSON.stringify(source.helper)),row=choice?.bindings?.roles.find(row=>row.role===role);
  if(!row||row[field==='profileId'?'profile':'model'].editable===false)return;
  const spec=fields.find(control=>control.key==='roleOverrides')?.inputSpec;
  if(!spec)return;
  const checked=parseControlInput(spec,{format:'rows',value:(source.roleOverrides??{}) as JsonValue});
  const own=source.roleOverrides??{};
  if(!checked.ok && (advanced || !own || typeof own!=='object' || Array.isArray(own) || Object.values(own).some(binding=>!binding || typeof binding!=='object' || Array.isArray(binding)))){failure='Repair the Advanced JSON role bindings before using selectors.';return;}
  const overrides={...(checked.ok?checked.data.value:own) as Record<string,Record<string,string|null>>},binding={...(overrides[role]??{})};
  if(mode==='inherit'){delete binding[field];if(field==='profileId'&&binding.model===null)delete binding.model;}
  else {binding[field]=mode==='block'?null:value;if(field==='profileId'&&!Object.hasOwn(binding,'model'))binding.model=null;}
  if(Object.keys(binding).length)overrides[role]=binding;else delete overrides[role];
  setControl('roleOverrides',overrides);
 }
 function draft(control:DetailControl,next:Partial<Draft>){drafts={...drafts,[control.key]:{...drafts[control.key],...next,contract:contract(control),error:''}};failure='';}
 function candidate():Record<string,unknown>|null {
  const result:Record<string,unknown>={...$state.snapshot(data)};
  for(const control of fields){const value=drafts[control.key];if(!value)continue;
   const input=value.value!==undefined?{format:'rows' as const,value:$state.snapshot(value.value) as JsonValue}:{format:value.format??(control.structured?'json':formatFor(control)) as ControlInputFormat,text:value.text??textFor(control)};
   const parsed=parseControlInput(control.inputSpec!,{...input,currentValue:control.value as JsonValue});
   if(!parsed.ok){drafts={...drafts,[control.key]:{...value,error:parsed.error.message}};failure='Check the highlighted settings before creating the node.';return null;}
   result[control.key]=parsed.data.value;
  }return result;
 }
 function switchMode(){if(advanced){try{const parsed=JSON.parse(controls);if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error();const next=projectNodeControls(view.operation,parsed,{phase});drafts=Object.fromEntries(Object.entries(drafts).filter(([key,draft])=>JSON.stringify(parsed[key])===JSON.stringify(advancedBaseline[key])&&next.some(control=>control.key===key&&contract(control)===draft.contract)));data=parsed;advanced=false;failure='';}catch{failure='Use a valid JSON object before returning to the form.';}}else{const next=candidate();if(next)controls=JSON.stringify(next,null,2);advancedBaseline=JSON.parse(controls);advanced=true;}}
 async function apply(event:SubmitEvent){event.preventDefault();if(!actions||pending)return;const next=advanced?null:candidate();if(!advanced&&!next)return;const text=advanced?controls:JSON.stringify(next),key=view.key,request=++generation;pending=true;failure='';try{const result:any=await actions.apply(key,text,phase);if(key===view.key&&request===generation&&!result?.ok)failure=(result?.error ? result.error.code + ': ' + result.error.message : undefined)??'The node could not be prepared.';}catch{if(key===view.key&&request===generation)failure='The node could not be prepared.';}finally{if(key===view.key&&request===generation)pending=false;}}
 function keys(event:KeyboardEvent){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();actions?.cancel(view.key);}if(event.key==='Tab'){const elements=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')],first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}
</script>
<div class="pc-workspace-overlay"><div class="pc-workspace-dialog pc-configure-node" role="dialog" aria-modal="true" aria-label="Configure node" tabindex="-1" bind:this={dialog} onkeydowncapture={keys} onpaste={event=>event.stopPropagation()}>
 <header><h2>Configure {view.title}</h2><button type="button" aria-label="Close node configuration" onclick={()=>actions?.cancel(view.key)}>×</button></header>
 <p>Complete the required settings before creating the node. Cancel leaves the graph unchanged.</p>
 <form onsubmit={apply}>
  <label>Stage<select aria-label="Node stage" bind:value={phase} disabled={view.phaseLocked||pending}><option value="pre">Preparation</option><option value="post">Response</option></select></label>
  {#if usesDocument}<label>Workflow data document<select aria-label="Workflow data document" bind:value={target} onchange={()=>setControl(view.operation==='story-clock'?'clockId':'targetId',target)} disabled={pending || !actions}><option value="">Choose an authorized target</option>{#each view.targets.filter(doc=>!['story-clock','commit-outcomes'].includes(view.operation)||doc.format==='json') as doc (doc.targetId)}<option value={doc.targetId}>{doc.name} ({doc.targetId})</option>{/each}</select></label>{#if !view.targets.length}<p>Authorize a document in Workflow › Configure › Workflow Data, then reopen node creation.</p>{/if}{/if}
  {#if view.operation==='for-each'}<label>Pinned Data helper<select aria-label="Pinned Data helper" bind:value={helper} onchange={()=>{const choice=view.helpers.find(choice=>choice.key===helper);if(choice)setControl('helper',choice.ref);}} disabled={pending || !actions}><option value="">Choose an existing item/result helper</option>{#each view.helpers.filter(choice=>data.mode!=='projected-state'||choice.stateful) as choice (choice.key)}<option value={choice.key}>{choice.label}{choice.stateful?' (projected state)':''}</option>{/each}</select></label><p>Helpers use exact pinned versions with Data item and result ports. Set iteration mode and requestBoundPerIteration in the controls below.</p>{/if}
  {#if view.operation==='for-each' && selectedHelper?.bindings}
   <details open><summary>Helper model bindings</summary>{#each selectedHelper.bindings.roles as row (row.role)}<fieldset><legend>{row.label}</legend>
    <label>Connection profile<select aria-label={row.role+' connection profile'} value={bindingValue(row.role,'profileId')??''} disabled={pending||!actions||row.profile.editable===false} onchange={event=>setBinding(row.role,'profileId',event.currentTarget.value?'override':'inherit',event.currentTarget.value||null)}><option value="">Use helper connection</option>{#each row.profile.options??[] as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
    <label>Model mode<select aria-label={row.role+' model mode'} value={bindingMode(row.role,'model')} disabled={pending||!actions||row.model.editable===false} onchange={event=>setBinding(row.role,'model',event.currentTarget.value,event.currentTarget.value==='override'?bindingValue(row.role,'model')??'':null)}>{#each row.model.allowedModes as option}<option value={option.value}>{option.label}</option>{/each}</select></label>
    {#if bindingMode(row.role,'model')==='override'}<label>Model identifier<input aria-label={row.role+' model identifier'} value={bindingValue(row.role,'model')??''} disabled={pending||!actions||row.model.editable===false} oninput={event=>setBinding(row.role,'model','override',event.currentTarget.value)} /></label>{/if}
    <small>{row.effective}</small>{#if row.caveat}<small>{row.caveat}</small>{/if}
   </fieldset>{/each}{#if selectedHelper.bindings.issue}<p>{selectedHelper.bindings.issue}</p>{:else if !selectedHelper.bindings.roles.length}<p>This helper has no text model calls to configure.</p>{/if}</details>
  {/if}
  <button type="button" aria-label="Configuration format" disabled={pending} onclick={switchMode}>{advanced?'Use form':'Advanced JSON'}</button>
  {#if advanced}<label>Declared node controls<textarea aria-label="Node controls JSON" rows="14" maxlength="200000" bind:value={controls} disabled={pending || !actions}></textarea></label>
  {:else}
   {#each fields.filter(control=>!(usesDocument && ['targetId','clockId'].includes(control.key)) && !(view.operation==='for-each' && control.key==='helper')) as control (control.key)}
    <DetailControlEditor {control} text={textFor(control)} format={formatFor(control)} error={drafts[control.key]?.error??''} disabled={pending || !actions} idPrefix={'pc-configure-'+control.key} saveButton={false} draftValue={drafts[control.key]?.value} onDraft={value=>draft(control,{value,text:undefined})} ontext={text=>draft(control,{text,value:undefined})} onformat={format=>{const present=controlInputPresentation(control,format);draft(control,drafts[control.key]?.text===undefined?{format:present.format,text:present.text}:{format});}} onvalue={value=>setControl(control.key,value)} onnumber={input=>{if(input.validity.valid&&Number.isFinite(input.valueAsNumber))setControl(control.key,input.valueAsNumber);}} onsave={()=>{}} />
   {/each}
  {/if}
  {#if failure}<div><DiagnosticMessage issue={failure} /></div>{/if}
  <footer><button type="button" onclick={()=>actions?.cancel(view.key)}>Cancel</button><button type="submit" disabled={!actions||pending}>{pending?'Preparing…':'Create node'}</button></footer>
 </form>
</div></div>
<style>
 .pc-configure-node {width:min(540px,calc(100% - 28px));max-height:calc(100% - 28px);overflow:auto;box-sizing:border-box;padding:16px;font-size:12px;} header,footer {display:flex;gap:8px;align-items:center;} h2 {flex:1;margin:0;font-size:16px;} p {line-height:1.5;color:var(--pc-muted,#aeb7ba);} label {display:block;margin:12px 0;} select,textarea,input {display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:6px;border:1px solid var(--pc-border,#ffffff30);background:var(--pc-canvas,#141516);color:inherit;font:inherit;} textarea {resize:vertical;font-family:monospace;} button {padding:5px 8px;background:var(--pc-block,#2a2c2e);color:inherit;border:1px solid var(--pc-border,#ffffff30);font:inherit;} footer {justify-content:flex-end;} :disabled {opacity:.5;} :is(select,textarea,input,button):focus-visible {outline:2px solid var(--pc-flow,#e18a24);outline-offset:1px;}
</style>
