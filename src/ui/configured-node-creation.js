import {parseControlInput} from './control-input-contracts.js?v=0.27.3';
import {prepareIterationBindings} from './iteration-bindings.js?v=0.27.3';
import {projectNodeControls} from './node-control-projection.js?v=0.27.3';
import {OPERATIONS,operationDefaults,describeOperation,describeAuthoredOperation,phaseForNode} from '../workflow/catalog.js?v=0.27.3';
import {cloneDefinitionData,definitionRefKey} from '../workflow/definition-data.js?v=0.27.3';
import {prepareDefinitionRegistry,inspectPreparedDefinition} from '../workflow/graph-validation.js?v=0.27.3';
import {freeze} from '../workflow/record-data.js?v=0.27.3';
import {workflowDataPresetFor} from '../workflow/workflow-data-defaults.js?v=0.27.3';
const fail=(code,message)=>({ok:false,error:{code,message}});
/** Declared authoring pins remain available before executable settings are complete. */
export function deferredNodeDescription(operation,controls={}){try{const result=describeAuthoredOperation({schema:3,runtime:2,mode:'native-unified'},{type:'workflow',...operationDefaults(operation,{mode:controls.mode}),...controls});return result.ok?result.data:null;}catch{return null;}}
export function nodeNeedsConfiguration(operation,controls={}){
 const checked=cloneDefinitionData(controls,{operation}),base=OPERATIONS[operation];
 if(!base||!checked.ok||!controls||Array.isArray(controls)||typeof controls!=='object'||Object.keys(controls).some(key=>!base.controls.includes(key)))return true;
 try{return !describeOperation({schema:3,runtime:2,mode:'native-unified'},
  {type:'workflow',...operationDefaults(operation,{mode:controls.mode}),...checked.data}).ok;}catch{return true;}
}
/** Explicit configuration starts from the current effective stage; fixed operations and stage-specific helper containers lock it. */
export function configuredCreationStage(operation,mode,effectivePhase,inDefinition=false,controls={}){
 const node={type:'workflow',...operationDefaults(operation),...controls},graph={mode:'native-unified'};
 const pre=phaseForNode(graph,{...node,phase:'pre'}),post=phaseForNode(graph,{...node,phase:'post'});
 const declared=pre && !post ? 'pre' : post && !pre ? 'post' : undefined,containerStage=inDefinition&&['native-pre','native-post'].includes(mode)?mode.slice(7):null;
 return {phase:containerStage??(['pre','post'].includes(declared)?declared:effectivePhase==='post'?'post':'pre'),phaseLocked:!!containerStage||['pre','post'].includes(declared)};
}
export function iterationHelperChoices(root,profiles=[]){
 const registry=prepareDefinitionRegistry(root?.definitions??{});if(!registry.ok)return freeze([]);
 const definitions=registry.data.snapshots,choices=[];for(const [key,definition] of Object.entries(definitions)){const checked=inspectPreparedDefinition(registry.data,{id:definition.id,version:definition.version,semanticHash:definition.semanticHash});if(!checked.ok)continue;const ports=checked.data.interface;if(!ports.some(port=>port.id==='item'&&port.direction==='input'&&port.kind==='data'&&port.required===true)||!ports.some(port=>port.id==='result'&&port.direction==='output'&&port.kind==='data')||ports.some(port=>port.kind!=='data'||!['item','result','projectedState','nextState'].includes(port.id)||['item','projectedState'].includes(port.id)!==(port.direction==='input')))continue;choices.push({key,label:checked.data.definition.name,ref:checked.data.ref,stateful:ports.some(port=>port.id==='projectedState'&&port.direction==='input')&&ports.some(port=>port.id==='nextState'&&port.direction==='output'),bindings:prepareIterationBindings({helper:checked.data.ref,roleOverrides:{}},definitions,profiles,root.roles??{})});}return freeze(choices);
}
export function validateConfiguredNodeControls(operation,text,options){
 try{if(typeof text!=='string'||text.length>200000)return fail('INVALID_CONFIGURATION','Controls must be a bounded JSON object.');const raw=JSON.parse(text),checked=cloneDefinitionData(raw,{operation}),base=OPERATIONS[operation];if(!checked.ok||!base||!raw||Array.isArray(raw)||typeof raw!=='object'||Object.keys(raw).some(key=>!base.controls.includes(key)))return fail('INVALID_CONFIGURATION','Use only declared node controls in the JSON object.');
  const controls={...checked.data};
  for(const field of projectNodeControls(operation,controls,{phase:options.phase}).filter(field=>['decision.questions','advance-time.schedules','time-trigger.metadata'].includes(field.inputSpec?.id))){const admitted=parseControlInput(field.inputSpec,{format:'rows',value:field.value});if(!admitted.ok)return fail('INVALID_CONFIGURATION',admitted.error.message);controls[field.key]=admitted.data.value;}
  const node={type:'workflow',...operationDefaults(operation),...controls,phase:options.phase},described=describeOperation({schema:3,runtime:2,mode:'native-unified'},node);if(!described.ok)return fail('INVALID_CONFIGURATION','Complete the required identities and settings using the declared node controls.');
  const preset=workflowDataPresetFor(operation),automatic=preset&&node[preset.controlKey]===preset.targetId;
  if(!automatic&&(operation==='read-file'&&!options.targets.some(target=>target.targetId===node.targetId)||['story-clock','commit-outcomes'].includes(operation)&&!options.targets.some(target=>target.targetId===(operation==='story-clock'?node.clockId:node.targetId)&&target.format==='json')))return fail('DOCUMENT_NOT_AUTHORIZED','Select an actual authorized workflow data target.');
  if(operation==='for-each'&&(!options.helpers.some(helper=>definitionRefKey(helper.ref)===definitionRefKey(node.helper)&&(node.mode!=='projected-state'||helper.stateful))))return fail('INVALID_ITERATION_HELPER','Choose an exact bundled Data helper compatible with the iteration mode.');
  return {ok:true,data:{controls,ports:described.data.ports}};
 }catch{return fail('INVALID_CONFIGURATION','Use valid bounded JSON controls; identities remain logical values.');}
}
/** The controller retains exact edit captures; this session never commits or grants host effects. */
export function createConfiguredNodeSession(ports){
 let active=null;
 const stale=()=>fail('STALE_CONTEXT','The graph view changed. Open node configuration again.');
 const graphCheck=owner=>{
  if(active!==owner)return stale();let current=false;
  try{current=ports.isCurrent(owner.capture)===true;}catch{}
  return active!==owner||!current?stale():null;
 };
 const optionsCheck=owner=>{
  if(active!==owner)return stale();let current=false;
  try{current=!ports.isOptionsCurrent||ports.isOptionsCurrent(owner.options)===true;}catch{}
  if(active!==owner)return stale();
  return current?null:fail('STALE_DOCUMENT_SETUP','The user, chat or document authorization changed. Reopen node configuration.');
 };
 const cancel=key=>{if(!active||active.key!==key)return;const owner=active;active=null;owner.resolve(fail('NODE_CONFIGURATION_CANCELLED','Node creation cancelled.'));};
 return Object.freeze({cancel,
  open(capture,command,options){
   if(active)cancel(active.key);const key=globalThis.crypto.randomUUID();let resolve;const result=new Promise(done=>resolve=done);
   const controls=Object.fromEntries(Object.entries(operationDefaults(command.operation)).filter(([key])=>OPERATIONS[command.operation].controls.includes(key)));Object.assign(controls,command.controls??{});
   const view=freeze({key,operation:command.operation,title:OPERATIONS[command.operation].title,controls:JSON.stringify(controls,null,2),fields:projectNodeControls(command.operation,controls,{phase:options.phase}),phase:options.phase,phaseLocked:options.phaseLocked===true,targets:options.targets,helpers:options.helpers});
   active={key,capture,command:structuredClone(command),options:structuredClone(options),resolve};return {view,result};
  },
  apply(key,text,phase){
   const owner=active;if(!owner||owner.key!==key)return stale();
   let rejected=graphCheck(owner)??optionsCheck(owner);if(rejected)return rejected;
   if(owner.options.phaseLocked&&phase!==owner.options.phase)return fail('INVALID_PHASE','The containing workflow fixes this node stage.');
   const checked=validateConfiguredNodeControls(owner.command.operation,text,{...owner.options,phase});if(!checked.ok)return checked;
   if(owner.command.connection){const port=checked.data.ports.find(pin=>pin.id===owner.command.connection.portId&&pin.kind===owner.options.originKind&&pin.direction!==(owner.options.originDirection==='in'?'input':'output'));if(!port)return fail('CONFIGURATION_PORT_CHANGED','The configured node no longer has the selected compatible pin. Choose a different connection.');}
   if(active!==owner)return stale();const {requiresConfiguration,...command}=owner.command;let prepared;
   try{prepared=ports.prepare(owner.capture,{...command,controls:checked.data.controls,phase},owner.options);}catch{return active!==owner?stale():fail('CONFIGURATION_FAILED','The configured node could not be prepared.');}
   if(active!==owner)return stale();if(!prepared?.ok)return prepared??fail('CONFIGURATION_FAILED','The configured node could not be prepared.');
   rejected=graphCheck(owner)??optionsCheck(owner);if(rejected)return rejected;
   if(active!==owner)return stale();active=null;owner.resolve(prepared);return {ok:true};
  },
 });
}
