import {nodeFileTargetId,validateNodeFileTarget} from '../workflow/node-file-targets.js?v=0.30.2';
import { workflowDataPresetFor } from '../workflow/workflow-data-defaults.js?v=0.30.2';
import {canonicalFileName,inferManagedFileFormat,resolveManagedFileNode} from '../workflow/managed-file-policy.js?v=0.30.2';
import {fileInitializationMode,prepareUnboundReader} from '../workflow/file-initialization.js?v=0.30.2';
const owned = new Set(['read-file','write-file','story-clock','commit-outcomes','random-pick','commit-clock']);
const extensions = {json:'json',jsonl:'jsonl',csv:'csv',text:'txt',markdown:'md'};
const types={text:'Text document',markdown:'Markdown document',json:'Structured data',jsonl:'JSON Lines',csv:'Spreadsheet'};
export function nodeFileOwnsControl(operation,key){return owned.has(operation)&&(['fileTarget','fileHandling','destinationMode','actorScope','actorId'].includes(key)||operation==='read-file'&&['initialization','initializationInstructions','initializationMaxTokens'].includes(key)||operation==='write-file'&&key==='mode'||['read-file','write-file','commit-outcomes'].includes(operation)&&key==='targetId'||operation==='story-clock'&&key==='clockId'||operation==='random-pick'&&key==='ledgerId');}
export function nodeFileContentIssue(view){return view?.inputIssue?{code:'MISSING_INPUT',field:'text',category:'connection',message:view.inputIssue}:null;}
/** Adoption needs an explicit trusted absence check; the display must not redirect existing files. */
export function managedNodeFileMigration(node,{hasCanonicalData}={}){
 const target=node?.fileTarget;
 if(!target||!validateNodeFileTarget(target).ok)return null;
 if(hasCanonicalData!==false||!target||target.managed||!['write-file','story-clock','commit-outcomes','random-pick'].includes(node.operation)||node.operation==='write-file'&&node.destinationMode!=='own'||target.bindingId||target.path?.trim()||target.content)return null;
 const intent={managed:true,...Object.fromEntries(['name','format','missing','visibility'].filter(key=>Object.hasOwn(target,key)).map(key=>[key,target[key]]))};
 return validateNodeFileTarget(intent).ok?intent:null;
}
function display(view,node,state){
 const saving=node.operation!=='read-file';
 const connected=Object.values(state.wires??{}).filter(wire=>wire.to===node.id&&['text','records'].includes(wire.toPort));
 const inputIssue=node.operation==='write-file'&&node.fileHandling&&state.wires&&(connected.length===0?'Connect Text or Records to provide this file’s content.':new Set(connected.map(wire=>wire.toPort)).size>1?'Connect either Text or Records, using one content input.':undefined);
 return {...view,ownFileConfigured:Object.keys(node.fileTarget??{}).length>0,managed:view.managed===true,friendlyName:view.settings.name.replace(/\.(txt|md|json|jsonl|csv)$/i,''),typeLabel:['story-clock','commit-clock','commit-outcomes','random-pick'].includes(node.operation)?'Lattice data':types[view.settings.format],status:view.issue?'Needs attention':'Ready',saving,...(node.operation==='read-file'?{initialization:fileInitializationMode(node),initializationInstructions:node.initializationInstructions??'',initializationMaxTokens:node.initializationMaxTokens??2048}:{}),fileHandling:node.fileHandling||(['append','add','add-unique'].includes(node.mode)?'append':'replace'),advancedMutation:node.operation==='write-file'&&!node.fileHandling&&!['replace','append',undefined].includes(node.mode)?node.mode:undefined,mutation:node.mode??'replace',actorScope:node.actorScope??'selected',actorId:node.actorId??'',actors:state.actors??[],...(inputIssue?{inputIssue}:{})};
}
/** Plain display state only. Native handles never cross this boundary. */
export function projectNodeFile(node, state = {}) {
 if (!owned.has(node?.operation) || node.operation==='random-pick' && !node.ledgerId && !Object.keys(node.fileTarget??{}).length) return null;
 if(node.operation==='read-file'&&fileInitializationMode(node)==='require-file'&&node.fileTarget?.managed===true&&validateNodeFileTarget(node.fileTarget).ok)node={...node,fileTarget:{missing:'error'}};
 node=prepareUnboundReader(node,{legacyDocuments:Array.isArray(state.legacyDocuments)?state.legacyDocuments:state.documents??[],canonicalDocuments:state.canonicalDocuments??(Array.isArray(state.legacyDocuments)?{}:state.legacyDocuments)??{},nodes:state.nodes??{},wires:state.wires??{}});
 const inherited = node.operation === 'commit-clock' || node.operation === 'write-file' && node.destinationMode !== 'own';
 if(!inherited&&node.fileTarget?.managed===true){
  const format=inferManagedFileFormat(node,{inputFormat:state.inputFormat,inputKind:state.inputKind});
  const checked=resolveManagedFileNode(node,{workflowId:state.workflowId??'display',address:state.address??{nodeId:node.id,instancePath:[]},actorId:state.actorId,inputFormat:state.inputFormat,inputKind:state.inputKind,inputColumns:state.inputColumns});
  const settings={bindingId:'',name:canonicalFileName(node.fileTarget.name||node.title||node.operation,format),format,missing:'create',content:'',visibility:{kind:'public'},...(checked.ok?checked.data.definition??{}:node.fileTarget)};
  delete settings.targetId;
  const supported=state.providers?.host?.supported??state.hostSupported??state.managedSupported??(state.storage==='host'&&state.supported===true);
  return display({operation:node.operation,mode:node.operation==='read-file'?'source':'destination',destinationMode:node.destinationMode??'own',settings,managed:true,available:state.fileConfigAvailable!==false,supported,storage:'host',legacy:false,...(!checked.ok?{issue:checked.error.message}:!supported?{issue:'Saving in SillyTavern is temporarily unavailable.'}:{})},node,state);
 }
 if (inherited) {
  const expected=node.operation==='commit-clock'?'story-clock':'read-file';
  const incoming=Object.values(state.wires??{}).filter(wire=>wire.to===node.id && (node.operation!=='write-file'||wire.toPort==='reference'));
  const pending=incoming.map(wire=>wire.from), visited=new Set(); let source;
  while(pending.length && visited.size<1000) {
   const id=pending.shift(); if(visited.has(id)) continue; visited.add(id);
   const candidate=state.nodes?.[id];
   if(candidate?.operation===expected){source=candidate;break;}
   for(const wire of Object.values(state.wires??{}))if(wire.to===id)pending.push(wire.from);
  }
  const sourceView=source?projectNodeFile(source,{...state,nodes:{},wires:{}}):null;
  const label=expected==='read-file'?'Read File':'Story Clock';
  const issue=!sourceView?'Connect '+(expected==='read-file'?'a live file reference from Read File or choose your own destination.':'the Advance Time report from a configured Story Clock.') : sourceView.issue;
  return display({operation:node.operation,mode:'inherited',destinationMode:'connected',settings:sourceView?.settings??{bindingId:'',name:'',format:'text',missing:'create',content:'',visibility:{kind:'public'}},managed:sourceView?.managed,available:state.fileConfigAvailable!==false,supported:sourceView?.supported??state.supported===true,storage:sourceView?.storage??state.storage??'native',...(sourceView?.location?{location:sourceView.location}:{}),legacy:sourceView?.legacy===true,summary:sourceView?.settings.name?(sourceView.settings.path||sourceView.settings.name)+' — from '+label:'Destination comes from '+label,...(sourceView?.accessIssue?{accessIssue:sourceView.accessIssue}:{}),...(issue?{issue}:{})},node,state);
 }
 const preset=workflowDataPresetFor(node.operation);
 const targetId=node[preset?.controlKey??'targetId']||preset?.targetId||'';
 const summary=(state.documents??[]).find(item=>item.targetId===targetId);
 const saved=state.legacyDocuments?.[targetId], definition=state.definitions?.[targetId];
 const legacy=!!(summary||saved) && !Object.keys(node.fileTarget??{}).length;
 const format=saved?.format??summary?.format??preset?.format??'text';
 let name=legacy?(summary?.name||targetId):'';
 if(name && !name.toLowerCase().endsWith('.'+extensions[format])) name+='.'+extensions[format];
 const settings = {bindingId:'',name,format,missing:'create',content:saved?.content??definition?.content??preset?.content??'',visibility:summary?.visibility??preset?.visibility??{kind:'public'},...node.fileTarget};
 const binding = state.bindings?.[settings.bindingId];
 const storage=binding?.storage??state.storage??'native';
 const provider=state.providers?.[storage];
 const supported=provider?.supported??(storage==='native'&&state.storage&&state.storage!=='native'?state.nativeSupported===true:storage==='server'&&state.storage==='host'?state.serverSupported===true:storage==='host'&&state.storage!=='host'?state.hostSupported===true:state.supported===true);
 if(storage==='server' && settings.path===undefined && typeof binding?.path==='string')settings.path=binding.path;
 const ownId=nodeFileTargetId(node);
 const canonicalTarget=value=>{const checked=validateNodeFileTarget(value);return checked.ok?JSON.stringify(['bindingId','name','path','format','missing','content'].map(key=>checked.data[key]).concat([checked.data.visibility?.kind,checked.data.visibility?.actorId])):null;};
 const conflict=settings.bindingId && Object.values(state.nodes??{}).some(other=>other.id!==node.id && other.fileTarget?.bindingId && (nodeFileTargetId(other)===ownId || other.fileTarget.bindingId===settings.bindingId) && (nodeFileTargetId(other)!==ownId || canonicalTarget(other.fileTarget)!==canonicalTarget(settings)));

 const accessIssue=supported?undefined:provider?.availability??(storage==='native'&&state.storage&&state.storage!=='native'?state.nativeAccessIssue:state.accessIssue)??(storage==='server'?{code:'FILE_SERVICE_UNAVAILABLE',message:'Custom server locations are unavailable. Check File storage setup.'}:storage==='host'?{code:'HOST_FILE_UNAVAILABLE',message:'Saving in SillyTavern is temporarily unavailable.'}:{code:'FILE_ACCESS_UNSUPPORTED',message:'This browser cannot access this previously authorized browser file. Reconnect the original file from a supported browser.'});
 const bindingReady = supported && binding?.status==='ready' && !!settings.name.trim() && binding.name===settings.name;
 let issue;
 if (!inherited && !legacy) {
  if (accessIssue) issue=storage==='server'?'The server file service needs attention. See the File section.':'Direct file saving needs browser setup. See the File section.';
  else if(node.operation==='write-file'&&(typeof ownId!=='string'||!ownId.trim()||ownId.length>256))issue='Choose a destination file to finish setup.';
  else if(conflict)issue='Nodes sharing this file have different settings. Match their File settings or choose separate files.';
  else if(storage==='server' && settings.path && binding?.path && settings.path!==binding.path)issue='The path changed. Create a new copy or choose the original file.';
  else if(binding?.format && binding.format!==settings.format)issue='Choose the file again to confirm its changed format.';
  else if (binding?.status==='permission-required') issue='File permission is required. Choose this file again to grant access.';
  else if (settings.bindingId && !binding) issue='The selected file is unavailable. Choose a file location again.';
  else if (!bindingReady) issue='Choose a file, or import an input copy.';
 }
 return display({operation:node.operation,mode:inherited?'inherited':node.operation==='read-file'?'source':'destination',destinationMode:node.destinationMode??'connected',settings,available:state.fileConfigAvailable!==false,supported,storage,...(storage==='server'&&state.location?{location:state.location}:{}),legacy,...(!legacy&&accessIssue?{accessIssue}:{}),...(issue?{issue}:{})},node,state);
}
export function nodeFileSetupIssue(view) {
 if (!view || !view.issue) return null;
 return {code:'FILE_TARGET_REQUIRED',field:'fileTarget',category:'setup',message:view.issue};
}
