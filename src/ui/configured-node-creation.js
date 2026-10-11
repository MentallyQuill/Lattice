import {parseControlInput} from './control-input-contracts.js?v=0.27.0';
import {prepareIterationBindings} from './iteration-bindings.js?v=0.27.0';
import {projectNodeControls} from './node-control-projection.js?v=0.27.0';
import {OPERATIONS,operationDefaults,describeOperation,phaseForNode} from '../workflow/catalog.js?v=0.27.0';
import {cloneDefinitionData,definitionRefKey} from '../workflow/definition-data.js?v=0.27.0';
import {inspectDefinitionGraph} from '../workflow/graph-validation.js?v=0.27.0';
import {freeze} from '../workflow/record-data.js?v=0.27.0';
import {workflowDataPresetFor} from '../workflow/workflow-data-defaults.js?v=0.27.0';
const fail=(code,message)=>({ok:false,error:{code,message}});
const pin=(id,kind,direction,required=false,label=id)=>({id,label,kind,direction,required,cardinality:'one'});
const input=(id,kind='data',required=true,label=id)=>pin(id,kind,'input',required,label),output=(id,kind='data',label=id)=>pin(id,kind,'output',false,label);
const factories={
 'decision':controls=>[input('in',controls.inputKind,true,'State'),output('out','data','Decision')],
 'advance-time':()=>[input('clock','data',true,'Previous Story Clock'),input('proposal','data',true,'Explicit time proposal'),input('schedules','data',false,'Authored schedules (optional)'),input('consumed','data',false,'Settled occurrence IDs (optional)'),output('clock','data','Projected Story Clock'),output('occurrences','data','Ordered due events'),output('remainder','data','Remaining duration'),output('report','data','Time projection report')],
 'read-file':()=>[output('text','text','Contents'),output('document','data','Parsed document'),output('reference','data','Live file reference')],
 'story-clock':()=>[output('out','data','Accepted Story Clock')],
 'time-trigger':()=>[input('previous','data',true,'Previous Story Clock'),input('destination','data',true,'Projected Story Clock'),input('consumed','data',false,'Settled occurrence IDs (optional)'),output('occurrences','data','Ordered due events'),output('report','data','Time trigger report')],
 'for-each':controls=>[input('in'),input('state','data',controls.mode==='projected-state'),output('out'),output('state')],
 'scene-presence':()=>[input('in'),output('out')],
 'character-direction':()=>[input('presence'),input('data','data',false),output('out','guidance')],
 'actor-context':()=>[input('presence'),output('out','context')],
 'prompted-memory':()=>[input('presence'),input('event'),output('out')],
 'item-mention-trigger':()=>[input('source'),input('entities'),input('state','data',false),output('out'),output('state')],
 'item-use-trigger':controls=>[input('source'),input('entities'),...(controls.mode==='extract'?[]:[input('candidates')]),output('out')],
 'parse-effect-library':controls=>[input('in',controls.format==='data'?'data':'text'),output('out')],
 'recall':controls=>[input('records','data',false),input('presence','data',false),...(controls.activation?.includes('keyword')?[input('source','data',false)]:[]),...(controls.activation?.includes('event')?[input('events','data',false)]:[]),output('out','guidance'),output('records'),output('report')],
 'hotkey-arm':()=>[output('proposal')],
 'commit-outcomes':()=>[input('outcomes'),output('receipt')],
};
/** Discovery only: accurate declared pins, with no manufactured executable settings or identities. */
export function deferredNodeDescription(operation,controls={}){const factory=factories[operation],base=OPERATIONS[operation];return factory&&base?{descriptor:base,ports:factory({...base.defaults,...controls})}:null;}
export function nodeNeedsConfiguration(operation,controls={}){
 if(['decision','advance-time','json-decode','extract','model-call','format','read-file','write-file','project-document','smart-compactor','pattern','filter-text','repair','compose','text-rules','select-fields','style-transfer','format-transfer','terminology-map','context','state','condition','join','collect','confidence-gate','revise-draft','collection','context-join'].includes(operation))return true;
 if(!Object.hasOwn(factories,operation))return false;
 const preset=workflowDataPresetFor(operation),checked=cloneDefinitionData(controls,{operation}),base=OPERATIONS[operation];
 if(!preset||!checked.ok||!controls||Array.isArray(controls)||typeof controls!=='object'||Object.keys(controls).some(key=>!base.controls.includes(key)))return true;
 const node={type:'workflow',...operationDefaults(operation),...checked.data};
 return node[preset.controlKey]!==preset.targetId||!describeOperation({schema:3,runtime:2,mode:'native-unified'},node).ok;
}
/** Explicit configuration starts from the current effective stage; fixed operations and stage-specific helper containers lock it. */
export function configuredCreationStage(operation,mode,effectivePhase,inDefinition=false,controls={}){
 const node={type:'workflow',...operationDefaults(operation),...controls},graph={mode:'native-unified'};
 const pre=phaseForNode(graph,{...node,phase:'pre'}),post=phaseForNode(graph,{...node,phase:'post'});
 const declared=pre && !post ? 'pre' : post && !pre ? 'post' : undefined,containerStage=inDefinition&&['native-pre','native-post'].includes(mode)?mode.slice(7):null;
 return {phase:containerStage??(['pre','post'].includes(declared)?declared:effectivePhase==='post'?'post':'pre'),phaseLocked:!!containerStage||['pre','post'].includes(declared)};
}
export function iterationHelperChoices(root,profiles=[]){
 const choices=[];for(const [key,definition] of Object.entries(root?.definitions??{})){const checked=inspectDefinitionGraph(definition,root.definitions);if(!checked.ok)continue;const ports=checked.data.interface;if(!ports.some(port=>port.id==='item'&&port.direction==='input'&&port.kind==='data'&&port.required===true)||!ports.some(port=>port.id==='result'&&port.direction==='output'&&port.kind==='data')||ports.some(port=>port.kind!=='data'||!['item','result','projectedState','nextState'].includes(port.id)||['item','projectedState'].includes(port.id)!==(port.direction==='input')))continue;choices.push({key,label:definition.name,ref:checked.data.ref,stateful:ports.some(port=>port.id==='projectedState'&&port.direction==='input')&&ports.some(port=>port.id==='nextState'&&port.direction==='output'),bindings:prepareIterationBindings({helper:checked.data.ref,roleOverrides:{}},root.definitions,profiles,root.roles??{})});}return freeze(choices);
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
