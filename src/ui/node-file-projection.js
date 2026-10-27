import {nodeFileTargetId,validateNodeFileTarget} from '../workflow/node-file-targets.js?v=0.28.1';
import { workflowDataPresetFor } from '../workflow/workflow-data-defaults.js?v=0.28.1';
const owned = new Set(['read-file','write-file','story-clock','commit-outcomes','random-pick','commit-clock']);
const extensions = {json:'json',jsonl:'jsonl',csv:'csv',text:'txt',markdown:'md'};
/** Plain display state only. Native handles never cross this boundary. */
export function projectNodeFile(node, state = {}) {
 if (!owned.has(node?.operation) || node.operation==='random-pick' && !node.ledgerId && !Object.keys(node.fileTarget??{}).length) return null;
 const inherited = node.operation === 'commit-clock' || node.operation === 'write-file' && node.destinationMode !== 'own';
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
  return {operation:node.operation,mode:'inherited',destinationMode:'connected',settings:sourceView?.settings??{bindingId:'',name:'',format:'text',missing:'create',content:'',visibility:{kind:'public'}},available:state.fileConfigAvailable!==false,supported:state.supported===true,legacy:sourceView?.legacy===true,summary:sourceView?.settings.name?sourceView.settings.name+' — from '+label:'Destination comes from '+label,...(sourceView?.accessIssue?{accessIssue:sourceView.accessIssue}:{}),...(issue?{issue}:{})};
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
 const ownId=nodeFileTargetId(node);
 const canonicalTarget=value=>{const checked=validateNodeFileTarget(value);return checked.ok?JSON.stringify(['bindingId','name','format','missing','content'].map(key=>checked.data[key]).concat([checked.data.visibility?.kind,checked.data.visibility?.actorId])):null;};
 const conflict=settings.bindingId && Object.values(state.nodes??{}).some(other=>other.id!==node.id && other.fileTarget?.bindingId && (nodeFileTargetId(other)===ownId || other.fileTarget.bindingId===settings.bindingId) && (nodeFileTargetId(other)!==ownId || canonicalTarget(other.fileTarget)!==canonicalTarget(settings)));

 const accessIssue=state.supported===true?undefined:state.accessIssue??{code:'FILE_ACCESS_UNSUPPORTED',message:'This browser does not provide direct file saving. Open this workflow in desktop Chrome or Edge. File uploads and downloads do not grant this access.'};
 const bindingReady = state.supported===true && binding?.status==='ready' && !!settings.name.trim() && binding.name===settings.name;
 let issue;
 if (!inherited) {
  if (accessIssue) issue='Direct file saving needs browser setup. See the File section.';
  else if(conflict)issue='Nodes sharing this file have different settings. Match their File settings or choose separate files.';
  else if(binding?.format && binding.format!==settings.format)issue='Choose the file again to confirm its changed format.';
  else if (binding?.status==='permission-required') issue='File permission is required. Choose this file again to grant access.';
  else if (settings.bindingId && !binding) issue='The selected file is unavailable. Choose a file location again.';
  else if (!bindingReady) issue='Choose a file location and filename in this node’s File settings.';
 }
 return {operation:node.operation,mode:inherited?'inherited':node.operation==='read-file'?'source':'destination',destinationMode:node.destinationMode??'connected',settings,available:state.fileConfigAvailable!==false,supported:state.supported===true,legacy,...(accessIssue?{accessIssue}:{}),...(issue?{issue}:{})};
}
export function nodeFileSetupIssue(view) {
 if (!view || !view.issue) return null;
 return {code:'FILE_TARGET_REQUIRED',field:'fileTarget',category:'setup',message:view.issue};
}
