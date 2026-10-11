import {createRecallState,validateRecallScope,validateRecallQueueProposal} from './recall-state.js?v=0.27.0';
import {describeRecallNode,executeRecallNode,RECALL_OPERATIONS} from './operations/recall-nodes.js?v=0.27.0';
import {parseRecord} from './introspection/contracts.js?v=0.27.0';
import {validateOccurrences} from './operations/event-data.js?v=0.27.0';
import {cloneJsonValue} from './operations/json-data.js?v=0.27.0';
import {artifactVisibility,preserveArtifactPrivacy} from './artifact-privacy.js?v=0.27.0';
import {resolveWorkflow} from './resolve.js?v=0.27.0';
import {nodeAddressKey} from './graph-validation.js?v=0.27.0';
import {own,freeze} from './record-data.js?v=0.27.0';
const fail=(code,message)=>({ok:false,error:{code,message}}),good=data=>({ok:true,data});
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const json=value=>{const r=cloneJsonValue(value);return r.ok?canonical(r.data.value):null;};
const sourceMetadata=value=>{const r=cloneJsonValue(value);if(!r.ok||!r.data.value||['sourceId','revision','sceneId'].some(key=>typeof r.data.value[key]!=='string'||!r.data.value[key].trim()||r.data.value[key].length>256)||r.data.value.watch!==undefined&&!['scene-context','player-message','draft','st-reply','accepted-event'].includes(r.data.value.watch))return null;return freeze(Object.fromEntries(['sourceId','revision','sceneId','watch'].filter(key=>r.data.value[key]!==undefined).map(key=>[key,r.data.value[key]])));};
const stageOf=entry=>{try{return entry.getGeneration()?.stage;}catch{return null;}};
const matchesSource=(event,proof)=>event.source.sourceId===proof.source.sourceId&&event.source.revision===proof.source.revision&&event.source.watch===proof.source.watch&&event.sceneId===proof.source.sceneId&&proof.text.slice(event.position.start,event.position.end)===event.evidence.text;
const without=(value,fields)=>Object.fromEntries(Object.entries(value).filter(([field])=>!fields.includes(field)));
const unchangedEvent=(event,parent,confirmation=false)=>json(event)===json(parent)||confirmation&&parent.status==='candidate'&&event.status==='confirmed'&&json(without(event,['status','confirmation']))===json(without(parent,['status','confirmation']));
function occurrenceSubset(value,proof,{confirmation=false,nested=false,status}={}){
 let checked=validateOccurrences(value,status?{status}:{});
 if(!checked.ok&&nested&&Array.isArray(value)&&value.length<=128&&value.every(Array.isArray))checked=validateOccurrences(value.flat(),status?{status}:{});
 return checked.ok&&checked.data.events.every(event=>matchesSource(event,proof)&&proof.events?.some(parent=>unchangedEvent(event,parent,confirmation)))?checked.data.events:null;
}

