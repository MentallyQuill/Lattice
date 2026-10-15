<script lang="ts">
 import {untrack,onMount} from 'svelte';
 import type {AddSystemView,AddSystemActions,SystemDraft} from './system-authoring-types';
 let {view,actions}:{view:AddSystemView;actions:AddSystemActions}=$props();
 let dialog:HTMLDivElement;
 onMount(()=>{const anchor=document.activeElement as HTMLElement;(dialog.querySelector<HTMLElement>('select')??dialog.querySelector<HTMLElement>('button'))?.focus({preventScroll:true});return()=>anchor?.focus({preventScroll:true});});
 let assisting=$derived(view.mode==='assist');
 let choiceKey=$state(untrack(()=>view.choices[0]?.key??''));
 let inputs=$state<Record<string,string>>({}),outputs=$state<Record<string,string>>({}),parameters=$state<Record<string,string>>({});
 let guidancePort=$state(''),merge=$state(''),error=$state(''),preview=$state<string[]|null>(null);
 let choice=$derived(view.choices.find(c=>c.key===choiceKey));
 function changed(){preview=null;error='';}
 function choose(value:string){choiceKey=value;inputs={};outputs={};parameters={};guidancePort='';merge='';changed();}
 function draft():SystemDraft{
  const inputBindings:Record<string,{nodeId:string;portId:string}>={};for(const [id,value]of Object.entries(inputs))if(value)inputBindings[id]=JSON.parse(value);
  const destinationBindings=Object.entries(outputs).filter(([,value])=>value).map(([outputPortId,value])=>({outputPortId,destination:JSON.parse(value)}));
  const parameterOverrides:Record<string,unknown>={};for(const [id,value]of Object.entries(parameters))if(value.trim())parameterOverrides[id]=JSON.parse(value);
  return {choiceKey,inputs:inputBindings,outputs:destinationBindings,parameterOverrides,...(guidancePort&&merge?{guidance:{outputPortId:guidancePort,destination:merge==='new'?{kind:'new-compose' as const}:{kind:'existing-compose' as const,nodeId:merge}}}:{})};
 }
 function prepare(){try{if(guidancePort&&!merge){error='Choose a Guidance merge destination.';preview=null;return;}const result=actions.preview(view.key,draft());if(!result.ok){error=result.error.message;preview=null;return;}error='';preview=[...result.data.connections,...result.data.changes.filter(c=>c.kind==='template').map(c=>c.kind==='template'?'Template: '+c.before+' → '+c.after:'')];}catch{error='Enter exposed settings as JSON values.';preview=null;}}
 function keys(event:KeyboardEvent){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();actions.close();}if(event.key==='Tab'){const controls=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}
