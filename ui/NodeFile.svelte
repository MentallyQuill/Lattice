<script lang="ts">
 import {onDestroy,untrack} from 'svelte';
 import {canonicalFileName} from '../src/workflow/managed-file-policy.js';
 import type {DetailEditResponse,DetailSelection} from './detail-types';
 import type {NodeFileActions,NodeFileSettings,NodeFileView} from './node-file-types';
 let {model,selection,actions,disabled=false,idPrefix='pc-node-details'}:{model:NodeFileView;selection:DetailSelection;actions:NodeFileActions;disabled?:boolean;idPrefix?:string}=$props();
 let name=$state(''),path=$state(''),format=$state<NodeFileSettings['format']>('text'),missing=$state<NodeFileSettings['missing']>('create');
 let visibility=$state<NodeFileSettings['visibility']['kind']>('public'),actorId=$state('');
 let staleDraft=$state(false),dirty=$state(false),pending=$state(''),failure=$state(''),notice=$state(''),advanced=$state(false);
 let identity='',baseline='',epoch=0,editVersion=0,alive=true;
 let expectedSave:{source:string;ticket:number;configuration:string}|null=null;
 type Draft={name:string;path:string;format:NodeFileSettings['format'];missing:NodeFileSettings['missing'];visibility:NodeFileSettings['visibility']['kind'];actorId:string;dirty:boolean;base:string;stale:boolean};
 const drafts=new Map<string,Draft>();
 const formats=[{value:'text',label:'Text document'},{value:'json',label:'Structured data'},{value:'jsonl',label:'JSON Lines'},{value:'csv',label:'Spreadsheet'},{value:'markdown',label:'Markdown document'}] as const;
 const key=()=>JSON.stringify([selection.documentNamespace,selection.selectionKey,selection.address,model.operation]);
 const configurationKey=(value:NodeFileSettings)=>JSON.stringify([model.managed===true,value.bindingId,value.name&&model.managed?canonicalFileName(value.name,value.format):value.name,value.path??'',value.format,value.missing,value.content,value.visibility.kind,value.visibility.kind==='actor-private'?value.visibility.actorId:'']);
 const snapshot=():Draft=>({name,path,format,missing,visibility,actorId,dirty,base:baseline,stale:staleDraft});
 const canEdit=$derived(!disabled&&model.available&&model.mode!=='inherited');
 const canAct=$derived(!disabled&&model.available&&!pending);
 const saving=$derived(model.saving??model.operation!=='read-file');
 const specialized=$derived(['story-clock','commit-outcomes','random-pick','commit-clock'].includes(model.operation));
 const valid=$derived(!!name.trim()&&(visibility!=='actor-private'||!!actorId.trim()));
 const changedResource=$derived(format!==model.settings.format||!!model.settings.bindingId&&!model.managed&&(name.trim()!==(model.friendlyName??model.settings.name)||path.trim()!==(model.settings.path??'')));
 const settings=():NodeFileSettings=>({...(model.managed?{managed:true}:{}),bindingId:model.settings.bindingId,name:model.managed?name.trim():name.trim()===(model.friendlyName??model.settings.name)?model.settings.name:name.trim(),...(model.storage==='server'?{path:path.trim()}:{}),format:specialized?'json':format,missing,content:model.settings.content,visibility:visibility==='actor-private'?{kind:visibility,actorId:actorId.trim()}:{kind:visibility}});
 $effect.pre(()=>{
  const next=key(),incoming=configurationKey(model.settings);
  if(next===identity&&incoming===baseline)return;
  untrack(()=>{
   if(next!==identity){epoch++;expectedSave=null;pending='';failure='';notice='';advanced=false;identity=next;staleDraft=false;dirty=false;baseline='';const draft=drafts.get(next);if(draft){staleDraft=draft.stale||draft.base!==incoming;({name,path,format,missing,visibility,actorId,dirty}=draft);baseline=incoming;return;}}
   if(dirty&&baseline&&incoming!==baseline){
    // Only the exact submitted settings can be this save's acknowledgement.
    // A different name, grant, template or privacy update pauses retained work.
    const ownAcknowledgement=expectedSave?.source===next&&expectedSave.ticket===epoch&&expectedSave.configuration===incoming;
    if(!ownAcknowledgement)staleDraft=true;
   }
   if(expectedSave?.source===next&&expectedSave.ticket===epoch)expectedSave=null;
   if(!dirty||baseline===''){name=model.friendlyName??model.settings.name;path=model.settings.path??'';format=model.settings.format;missing=model.settings.missing;visibility=model.settings.visibility.kind;actorId=model.settings.visibility.kind==='actor-private'?model.settings.visibility.actorId:'';dirty=false;}
   baseline=incoming;
   if(dirty)drafts.set(identity,snapshot());
  });
 });
 onDestroy(()=>{alive=false;epoch++;});
 function edit(field:'name'|'path'|'format'|'missing'|'visibility'|'actor',value:string){
  if(!canEdit)return;
  if(field==='name')name=value;
  else if(field==='path')path=value;
  else if(field==='format'){if(!formats.some(option=>option.value===value)||specialized)return;format=value as NodeFileSettings['format'];}
  else if(field==='missing'){if(!['create','error'].includes(value))return;missing=value as NodeFileSettings['missing'];}
  else if(field==='visibility'){if(!['public','hidden','actor-private'].includes(value))return;visibility=value as NodeFileSettings['visibility']['kind'];}
  else {if(!(model.actors??[]).some(actor=>actor.id===value))return;actorId=value;}
  dirty=true;editVersion++;failure='';notice='';drafts.set(identity,snapshot());
 }
 async function perform(kind:string,action:(captured:DetailSelection)=>DetailEditResponse,submitted?:NodeFileSettings){
  if(!canAct)return;
  const captured=structuredClone(selection),source=key(),ticket=epoch,version=editVersion;
  const submittedRequest=kind==='save'&&submitted?{source,ticket,configuration:configurationKey(submitted)}:null;
  if(submittedRequest)expectedSave=submittedRequest;
  pending=kind;failure='';notice='';
  const current=()=>alive&&ticket===epoch&&source===key()&&!disabled&&model.available;
  try{const result=await action(captured);if(!current())return;if(!result.ok){if(expectedSave===submittedRequest)expectedSave=null;failure=result.error.message;return;}if(kind==='save'&&version===editVersion&&!staleDraft){dirty=false;drafts.delete(source);notice='Settings saved';}}
  catch(error){if(expectedSave===submittedRequest)expectedSave=null;if(current())failure=error instanceof Error?error.message:'The file settings could not be updated.';}
  finally{if(alive&&ticket===epoch&&source===key())pending='';}
 }
 $effect(()=>{
  // Capture each draft field so editing restarts the debounce without replacing focused inputs.
  const draft=JSON.stringify([name,path,format,missing,visibility,actorId]),source=key();
  if(!draft||!dirty||staleDraft||!valid||!canEdit||pending||changedResource||!actions.saveNodeFile||failure)return;
  const timer=setTimeout(()=>{if(source===key()){const submitted=settings();void perform('save',captured=>actions.saveNodeFile!(captured,submitted),submitted);}},280);
  return()=>clearTimeout(timer);
 });
 function choose(mode:'open'|'save'){if(!canAct||!canEdit||!model.supported||!actions.chooseNodeFile)return;void perform('choose',captured=>actions.chooseNodeFile!(captured,{mode,settings:settings()}));}
 function handling(value:string){if(!canAct||!saving||!actions.editControls||!['replace','append'].includes(value))return;void perform('handling',captured=>actions.editControls!(captured,{fileHandling:value}));}
 function destination(value:string){if(!canAct||!actions.editControls||value===model.destinationMode||!['connected','own'].includes(value))return;void perform('destination',captured=>actions.editControls!(captured,{destinationMode:value,...(value==='own'&&!model.ownFileConfigured?{fileTarget:{managed:true}}:{})}));}
 function mutation(value:string){if(!canAct||!actions.editControls||!['replace','append','add','add-unique','upsert','update-fields'].includes(value))return;void perform('mutation',captured=>actions.editControls!(captured,{mode:value,fileHandling:''}));}
 function accessCharacter(value:string){if(!canAct||!actions.editControls)return;if(value==='selected')void perform('character',captured=>actions.editControls!(captured,{actorScope:'selected',actorId:''}));else if((model.actors??[]).some(actor=>actor.id===value))void perform('character',captured=>actions.editControls!(captured,{actorScope:'presence',actorId:value}));}
 function initializationControl(field:'initialization'|'initializationInstructions'|'initializationMaxTokens',value:string){
  if(!canAct||model.operation!=='read-file'||!actions.editControls)return;
  if(field==='initialization'&&!['generate','template','require-file'].includes(value)||field==='initializationInstructions'&&value.length>10000)return;
  const next=field==='initializationMaxTokens'?Number(value):value;
  if(field==='initializationMaxTokens'&&(!Number.isInteger(next)||Number(next)<1||Number(next)>65536))return;
  void perform('initialization',captured=>actions.editControls!(captured,{[field]:next,...(field==='initialization'&&value==='require-file'&&model.managed&&!model.settings.bindingId&&!model.settings.path?{fileTarget:{missing:'error'}}:{})}));
 }
 function resetDraft(){drafts.delete(identity);expectedSave=null;name=model.friendlyName??model.settings.name;path=model.settings.path??'';format=model.settings.format;missing=model.settings.missing;visibility=model.settings.visibility.kind;actorId=model.settings.visibility.kind==='actor-private'?model.settings.visibility.actorId:'';dirty=false;staleDraft=false;baseline=configurationKey(model.settings);}
