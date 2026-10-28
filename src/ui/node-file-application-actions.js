import {resolveManagedFileNode,canonicalFileName} from '../workflow/managed-file-policy.js?v=0.30.1';
import {nodeFileTargetId} from '../workflow/node-file-targets.js?v=0.30.1';
import {prepareDocumentMutation} from '../workflow/operations/document-mutations.js?v=0.30.1';
import {sha256Text} from '../workflow/definition-data.js?v=0.30.1';
import {readTextFile} from './file-input.js?v=0.30.1';
const fail=(code,message)=>({ok:false,error:{code,message}});
const cancelled=()=>({ok:false,cancelled:true});
/** Browser input import is an explicit checked write to a new host input file. */
export function createNodeFileApplicationActions(ports){
 const scopeFor=captured=>{const scope=ports.getScope();if(!scope)return null;const {actorId,...publicScope}=scope;return captured.view.settings.visibility?.kind==='actor-private'||captured.node.actorScope==='presence'?scope:publicScope;};
 const current=(captured,selection,scope)=>ports.isCurrent(captured,selection)&&JSON.stringify(scope)===JSON.stringify(scopeFor(captured));
 async function readable(captured,selection,{isCurrent:extraCurrent=()=>true}={}){
  const scope=scopeFor(captured),access=ports.access(),live=()=>{try{return current(captured,selection,scope)&&extraCurrent()===true;}catch{return false;}};if(!scope||!live())return fail('STALE_FILE_SCOPE','Select the current file and chat.');
  let definition;
  if(captured.node.fileTarget?.managed){const resolved=resolveManagedFileNode(captured.node,{workflowId:ports.getWorkflowIdentity(),address:captured.address,actorId:scope.actorId,inputFormat:captured.inputFormat,inputKind:captured.inputKind,inputColumns:captured.inputColumns});if(!resolved.ok)return resolved;definition=resolved.data.definition;
   const found=await access.ensureManaged(definition,{managed:true,create:false,scope,isCurrent:live});if(!found.ok)return found;definition=found.data;
  }else definition={targetId:nodeFileTargetId(captured.node),...captured.view.settings};
  if(!definition?.targetId||!definition.bindingId)return fail('FILE_BINDING_MISSING','Run and accept this output first, or choose an existing input file.');
  if(definition.visibility.kind==='actor-private'&&definition.visibility.actorId!==scope.actorId)return fail('PRIVATE_DESTINATION','Select the character that owns this file.');
  const backend=access.backend([definition],{scope,isCurrent:live});
  const loaded=await backend.load(definition.targetId);if(!loaded.ok)return loaded;
  if(typeof loaded.data.revision==='string'&&loaded.data.revision.startsWith('missing:'))return fail('FILE_NOT_FOUND','This file has no saved contents yet. Accept its first write before opening it.');
  return live()?{ok:true,data:{scope,definition,backend,snapshot:loaded.data}}:cancelled();
 }
 async function show(captured,selection,download){const result=await readable(captured,selection);if(!result.ok)return result;const {definition,snapshot}=result.data;ports.presentFile(snapshot.content,definition.name,definition.format,download);return {ok:true};}
 return Object.freeze({readable,openFile:(captured,selection)=>show(captured,selection,false),downloadFile:(captured,selection)=>show(captured,selection,true),
  async importFile(captured,selection){
   if(captured.node.operation!=='read-file')return fail('FILE_IMPORT_INPUT_ONLY','Import a copy into a Read File input. Output files are written only after acceptance.');
   // Invoke in the button gesture; no optional filesystem service is involved.
   const chosen=ports.pickFile();const scope=scopeFor(captured);const file=await chosen;if(!file)return cancelled();
   if(!scope||!current(captured,selection,scope))return cancelled();
   const read=await readTextFile(file);if(!read.ok)return read;
   const suffix=file.name.split('.').at(-1)?.toLowerCase(),detected={json:'json',jsonl:'jsonl',csv:'csv',md:'markdown',markdown:'markdown',txt:'text'}[suffix];
   const format=detected??captured.view.settings.format??'text',content=read.data.content;
   const initial=format==='json'?'null':'';
   const valid=prepareDocumentMutation({targetId:'import',revision:0,format,content:initial},{operation:'replace',content,...(format==='csv'&&captured.node.columns?.length?{columns:captured.node.columns}:{})});if(!valid.ok)return valid;
   if(!current(captured,selection,scope))return cancelled();
   const access=ports.access(),name=canonicalFileName(file.name,format),selected=await access.choose({mode:'save',name,format});if(!selected.ok)return selected;
   if(!current(captured,selection,scope))return cancelled();
   const definition={targetId:'input-'+crypto.randomUUID(),bindingId:selected.data.bindingId,name:selected.data.name,format,content:'',missing:'create',visibility:captured.view.settings.visibility??{kind:'public'}};
   if(definition.visibility.kind==='actor-private'&&definition.visibility.actorId!==scope.actorId)return fail('PRIVATE_DESTINATION','Select the character that owns this input.');
   const backend=access.backend([definition],{scope,isCurrent:()=>current(captured,selection,scope)}),before=await backend.load(definition.targetId);if(!before.ok)return before;
   if(!current(captured,selection,scope))return cancelled();
   const saved=await backend.compareAndSwap({targetId:definition.targetId,expectedRevision:before.data.revision,expectedContent:before.data.content,projectedDocument:{format,content},intentId:'import-'+crypto.randomUUID(),fingerprint:sha256Text(JSON.stringify(['input-import',definition.targetId,format,content]))});if(!saved.ok)return saved;
   if(saved.data.acknowledged!==true)return fail('PERSISTENCE_UNKNOWN','The input copy save could not be confirmed. Keep the original and try again.');
   if(!current(captured,selection,scope))return cancelled();
   const {targetId,...fileTarget}=definition;fileTarget.missing='error';
   return ports.commit(captured,selection,{targetId,fileTarget});
  },
 });
}