</script>
<div class="pc-system-overlay"><div class="pc-system-dialog" role="dialog" aria-modal="true" aria-label={assisting?'Configure system connections':'Add system'} tabindex="-1" bind:this={dialog} onkeydowncapture={keys} onpaste={event=>event.stopPropagation()}>
 <header><h2>{assisting?'Configure system connections':'Add system'}</h2><button type="button" aria-label={assisting?'Close system configuration':'Close Add system'} onclick={()=>actions.close()}>×</button></header>
 <p>{assisting?'Configure this placed system. Preview explicit connections and settings before applying them.':'Choose a saved revision to place an editable system in Main. Configure its settings and connections afterward from its context menu.'}</p>
 {#if !view.choices.length}<p>No saved reusable subgraphs are available. Save a subgraph to the shelf first.</p>{:else}
 {#if assisting}<p>{choice?.name} · revision {choice?.definition.version}</p>{:else}<label>Saved system<select aria-label="Saved system" value={choiceKey} onchange={event=>choose(event.currentTarget.value)}>{#each view.choices as c}<option value={c.key}>{c.name} · revision {c.definition.version}{view.choices.filter(other=>other.name===c.name&&other.definition.version===c.definition.version).length>1 ? ' · '+c.definition.id : ''}</option>{/each}</select></label>{/if}
 {#if assisting&&choice}
 {#each choice.inputs as port}<label>{port.label} · {port.kind}{port.required?' · required':''}<select aria-label={'System input '+port.label} value={inputs[port.id]??''} onchange={event=>{inputs={...inputs,[port.id]:event.currentTarget.value};changed();}}><option value="">{port.required?'Choose source':'Unused'}</option>{#each view.pins.filter(p=>p.direction==='output'&&p.kind===port.kind) as pin}<option value={JSON.stringify({nodeId:pin.nodeId,portId:pin.portId})}>{pin.label}</option>{/each}</select></label>{/each}
 {#each choice.parameters as parameter}<label>{parameter.label} · JSON override<input aria-label={'System setting '+parameter.label} placeholder="Use saved value" value={parameters[parameter.id]??''} oninput={event=>{parameters={...parameters,[parameter.id]:event.currentTarget.value};changed();}} /></label>{/each}
 {#if choice.outputs.some(p=>p.kind==='guidance')}<fieldset><legend>Optional reply guidance</legend><label>Guidance output<select aria-label="System Guidance output" value={guidancePort} onchange={event=>{guidancePort=event.currentTarget.value;changed();}}><option value="">Unused</option>{#each choice.outputs.filter(p=>p.kind==='guidance') as port}<option value={port.id}>{port.label}</option>{/each}</select></label>
 {#if guidancePort}<label>Main merge destination<select aria-label="Guidance merge destination" value={merge} onchange={event=>{merge=event.currentTarget.value;changed();}}><option value="">Choose merge</option>{#if view.canCreate}<option value="new">Create Compose Guidance → Generate Reply</option>{/if}{#each view.destinations as destination}<option value={destination.nodeId}>{destination.label} → Generate Reply</option>{/each}</select></label>{#if !view.canCreate&&!view.destinations.length}<p>Generate Reply Guidance is occupied. Connect a Main Compose Guidance merge explicitly first.</p>{/if}{/if}</fieldset>{/if}
 {#each choice.outputs.filter(port=>port.id!==guidancePort || !!outputs[port.id]) as port}<label>{port.label} · explicit {port.kind} destination<select aria-label={'System output '+port.label} value={outputs[port.id]??''} onchange={event=>{outputs={...outputs,[port.id]:event.currentTarget.value};changed();}}><option value="">Unused</option>{#each view.pins.filter(p=>p.direction==='input'&&p.kind===port.kind&&!p.occupied) as pin}<option value={JSON.stringify({nodeId:pin.nodeId,portId:pin.portId})}>{pin.label}</option>{/each}</select></label>{/each}
 {#if !choice.outputs.length}<p>This system participates through its staged state terminals.</p>{/if}
 {/if}
 {#if assisting}<button type="button" onclick={prepare}>Preview connections</button>
 {#if preview}<div class="pc-system-preview"><h3>Connection preview</h3>{#if preview.length}<ul>{#each preview as line}<li>{line}</li>{/each}</ul>{:else}<p>No new connections.</p>{/if}<p>Applies to the placed {choice?.name} system. Undo restores its previous settings and connections.</p></div>{/if}{/if}
 {/if}
 {#if error||view.error}<p role="alert">{error||view.error}</p>{/if}
 <footer><button type="button" onclick={()=>actions.close()}>Cancel</button><button type="button" disabled={assisting?!preview:!choice} onclick={()=>actions.submit(view.key,assisting?undefined:choiceKey)}>{assisting?'Apply configuration':'Add system'}</button></footer>
</div></div>
<style>
 .pc-system-overlay{position:absolute;inset:0;z-index:80;display:grid;place-items:center;background:rgba(0,0,0,.45)}
 .pc-system-dialog{box-sizing:border-box;width:620px;max-width:calc(100% - 24px);max-height:calc(100% - 24px);overflow:auto;padding:16px;background:var(--pc-panel-solid);color:var(--pc-text);border:1px solid var(--pc-border);border-radius:4px;font-size:13px;line-height:1.5}
 header,footer{display:flex;align-items:center;justify-content:space-between;gap:12px}h2{font-size:18px;margin:0}h3{font-size:14px}label{display:block;margin:10px 0}select,input{display:block;box-sizing:border-box;width:100%;min-height:32px;background:var(--pc-field);color:var(--pc-text);border:1px solid var(--pc-border);padding:5px}button{min-height:32px;background:var(--pc-control);color:var(--pc-text);border:1px solid var(--pc-border);padding:5px 10px;cursor:pointer}button:disabled{opacity:.5;cursor:default}fieldset{border:1px solid var(--pc-border);margin:12px 0}.pc-system-preview{border-top:1px solid var(--pc-border);margin-top:12px;overflow-wrap:anywhere}footer{justify-content:flex-end;margin-top:16px}[role='alert']{color:var(--pc-error,#ed9b9b)}
</style>