const key=scope=>JSON.stringify([scope.userId,scope.chatId,scope.workflowId,scope.actorId]);
const equalScope=(a,b)=>!!a&&!!b&&key(a)===key(b);
const proposalFor=node=>Object.fromEntries(['schemaVersion','type',...RECALL_OPERATIONS['hotkey-arm'].controls].map(name=>[name,name==='schemaVersion'?1:name==='type'?'recall-arm-proposal':own(node,name)??RECALL_OPERATIONS['hotkey-arm'].defaults[name]]));
const metadataFor=(artifact,proof)=>{const value=artifact?.value;return value&&value.sceneId===proof.source.sceneId&&value.sourceId===proof.source.sourceId&&value.revision===proof.source.revision;};
/** Controller-local state and source authority. None of these maps or live claims is portable. */
export function createNativeRecallController(ports) {
 const slots=new Map(),runs=new WeakMap();let disposed=false,selected=null,sequence=0,documentOwner=null,version=0,lastFingerprint=null;const listeners=new Set(),queueCaptures=new WeakMap();
 function active() {
  if(disposed)return null;
  try {const raw=ports.getActive();const scope=validateRecallScope(raw?.scope);if(!scope.ok||raw.graph?.mode!=='native-unified'||typeof raw.signature!=='string')return null;return {owner:raw.owner??raw.graph,scope:scope.data,graph:raw.graph,signature:raw.signature};}catch{return null;}
 }
 function sameActive(slot){const now=active();return now&&now.owner===slot.documentOwner&&equalScope(now.scope,slot.scope)&&now.signature===slot.signature?now:null;}
 function authority(slot){const owner=slot.owner;let generation=null;if(owner&&!owner.closed)try{generation=owner.getGeneration();}catch{/* Invalid owned generation never grants a claim. */}const now=sameActive(slot);if(!now)return {scope:{},generation:null};if(disposed||owner&&(!owner.closed&&owner.slot.owner!==owner))return {scope:{},generation:null};return {scope:now.scope,generation:owner&&!owner.closed&&slot.owner===owner&&!owner.signal?.aborted?generation:null};}
 function deactivate(slot){for(const dispose of slot.listeners.values())try{dispose();}catch{/* Listener cleanup cannot restore authority. */}slot.listeners.clear();}
 function publish(summary){const fingerprint=json(summary);if(fingerprint!==lastFingerprint){lastFingerprint=fingerprint;version++;const subscribers=[...listeners];for(const listener of subscribers)try{listener();}catch{}}return good(freeze({...summary,version}));}
 function inspect(slot){
  const checked=slot.state.inspect();if(!checked.ok)return checked;
  const requests=checked.data.requests.map(({memorySetId,target,uses,consumeOn,queued,remaining,pendingGenerationCount,pendingState})=>({memorySetId,target,uses,consumeOn,queued,remaining,pendingGenerationCount,pendingState}));
  const shortcuts=[...slot.nodes.values()].map(node=>{const request=requests.find(value=>value.memorySetId===node.memorySetId);return {...node,queued:request?.queued===true,remaining:request?.remaining??{reply:false,swipe:false},pendingCount:request?.pendingGenerationCount??0};});
  return publish({scope:slot.scope,requests,shortcuts});
 }
 function notify(){const now=active();if(selected&&sameActive(selected)&&now)return inspect(selected);return publish({scope:null,requests:[],shortcuts:[]});}
 function resetDocument(owner){if(documentOwner===owner)return;for(const slot of slots.values()){if(slot.owner)releaseRun(slot.owner.run);deactivate(slot);slot.state.release();}slots.clear();selected=null;documentOwner=owner;publish({scope:null,requests:[],shortcuts:[]});}
 function subscribe(listener){if(typeof listener!=='function')return ()=>{};listeners.add(listener);return ()=>listeners.delete(listener);}
 function slotFor(now) {
  const slotKey=key(now.scope),previous=slots.get(slotKey);
  if(previous&&previous.signature===now.signature)return good(previous);
  if(previous){deactivate(previous);previous.state.release();slots.delete(slotKey);}
  if(slots.size>=32)return fail('RECALL_SESSION_LIMIT','The controller reached its bounded Recall session limit.');
  const plan=resolveWorkflow(now.graph);if(!plan.ok)return fail('RECALL_GRAPH_INVALID','Recall shortcuts require a valid active unified workflow.');
  const slot={documentOwner:now.owner,scope:now.scope,signature:now.signature,nodes:new Map(),listeners:new Map(),registering:new Set(),owner:null,state:null};
  const state=createRecallState({getAuthority:()=>authority(slot)});if(!state.ok)return state;slot.state=state.data;
  for(const unit of plan.data.primitives??[])if(unit.enabled&&!unit.systemDisabled&&unit.node.operation==='hotkey-arm'){
   const described=describeRecallNode(unit.node,{phase:unit.phase});if(!described.ok||unit.node.actorId!==now.scope.actorId)continue;
   const checked=validateRecallQueueProposal(proposalFor(unit.node));if(checked.ok)slot.nodes.set(nodeAddressKey(unit.address),{...checked.data,nodeId:unit.node.id,address:unit.address});
  }
  slots.set(slotKey,slot);return good(slot);
 }
 function sync() {
  const now=active();if(!now){if(selected)deactivate(selected);selected=null;return publish({scope:null,requests:[],shortcuts:[]});}
  if(documentOwner!==now.owner)resetDocument(now.owner);const captured=slotFor(now);if(!captured.ok)return captured;const slot=captured.data;
  if(selected!==slot){if(selected)deactivate(selected);selected=slot;}
  if(typeof ports.registerHotkey==='function')for(const [shortcutKey,proposal]of slot.nodes)if(!slot.listeners.has(shortcutKey)){
   if(slot.registering.has(shortcutKey))return fail('RECALL_REGISTRATION_PENDING','The scoped shortcut registration is already pending.');slot.registering.add(shortcutKey);
   let registered;try{registered=ports.registerHotkey({scope:slot.scope,nodeId:proposal.nodeId,address:proposal.address,hotkey:proposal.hotkey,onPress:()=>sameActive(slot)&&selected===slot?queue(proposal.address):fail('STALE_RECALL_SHORTCUT','This shortcut belongs to another active scope.')});}catch{return fail('RECALL_HOTKEY_UNAVAILABLE','The trusted shortcut listener is unavailable.');}finally{slot.registering.delete(shortcutKey);}
   let dispose;try{dispose=registered?.data?.dispose;}catch{return fail('RECALL_HOTKEY_UNAVAILABLE','The listener returned an unavailable cleanup capability.');}
   if(registered?.ok!==true||typeof dispose!=='function'){try{dispose?.();}catch{}return fail('RECALL_HOTKEY_UNAVAILABLE','The trusted listener did not return its scoped cleanup.');}
   if(!sameActive(slot)||disposed){try{dispose();}catch{}return fail('STALE_RECALL_SHORTCUT','The active scope changed while registering Recall.');}
   slot.listeners.set(shortcutKey,dispose);
  }
  return inspect(slot);
 }
 function captureQueueCommand(){const synced=sync();if(!synced.ok)return synced;if(!selected||!sameActive(selected))return fail('RECALL_UNAVAILABLE','Enable Lattice and open a unified workflow for the active character.');const capture=Object.freeze({});queueCaptures.set(capture,{slot:selected,documentOwner,signature:selected.signature,version});return good(capture);}
 function changeQueues(capture,raw){
  const captured=queueCaptures.get(capture);const synced=sync();if(!synced.ok)return synced;
  if(!captured||captured.slot!==selected||captured.documentOwner!==documentOwner||captured.signature!==selected?.signature||captured.version!==version||!sameActive(selected))return fail('STALE_RECALL_CONTEXT','Recall scope or status changed. Reopen these controls and try again.');
  const checked=cloneJsonValue(raw);if(!checked.ok)return fail('INVALID_RECALL_QUEUE','Use a bounded recall selection.');const request=checked.data.value;
  const ids=request?.shortcutNodeIds===undefined?[]:request.shortcutNodeIds,addresses=request?.shortcutAddresses===undefined?[]:request.shortcutAddresses;
  if(!request||Object.keys(request).some(key=>!['action','shortcutNodeIds','shortcutAddresses'].includes(key))||!['queue','cancel'].includes(request.action)||!Array.isArray(ids)||!Array.isArray(addresses)||!Object.hasOwn(request,'shortcutNodeIds')&&!Object.hasOwn(request,'shortcutAddresses')||ids.length+addresses.length>1000||ids.some(id=>typeof id!=='string')||addresses.some(address=>!address||Object.keys(address).some(key=>!['workflowId','instancePath','nodeId'].includes(key))||address.workflowId!==selected.scope.workflowId||!Array.isArray(address.instancePath)||address.instancePath.length>8||address.instancePath.some(id=>typeof id!=='string'||!id)||typeof address.nodeId!=='string'||!address.nodeId))return fail('RECALL_NODE_UNAVAILABLE','Select configured Recall Shortcuts in the current workflow.');
  const shortcutKeys=[...new Set([...ids.map(nodeId=>nodeAddressKey({workflowId:selected.scope.workflowId,instancePath:[],nodeId})),...addresses.map(nodeAddressKey)])];
  if(shortcutKeys.some(key=>!selected.nodes.has(key)))return fail('RECALL_NODE_UNAVAILABLE','Select configured Recall Shortcuts in the current workflow.');
  const proposal=({nodeId,address,...proposal})=>proposal,proposals=shortcutKeys.map(key=>proposal(selected.nodes.get(key)));
  if(request.action==='queue')for(const proposal of proposals)for(const configured of selected.nodes.values())if(configured.memorySetId===proposal.memorySetId&&['target','uses','consumeOn'].some(key=>configured[key]!==proposal[key]))return fail('RECALL_QUEUE_CONFLICT','Matching Recall Shortcuts use different policies. Make their target, repetition, and consumption settings match.');
  const result=selected.state.changeQueues(request.action==='queue'?{action:'queue',proposals}:{action:'cancel',memorySetIds:proposals.map(value=>value.memorySetId)});
  return result.ok?inspect(selected):result;
 }
 function queue(nodeId){const captured=captureQueueCommand();return captured.ok?changeQueues(captured.data,{action:'queue',...(typeof nodeId==='string'?{shortcutNodeIds:[nodeId]}:{shortcutAddresses:[nodeId]})}):captured;}
 function cancel(nodeId){const captured=captureQueueCommand();return captured.ok?changeQueues(captured.data,{action:'cancel',...(typeof nodeId==='string'?{shortcutNodeIds:[nodeId]}:{shortcutAddresses:[nodeId]})}):captured;}
 function begin(run,controls) {
  const controlScope=own(controls,'scope'),signature=own(controls,'signature'),getGeneration=own(controls,'getGeneration'),isCurrent=own(controls,'isCurrent'),signal=own(controls,'signal');if(!run||typeof run!=='object'||!validateRecallScope(controlScope).ok||typeof signature!=='string'||typeof getGeneration!=='function'||typeof isCurrent!=='function'||signal!==undefined&&!(signal instanceof AbortSignal))return fail('INVALID_RECALL_OWNER','Bind exact private native run controls.');
  controls={scope:controlScope,signature,getGeneration,isCurrent,signal};
  const now=active();if(!now||!equalScope(now.scope,controls.scope)||now.signature!==controls.signature)return fail('STALE_RECALL_SCOPE','The native Recall scope changed before capture.');
  const synced=sync();if(!synced.ok)return synced;const slot=selected;
  const entry={run,slot,scope:slot.scope,closed:false,getGeneration:controls.getGeneration,isCurrent:controls.isCurrent,signal:controls.signal,roots:new WeakMap(),rootArtifacts:new WeakMap(),artifacts:new WeakMap(),claims:new Map(),sources:new Set()};
  runs.set(run,entry);slot.owner=entry;return good({captured:true});
 }
 function live(entry){if(!entry||entry.closed||entry.signal?.aborted||entry.slot.owner!==entry||disposed)return false;let current=false;try{current=entry.isCurrent()===true;}catch{return false;}const now=current&&sameActive(entry.slot);return !!now&&!entry.closed&&!entry.signal?.aborted&&entry.slot.owner===entry&&!disposed;}
 function proofLive(entry,proof){if(!live(entry)||!proof||proof.entry!==entry)return false;try{return proof.fresh()===true&&live(entry);}catch{return false;}}
 /** Trusted producer callback only. Capture the exact adapter result, never node-authored metadata. */
 function capture(run,result,details) {
  const entry=runs.get(run);if(!live(entry)||result?.ok!==true||!['source','file','memory'].includes(details?.kind)||typeof details.fresh!=='function')return fail('RECALL_SOURCE_UNAVAILABLE','Capture Recall from its current trusted native producer.');
  const source=details.kind==='source'?sourceMetadata(details.source):null;if(details.kind==='source'&&!source)return fail('INVALID_RECALL_SOURCE','Use bounded native source identity.');
  const capturedRecord=details.kind==='memory'?parseRecord(result.artifact??result.outputs?.out):details.kind==='file'?parseRecord({kind:'data',value:details.recordValue}):null;
  if(details.kind==='memory'&&!capturedRecord?.ok)return fail('RECALL_RECORDS_UNVERIFIED','Memory capture requires its exact checked canonical read.');
  const proof={entry,kind:details.kind,stage:stageOf(entry),fresh:details.fresh,source,text:details.text??'',recordValue:details.recordValue,canonicalRecord:capturedRecord?.ok?capturedRecord.data:null,producer:result};
  if(!live(entry))return fail('RECALL_SOURCE_UNAVAILABLE','The source producer was revoked during capture.');entry.roots.set(result,proof);entry.sources.add(proof);return good({retained:true});
 }
 function captureSourceArtifact(run,artifact,details){const entry=runs.get(run);if(!live(entry)||!artifact||typeof details?.fresh!=='function')return fail('RECALL_SOURCE_UNAVAILABLE','Use a captured native source producer.');const source=sourceMetadata(details.source);if(!source||typeof details.text!=='string'||details.text.length>100000)return fail('INVALID_RECALL_SOURCE','Use bounded actual source metadata and text.');const proof={entry,kind:'source',stage:stageOf(entry),source,text:details.text,fresh:details.fresh};if(!live(entry))return fail('RECALL_SOURCE_UNAVAILABLE','The source producer was revoked during capture.');entry.rootArtifacts.set(artifact,proof);entry.sources.add(proof);return good({retained:true});}
 function lookup(run,artifact){const entry=runs.get(run),proof=entry?.artifacts.get(artifact);return proofLive(entry,proof)?good({kind:proof.kind,source:proof.source}):fail('RECALL_PROVENANCE_REQUIRED','Use an exact current artifact from the trusted native source.');}
 function retain(run,payload) {
  const entry=runs.get(run);if(!live(entry))return fail('RECALL_SOURCE_UNAVAILABLE','The native Recall source was revoked.');
  const {node,inputs,artifact,rawResult,portId}=payload;if(node.modifiers?.length)return good({retained:true});
  const root=entry.roots.get(rawResult)??entry.rootArtifacts.get(rawResult.outputs?.[portId]??rawResult.artifact);let proof;
  if(root){const expected=rawResult.outputs?.[portId]??(portId==='out'?rawResult.artifact:undefined);if(expected&&json(expected)===json(artifact)&&proofLive(entry,root))proof=root;}
  if(!proof&&node.operation==='branch'&&!Object.hasOwn(node,'fields')&&!Object.hasOwn(node,'default')){
   // A real selected Branch is an identity route, not a new interpretation or source.
   // The raw operation must return the exact input; only the runtime's immutable clone may differ in identity.
   const input=own(inputs,'in'),condition=own(inputs,'condition'),decision=own(condition,'value'),accepted=typeof decision==='boolean'?decision:own(decision,'accepted'),route=accepted===true?'yes':accepted===false?'no':'unresolved';
   const outputs=own(rawResult,'outputs'),states=cloneJsonValue(own(rawResult,'outputStates')),parent=entry.artifacts.get(input),inputValue=json(input),outputValue=json(artifact);
   if(portId===route&&own(rawResult,'ok')===true&&own(rawResult,'artifact')===undefined&&outputs&&Object.keys(outputs).length===1&&own(outputs,route)===input&&states.ok&&Object.keys(states.data.value??{}).length===2&&['yes','no','unresolved'].filter(port=>port!==route).every(port=>states.data.value[port]?.status==='skipped')&&inputValue!==null&&inputValue===outputValue&&proofLive(entry,parent))proof=parent;
  }
  if(!proof){const parents=Object.values(inputs??{}).map(value=>entry.artifacts.get(value)).filter(value=>proofLive(entry,value));
   const record=parents.find(value=>['file','memory'].includes(value.kind));
   if(record&&['json-decode','select-fields','format'].includes(node.operation))proof=record;
   const origin=parents.find(value=>['source','interpretation','presence','occurrences','holder-events'].includes(value.kind));
   if(origin&&['json-decode','select-fields','draft-text','collection'].includes(node.operation)&&!(node.operation==='select-fields'&&node.fields?.some(field=>Object.hasOwn(field,'default'))))proof=origin;
   if(origin&&node.operation==='model-call'&&rawResult.reports?.some(report=>report.code==='MODEL_CALL'&&report.actualCalls===1))proof={...origin,kind:'interpretation'};
   if(origin&&node.operation==='scene-presence'&&origin.kind==='interpretation')proof={...origin,kind:'presence'};
   if(origin&&['event-normalize','confirm-events','item-use-trigger','item-mention-trigger'].includes(node.operation)){
    const eventOrigin=node.operation==='confirm-events'?entry.artifacts.get(inputs.events):entry.artifacts.get(inputs.source),expected=rawResult.outputs?.[portId]??(portId==='out'?rawResult.artifact:undefined);
    if(proofLive(entry,eventOrigin)&&expected&&json(expected)===json(artifact)&&rawResult.reports?.some(report=>report.operation===node.operation)){
     const checked=validateOccurrences(artifact.value),events=node.operation==='confirm-events'&&['occurrences','holder-events'].includes(eventOrigin.kind)?occurrenceSubset(artifact.value,eventOrigin,{confirmation:true,status:'confirmed'}):node.operation!=='confirm-events'&&checked.ok&&checked.data.events.every(event=>matchesSource(event,eventOrigin))?checked.data.events:null;
     if(events)proof={...eventOrigin,kind:'occurrences',events:freeze(events)};
    }
   }
   // A compiled helper may only return unchanged input occurrences, with the canonical confirmation transition.
   // Private root runtime provenance authenticates this exact adapter result; no helper output invents event ancestry.
   const iterationOrigin=entry.artifacts.get(inputs.in);
   if(node.operation==='for-each'&&portId==='out'&&proofLive(entry,iterationOrigin)&&['occurrences','holder-events'].includes(iterationOrigin.kind)&&json(rawResult.outputs?.out)===json(artifact)){
    const events=occurrenceSubset(artifact.value,iterationOrigin,{confirmation:true,nested:true});
    if(events)proof={...iterationOrigin,kind:'occurrences',events:freeze(events)};
   }
   const eventOrigin=entry.artifacts.get(inputs.events);
   if(proofLive(entry,eventOrigin)&&['occurrences','holder-events'].includes(eventOrigin.kind)&&node.operation==='current-holder'&&portId==='events'&&rawResult.reports?.some(report=>report.operation==='current-holder'&&report.actualCalls===0)&&json(rawResult.outputs?.events)===json(artifact)){const checked=validateOccurrences(artifact.value,{status:'confirmed'});if(checked.ok&&checked.data.events.every(event=>matchesSource(event,eventOrigin)&&eventOrigin.events?.some(parent=>json(without(event,['holderId']))===json(without(parent,['holderId'])))))proof={...eventOrigin,kind:'holder-events',events:freeze(checked.data.events)};}
  }
  if(proof)entry.artifacts.set(artifact,proof);return live(entry)?good({retained:true}):fail('RECALL_SOURCE_UNAVAILABLE','The native Recall source changed during retention.');
 }
 function presence(entry,artifact,actorId=entry.scope.actorId) {
  const proof=entry.artifacts.get(artifact),value=artifact?.value;
  if(!proofLive(entry,proof)||proof.stage!==stageOf(entry)||!['interpretation','presence'].includes(proof.kind)||!metadataFor(artifact,proof)||value.actorId!==actorId||!['present','absent','unresolved'].includes(value.status))return fail('RECALL_PRESENCE_UNVERIFIED','Presence must derive from this generationâ€™s actual scene source.');
  if(value.status==='present'){
   const mark=artifactVisibility(artifact);if(mark.kind==='hidden'||mark.kind==='actor-private'&&mark.actorId!==actorId)return fail('RECALL_PRESENCE_UNVERIFIED','Presence is restricted to another actor.');
   const quote=typeof value.evidence==='string'?value.evidence:typeof value.evidence?.text==='string'?value.evidence.text:null;
   if(!quote||!quote.trim()||!proof.text.includes(quote))return fail('RECALL_PRESENCE_UNVERIFIED','Participating actors need evidence quoted from the actual scene source.');
  }
  return proofLive(entry,proof)?good(freeze({source:proof.source,actorId,status:value.status})):fail('RECALL_PRESENCE_UNVERIFIED','Presence source changed during authorization.');
 }
 function authorizePresence(run,artifact,{actorId}={}){const entry=runs.get(run);return entry?presence(entry,artifact,actorId??entry.scope.actorId):fail('RECALL_PRESENCE_UNVERIFIED','Use current native source-derived presence.');}
 function authorizeHolderEvent(run,artifact,{actorId}={}){const entry=runs.get(run),proof=entry?.artifacts.get(artifact),event=artifact?.value,checked=validateOccurrences([event],{status:'confirmed'});if(!proofLive(entry,proof)||proof.kind!=='holder-events'||proof.stage!==stageOf(entry)||!checked.ok||!proof.events.some(value=>json(value)===json(event))||event.holderId!==actorId||!['item-used','item-mentioned'].includes(event.eventType)||event.source.sourceId!==proof.source.sourceId||event.source.revision!==proof.source.revision||event.source.watch!==proof.source.watch||event.sceneId!==proof.source.sceneId||proof.text.slice(event.position.start,event.position.end)!==event.evidence.text)return fail('RECALL_HOLDER_UNVERIFIED','Use an unchanged actual occurrence from the current ordered holder producer.');const mark=artifactVisibility(artifact);return proofLive(entry,proof)&&mark.kind!=='hidden'&&(mark.kind!=='actor-private'||mark.actorId===actorId)?good(freeze({source:proof.source,actorId,eventId:event.eventId})):fail('RECALL_HOLDER_UNVERIFIED','Holder evidence is stale or restricted to another actor.');}
 function authorizeGuidance(run,artifact){const entry=runs.get(run),proof=entry?.artifacts.get(artifact);const mark=artifactVisibility(artifact);return proofLive(entry,proof)&&proof.kind==='recall-guidance'&&mark.kind==='actor-private'&&mark.actorId===entry.scope.actorId?good({actorId:entry.scope.actorId,scope:entry.scope}):fail('RECALL_GUIDANCE_UNVERIFIED','Use the exact privately authorized Recall Guidance.');}
 function trigger(entry,node,inputs) {
  if(node.activation?.includes('keyword')){const proof=entry.artifacts.get(inputs.source),value=inputs.source?.value;if(!proofLive(entry,proof)||!metadataFor(inputs.source,proof)||value.text!==proof.text||value.watch!==(proof.source.watch??'scene-context'))return fail('RECALL_TRIGGER_UNVERIFIED','Keyword activation requires its exact current native narrative source.');}
  if(node.activation?.includes('event')){const proof=entry.artifacts.get(inputs.events);if(!proofLive(entry,proof)||!['occurrences','holder-events'].includes(proof.kind)||proof.stage!==stageOf(entry)||!occurrenceSubset(inputs.events?.value,proof,{status:'confirmed'}))return fail('RECALL_TRIGGER_UNVERIFIED','Event activation requires unchanged canonical confirmed occurrences from the actual current source.');}
  return good({verified:true});
 }
 function records(entry,artifact,memorySetId) {
  const proof=entry.artifacts.get(artifact);if(!proofLive(entry,proof)||!['file','memory'].includes(proof.kind))return fail('RECALL_RECORDS_UNVERIFIED','Recall records require a live authorized File or Memory read.');
  let value=artifact.value,original=proof.recordValue;
  const canonical=parseRecord(artifact);
  const captured=proof.canonicalRecord,project=record=>(record.payload.episodes??[]).map(episode=>({id:episode.id,text:episode.text,sourceRefs:episode.sourceRefs,actorId:record.scope.actorId,revision:String(record.store.version)}));
  if(captured)original=project(captured);
  if(canonical.ok){
   if(canonical.data.scope.actorId!==entry.scope.actorId||canonical.data.scope.chatId!==entry.scope.chatId)return fail('RECALL_ACTOR_MISMATCH','Memory belongs to another actor or chat.');
   if(!captured||json(without(canonical.data,['payload']))!==json(without(captured,['payload']))||json(without(canonical.data.payload,['episodes']))!==json(without(captured.payload,['episodes']))||(canonical.data.payload.episodes??[]).some(episode=>!(captured.payload.episodes??[]).some(originalEpisode=>json(episode)===json(originalEpisode))))return fail('RECALL_RECORDS_UNVERIFIED','Canonical Memory scope, store, evidence and selected episodes must preserve the exact captured read.');
   value=project(canonical.data);
  }
  else if(value?.targetId&&Object.hasOwn(value,'value'))value=value.value;
  if(value?.type==='recall-records')value=value.records;
  if(original?.type==='recall-records')original=original.records;
  if(!Array.isArray(value)||!Array.isArray(original)||value.some(record=>!original.some(source=>source.id===record.id&&source.actorId===record.actorId&&source.text===record.text&&Object.keys(record).every(field=>json(source[field])===json(record[field])))))return fail('RECALL_RECORDS_UNVERIFIED','Memory records cannot be invented or rewritten by source transformations.');
  const mark=artifactVisibility(artifact);if(mark.kind==='hidden'||mark.kind==='actor-private'&&mark.actorId!==entry.scope.actorId)return fail('RECALL_ACTOR_MISMATCH','Memory is private to another actor.');
  const projected=value===artifact.value?artifact:freeze({kind:'data',value,visibility:{kind:'actor-private',actorId:entry.scope.actorId}});entry.artifacts.set(projected,{...proof,recordValue:original});return good({artifact:projected,scope:entry.scope,memorySetId});
 }
 async function execute(run,node,inputs,local={}) {
  const entry=runs.get(run);
  if(!entry||!live(entry))return fail('RECALL_OWNER_MISSING','Recall requires its owned native reply or generated swipe.');
  let bound=inputs;
  if(node.operation==='recall'&&inputs.records){const checked=records(entry,inputs.records,node.memorySetId);if(checked.ok)bound={...inputs,records:checked.data.artifact};}
  const result=await executeRecallNode(node,bound,{...local,root:true,signal:entry.signal,recallState:entry.slot.state,
   authorizeRecallRecords:(artifact,request)=>{const checked=records(entry,artifact,request.memorySetId);if(!checked.ok)return checked;const verified=presence(entry,bound.presence);if(!verified.ok)return verified;const activated=trigger(entry,node,bound);if(!activated.ok)return activated;return live(entry)?good({scope:entry.scope,memorySetId:request.memorySetId}):fail('STALE_RECALL_SCOPE','Recall source changed during authorization.');},
   stageRecallClaim:(claim,activation)=>{if(!live(entry)||!entry.slot.state.checkClaim(claim,{stage:local.phase}).ok)return fail('RECALL_CLAIM_UNAUTHORIZED','Retain only this generationâ€™s exact live claim.');entry.claims.set(claim,{activation});return good({staged:true});}});
  if(!live(entry))return fail('ABORTED','Recall was cancelled without publishing private material.');const finalized=preserveArtifactPrivacy(result,bound);if(finalized.ok&&finalized.outputs?.out){const proof={entry,kind:'recall-guidance',fresh:()=>live(entry)&&[...entry.claims].every(([claim])=>entry.slot.state.checkClaim(claim).ok),source:null,producer:finalized};entry.roots.set(finalized,proof);entry.sources.add(proof);}notify();return finalized;
 }
 function fresh(run){const entry=runs.get(run);return !!entry&&live(entry)&&[...entry.sources].every(proof=>proofLive(entry,proof));}
 function hasPending(run){const entry=runs.get(run);return !!entry&&[...entry.claims.values()].some(value=>!value.consumed);}
 function succeed(run){const entry=runs.get(run);if(!entry)return good({settled:true});for(const [claim,value]of entry.claims){const result=entry.slot.state.settle(claim,{status:'succeeded'});if(!result.ok)return result;value.consumed=result.data.consumed;}notify();return good({settled:true});}
 function effects(run){const entry=runs.get(run);if(!entry)return [];
  return [...entry.claims].filter(([,value])=>!value.consumed).map(([claim,value])=>({intentId:'recall:'+ ++sequence,targetId:'recall:'+entry.scope.actorId+':'+value.activation.memorySetId,proposed:{kind:'recall'},
   preflight:()=>{if(!live(entry)||[...entry.sources].some(proof=>!proofLive(entry,proof)))return fail('STALE_RECALL_SOURCE','Recall source changed before acceptance.');const checked=entry.slot.state.checkClaim(claim);return checked.ok?good({status:'ready',applied:false,acknowledged:false}):checked;},
   commit:()=>{if(!live(entry))return fail('STALE_RECALL_SCOPE','Recall acceptance belongs to another generation.');const result=entry.slot.state.settle(claim,{status:'accepted'});if(result.ok){value.consumed=result.data.consumed;notify();}return result.ok?good({status:'confirmed',applied:result.data.consumed,acknowledged:true}):result;}}));
 }
 function releaseRun(run){const entry=runs.get(run);if(!entry||entry.closed)return;for(const [claim,value]of entry.claims)if(!value.consumed)try{entry.slot.state.releaseClaim(claim);}catch{}entry.closed=true;entry.claims.clear();entry.sources.clear();if(entry.slot.owner===entry)entry.slot.owner=null;notify();}
 function dispose(){if(disposed)return;disposed=true;for(const slot of slots.values()){if(slot.owner)releaseRun(slot.owner.run);deactivate(slot);slot.state.release();}slots.clear();selected=null;disposed=true;}
 return Object.freeze({sync,status:sync,queue,cancel,changeQueues,captureQueueCommand,resetDocument,subscribe,begin,capture,captureSourceArtifact,retain,lookup,authorizePresence,authorizeHolderEvent,authorizeGuidance,execute,fresh,hasPending,succeed,effects,releaseRun,dispose});
}