</script>

<section class="pc-node-file" data-node-file aria-labelledby={idPrefix+'-fileTarget-heading'}>
 <h3 id={idPrefix+'-fileTarget-heading'}>File</h3>
 <p class="pc-nf-status" data-file-status>{model.status??(model.issue?'Needs attention':'Ready')}</p>
 {#if model.mode==='inherited'}
  <p class="pc-nf-help">{model.summary??'Uses the connected file and its access settings.'}</p>
 {:else}
  <label class="pc-nf-field">Name<input id={idPrefix+'-fileTarget-name'} aria-label="File name" value={name} maxlength="256" disabled={!canEdit} placeholder="Scene Context" oninput={event=>edit('name',event.currentTarget.value)} /></label>
 {/if}
 <div class="pc-nf-field"><span>Type</span><output aria-label="File type">{model.typeLabel??formats.find(option=>option.value===model.settings.format)?.label??'Document'} · Automatic</output></div>
 {#if model.operation==='read-file'}
  <label class="pc-nf-field">When no file is set<select aria-label="When no file is set" value={model.initialization??'generate'} disabled={!canAct||!actions.editControls} onchange={event=>initializationControl('initialization',event.currentTarget.value)}><option value="generate">Generate from story</option><option value="template">Valid starting template</option><option value="require-file">Require a file</option></select></label>
  <p class="pc-nf-help">Existing files and saved chat data are reused. This choice applies only when no file is set.</p>
  {#if (model.initialization??'generate')==='generate'}
   <label class="pc-nf-field">Initialization instructions<textarea aria-label="Initialization instructions" value={model.initializationInstructions??''} maxlength="10000" rows="3" disabled={!canAct||!actions.editControls} onchange={event=>initializationControl('initializationInstructions',event.currentTarget.value)}></textarea></label>
   <label class="pc-nf-field">Completion limit<input aria-label="Initialization completion limit" type="number" min="1" max="65536" step="1" value={model.initializationMaxTokens??2048} disabled={!canAct||!actions.editControls} onchange={event=>initializationControl('initializationMaxTokens',event.currentTarget.value)} /></label>
   <p class="pc-nf-help">If no saved data exists, makes one request using this node’s model and the current conversation and character. Saved only when you accept the reviewed result.</p>
  {/if}
 {/if}
 {#if saving}<label class="pc-nf-field">File handling<select aria-label="File handling" value={model.fileHandling??'replace'} disabled={!canAct||!actions.editControls} onchange={event=>handling(event.currentTarget.value)}><option value="replace">Replace</option><option value="append">Append</option></select></label>{/if}
 {#if model.advancedMutation}<p class="pc-nf-help">Custom mutation: {model.advancedMutation}. Choose Replace or Append to change it.</p>{/if}
 {#if model.managed}<p class="pc-nf-help">Automatic — managed by Lattice. Saved in SillyTavern when you apply the reviewed result.</p>{/if}
 <div class="pc-nf-actions">
  {#if model.mode==='source'&&!model.managed&&!model.settings.bindingId&&!model.legacy}<button type="button" id={idPrefix+'-fileTarget-choose'} data-choose-node-file="open" disabled={!canAct||!model.supported||!actions.chooseNodeFile} onclick={()=>choose('open')}>Choose file…</button>
  {:else if model.mode!=='inherited'}
   {#if actions.openNodeFile}<button type="button" disabled={!canAct} onclick={()=>perform('open',captured=>actions.openNodeFile!(captured))}>Open</button>{/if}
   <button type="button" data-choose-node-file="open" disabled={!canAct||!model.supported||!actions.chooseNodeFile} onclick={()=>choose('open')}>Change…</button>
  {/if}
  {#if actions.downloadNodeFile}<button type="button" disabled={!canAct} onclick={()=>perform('download',captured=>actions.downloadNodeFile!(captured))}>Download</button>{/if}
  {#if model.operation==='read-file'&&actions.importNodeFile}<button type="button" disabled={!canAct} onclick={()=>perform('import',captured=>actions.importNodeFile!(captured))}>Import from device…</button>{/if}
 </div>
 {#if model.operation==='read-file'&&actions.importNodeFile}<p class="pc-nf-help">Imports a copy; changes to the original won’t update it.</p>{/if}
 {#if changedResource}<p class="pc-nf-help">The original file stays unchanged. Create a new copy to use this name, type or path.</p><button type="button" disabled={!canAct||!valid||!actions.createNodeFileCopy} onclick={()=>perform('copy',captured=>actions.createNodeFileCopy!(captured,settings()))}>Create new copy…</button>{/if}
 <details bind:open={advanced} data-file-advanced>
  <summary>Advanced</summary>
  {#if model.operation==='write-file'}<label class="pc-nf-field">Destination<select aria-label="File destination" value={model.destinationMode} disabled={!canAct||!actions.editControls} onchange={event=>destination(event.currentTarget.value)}><option value="own">Automatic file</option><option value="connected">Connected document</option></select></label>{/if}
  {#if model.operation==='write-file'}<label class="pc-nf-field">Mutation<select aria-label="Advanced file mutation" value={model.mutation??'replace'} disabled={!canAct||!actions.editControls} onchange={event=>mutation(event.currentTarget.value)}><option value="replace">Replace</option><option value="append">Append text</option><option value="add">Add records</option><option value="add-unique">Add unique records</option><option value="upsert">Update or add records</option><option value="update-fields">Update fields</option></select></label>{/if}
  {#if ['read-file','write-file','commit-outcomes','random-pick'].includes(model.operation)}<label class="pc-nf-field">Access character<select aria-label="File access character" value={model.actorScope==='presence'?model.actorId:'selected'} disabled={!canAct||!actions.editControls} onchange={event=>accessCharacter(event.currentTarget.value)}><option value="selected">Current SillyTavern character</option>{#if model.actorScope==='presence'&&model.actorId&&!(model.actors??[]).some(actor=>actor.id===model.actorId)}<option value={model.actorId}>Previously selected character (unavailable)</option>{/if}{#each model.actors??[] as actor}<option value={actor.id}>{actor.label}</option>{/each}</select></label>{/if}
  {#if model.mode!=='inherited'}
   {#if model.storage==='server'}<label class="pc-nf-field">File path<input aria-label="File path" value={path} maxlength="4096" disabled={!canEdit} oninput={event=>edit('path',event.currentTarget.value)} /></label><p class="pc-nf-help">Paths are on the computer running SillyTavern. Relative paths use {model.location?.basePath??'your user files folder'}.</p>{/if}
   {#if !specialized}<label class="pc-nf-field">Format<select aria-label="Advanced file format" value={format} disabled={!canEdit} onchange={event=>edit('format',event.currentTarget.value)}>{#each formats as option}<option value={option.value}>{option.label}</option>{/each}</select></label>{/if}
   <label class="pc-nf-field">Missing file<select aria-label="Missing file" value={missing} disabled={!canEdit} onchange={event=>edit('missing',event.currentTarget.value)}><option value="create">Create if missing</option><option value="error">Report an error</option></select></label>
   <p class="pc-nf-help">Missing configured files follow this creation policy. Existing file contents are preserved.</p>
   <label class="pc-nf-field">Visibility<select aria-label="File visibility" value={visibility} disabled={!canEdit} onchange={event=>edit('visibility',event.currentTarget.value)}><option value="public">Public</option><option value="hidden">Hidden</option><option value="actor-private">Character private</option></select></label>
   {#if visibility==='actor-private'}<label class="pc-nf-field">Character<select aria-label="File character" value={actorId} disabled={!canEdit} onchange={event=>edit('actor',event.currentTarget.value)}><option value="" disabled>Choose character</option>{#if actorId&&!(model.actors??[]).some(actor=>actor.id===actorId)}<option value={actorId}>Previously selected character (unavailable)</option>{/if}{#each model.actors??[] as actor}<option value={actor.id}>{actor.label}</option>{/each}</select></label>{/if}
   <div class="pc-nf-actions"><button type="button" data-choose-node-file="save" disabled={!canAct||!model.supported||!actions.chooseNodeFile||!valid} onclick={()=>choose('save')}>Choose location…</button>{#if actions.setupNodeFiles}<button type="button" disabled={!canAct} onclick={()=>perform('setup',()=>actions.setupNodeFiles!())}>File storage…</button>{/if}</div>
  {/if}
  <p class="pc-nf-help">{model.storage==='host'?'Saved in SillyTavern with verified writes. Simultaneous saves from separate devices may need reconciliation.':model.storage==='server'?'Custom storage on the SillyTavern server.':model.settings.bindingId?'Previously authorized browser file access.':'Browser file access.'}</p>
  {#if model.accessIssue}<p class="pc-nf-help" data-file-access-issue>{model.accessIssue.message}</p>{/if}
  {#if actions.refreshNodeFiles}<button type="button" data-refresh-node-files disabled={!canAct} onclick={()=>perform('refresh',()=>actions.refreshNodeFiles!())}>Check file access</button>{/if}
 </details>
 {#if model.legacy}<p class="pc-nf-help">Existing saved chat data is preserved and ready to use.</p>{/if}
 {#if model.issue}<p class="pc-nf-error">{model.issue}</p>{/if}
 {#if model.inputIssue}<p class="pc-nf-help" data-file-input-issue>{model.inputIssue}</p>{/if}
 {#if !model.available}<p class="pc-nf-help">Open an active chat to configure this file.</p>{/if}
 {#if dirty&&!valid}<p class="pc-nf-help" role="status">Finish the name and character selection to save settings.</p>{/if}
 {#if staleDraft}<p class="pc-nf-help" role="status">File settings changed elsewhere. Your draft is retained.</p><button type="button" onclick={resetDraft}>Use current settings</button>{/if}
 {#if failure}<p class="pc-nf-error" role="alert">{failure}</p>{/if}
 {#if pending==='save'}<p class="pc-nf-help" role="status">Saving settings…</p>{:else if notice}<p class="pc-nf-help" role="status">{notice}</p>{/if}
</section>
<style>
    .pc-node-file { color: var(--pc-text); min-width: 0; margin: 8px 0 12px; padding: 11px 10px; background: color-mix(in srgb, var(--pc-text) 4%, var(--pc-panel-solid)); font-size: 12px; line-height: 1.45; }
    .pc-node-file * { box-sizing: border-box; }
    h3 { margin: 0 0 8px; color: var(--pc-text); font-size: 12px; font-weight: 600; }
    .pc-nf-field { display: grid; grid-template-columns: minmax(60px, 30%) minmax(0, 1fr); align-items: center; gap: 7px; margin: 9px 0; color: var(--pc-muted); font-size: 11px; }
    :is(input, select, textarea) { display: block; width: 100%; min-width: 0; margin: 0; min-height: 29px; padding: 5px 7px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-field); color: var(--pc-text); font: inherit; }
    textarea { resize: vertical; }
    select { background: var(--pc-control); }
    .pc-nf-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    button { min-width: 0; min-height: 28px; padding: 5px 7px; border: 1px solid var(--pc-border); border-radius: 4px; background: var(--pc-control); color: var(--pc-text); font: inherit; font-size: 11px; cursor: pointer; overflow-wrap: anywhere; }
    button:hover:global(:where(:not(body.pc-node-held *))):not(:disabled) { background: color-mix(in srgb, var(--pc-text) 10%, var(--pc-control)); }
    .pc-nf-status { margin: 0 0 4px; color: var(--pc-text); font-size: 11px; overflow-wrap: anywhere; }
    .pc-nf-help { margin: 7px 0 0; color: var(--pc-muted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
    .pc-nf-error { margin: 7px 0 0; color: var(--pc-error); font-size: 11px; overflow-wrap: anywhere; }
    :is(button, input, select, textarea):focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 1px; }
    :disabled { opacity: .55; cursor: default; }
</style>
