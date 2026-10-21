import {inspectNativeCharacterProjection} from './native-source-projections.js?v=0.27.5';
/** Host-only bounded reader. DTOs describe sources; only registry snapshots supply authority. */
import {inspectNativeSourceSnapshot} from './native-source-registry.js?v=0.27.5';
import {cloneJsonValue} from './operations/json-data.js?v=0.27.5';
import {parseRuntimeContext} from './operations/context-data.js?v=0.27.5';
import {parseReaderCursor} from './source-manifests.js?v=0.27.5';
import {sha256Text} from './definition-data.js?v=0.27.5';
import {freeze,plain} from './record-data.js?v=0.27.5';
const pages=new WeakMap();
const fail=code=>({ok:false,error:{code,message:'Current authorized bounded source material is required.'}});
const good=data=>({ok:true,data});
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=v=>sha256Text(canonical(v));
const equal=(a,b)=>canonical(a)===canonical(b);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const pair=v=>plain(v)&&Object.keys(v).length===2&&typeof v.sourceId==='string'&&typeof v.revision==='string';
const scopeEqual=(a,b)=>equal(a,b);
const checked=value=>{const result=cloneJsonValue(value);if(!result.ok)throw Error('SOURCE_GROUP_TOO_LARGE');return freeze(value);};
function readRequest(input){
 const result=cloneJsonValue(input);if(!result.ok)throw Error('INVALID_SOURCE_REQUEST');const r=result.data.value;
 const keys=['selection','cursor','range','recentMessages','upperBoundary','keepRecentAssistantTurns','maxMessages','maxTextUnits','allowAppendRebase','confirmed'];
 if(!plain(r)||Object.keys(r).some(k=>!keys.includes(k))||!['recent','range','since-cursor','before-window'].includes(r.selection)||!integer(r.maxMessages,1,1000)||!integer(r.maxTextUnits,1,100000))throw Error('INVALID_SOURCE_REQUEST');
 if(r.recentMessages!==undefined&&!integer(r.recentMessages,0,16384)||r.keepRecentAssistantTurns!==undefined&&!integer(r.keepRecentAssistantTurns,0,8192)||r.confirmed!==undefined&&typeof r.confirmed!=='boolean'||r.allowAppendRebase!==undefined&&typeof r.allowAppendRebase!=='boolean')throw Error('INVALID_SOURCE_REQUEST');
 if(r.range!==undefined&&(!pair({sourceId:r.range?.firstSourceId,revision:r.range?.lastSourceId})||!plain(r.range)||Object.keys(r.range).length!==2))throw Error('INVALID_SOURCE_REQUEST');
 if(r.upperBoundary!==undefined&&(!plain(r.upperBoundary)||Object.keys(r.upperBoundary).length!==1||!integer(r.upperBoundary.keepRecentAssistantTurns,0,8192)))throw Error('INVALID_SOURCE_REQUEST');
 if(r.selection==='range'&&!r.range||r.selection!=='range'&&r.range||r.cursor!==undefined&&r.selection!=='since-cursor'||r.confirmed&&r.selection!=='since-cursor'||r.upperBoundary!==undefined&&r.selection!=='since-cursor'||r.keepRecentAssistantTurns!==undefined&&r.selection!=='before-window')throw Error('INVALID_SOURCE_REQUEST');
 return r;
}
/** Default invocation never obtains actor-private or confirmed-frontier authority. */
export function selectSourcePage(snapshot,request){return publicReader.selectSourcePage(snapshot,request);}
/** Constructor ports are installed by the host, never populated from node settings or JSON. */
export function createSourceReader(ports={}){
 if(!plain(ports)||Object.keys(ports).some(k=>!['getActorGrant','getConfirmedFrontier','getCharacterProjection','getTriggerCause','signal','isCurrent','exposeCursor'].includes(k))||['getActorGrant','getConfirmedFrontier','getCharacterProjection','getTriggerCause','isCurrent'].some(k=>ports[k]!==undefined&&typeof ports[k]!=='function'))throw Error('Trusted source reader ports required');
 if(ports.exposeCursor!==undefined&&typeof ports.exposeCursor!=='boolean')throw Error('Trusted source reader ports required');
 ports={...ports};
 let released=false;
 const baseCurrent=()=>{try{if(released||ports.signal?.aborted||ports.isCurrent&&ports.isCurrent()!==true){released=true;return false;}return true;}catch{released=true;return false;}};
 function select(snapshot,input){
  try{
   if(!baseCurrent())return fail('SOURCE_READER_STALE');
   const first=inspectNativeSourceSnapshot(snapshot);if(!first.ok)return first;const view=first.data,r=readRequest(input);
   const inspect=()=>{if(!baseCurrent())throw Error('SOURCE_READER_STALE');const now=inspectNativeSourceSnapshot(snapshot);if(!now.ok)throw Error(now.error.code);return now.data;};
   // Callbacks are fenced on both sides; a callback cannot smuggle a source change into a page.
   inspect();const grant=ports.getActorGrant?.(view.scope)??null;inspect();
   const grantBinding=grant===null?null:canonical([grant.actorId,grant.scope]),grantCheck=grant?.isCurrent;
   const grantBound=()=>grant===null||(grant.isCurrent===grantCheck&&canonical([grant.actorId,grant.scope])===grantBinding);
   const grantCurrent=()=>{if(grant===null)return (ports.getActorGrant?.(view.scope)??null)===null;return plain(grant)&&typeof grant.actorId==='string'&&!!grant.actorId.trim()&&scopeEqual(grant.scope,view.scope)&&typeof grantCheck==='function'&&grantBound()&&grantCheck.call(grant)===true&&ports.getActorGrant(view.scope)===grant&&grantBound();};
   if(!grantCurrent())throw Error('SOURCE_ACTOR_UNAUTHORIZED');inspect();
   inspect();const characterProjection=ports.getCharacterProjection?.()??null;inspect();const character=characterProjection?inspectNativeCharacterProjection(characterProjection):good(null);if(!character.ok)return character;
   const trigger=ports.getTriggerCause?.()??null,triggerCheck=trigger?.isCurrent,triggerCause=trigger?.cause;
   const triggerCurrent=()=>!trigger?(ports.getTriggerCause?.()??null)===null:trigger.isCurrent===triggerCheck&&trigger.cause===triggerCause&&typeof triggerCheck==='function'&&triggerCheck.call(trigger)===true&&ports.getTriggerCause()===trigger;
   if(!triggerCurrent()||trigger&&(!plain(triggerCause)||!Object.isFrozen(triggerCause)||Reflect.ownKeys(triggerCause).length!==0))throw Error('SOURCE_TRIGGER_UNAUTHORIZED');
   const current=()=>{try{inspect();if(!triggerCurrent())return false;if(!grantCurrent()||(ports.getCharacterProjection?.()??null)!==characterProjection||characterProjection&&!inspectNativeCharacterProjection(characterProjection).ok)return false;inspect();return true;}catch{return false;}};
   const roles=view.selector?.roles??['user','assistant'];
   if(!Array.isArray(roles)||roles.some(role=>!['user','assistant'].includes(role)))throw Error('INVALID_SOURCE_SELECTOR');
   const admitted=e=>e.protocol==='chat'&&e.settled&&roles.includes(e.role)&&e.visibility.kind!=='hidden'&&(e.visibility.kind==='public'||grant&&e.visibility.actorId===grant.actorId)&&(e.visibleTo===null||grant&&e.visibleTo.includes(grant.actorId));
   const scope=grant?freeze({...view.scope,actorId:grant.actorId}):view.scope;
   const sourceSetId=digest(['reader-source-set/v1',view.sourceSetId,grant?.actorId??null,roles,...(character.data?[character.data.sourceSetKey]:[])]);
   if(character.data&&!scopeEqual(character.data.scope,scope))throw Error('SOURCE_CHARACTER_UNAUTHORIZED');
   // Reconstruct this same projection over an acknowledged old prefix for cursor replay.
   function project(entries){
    const eligible=entries.filter(admitted),turns=[],units=[];let pending=[];
    const flush=()=>{for(const e of pending)units.push({entries:[e],turn:null});pending=[];};
    for(const e of entries){
     if(!admitted(e)){flush();continue;}
     if(e.role==='user'){pending.push(e);continue;}
     if(pending.length){const turn={assistantTurnId:e.sourceId,memberIds:[...pending.map(x=>x.sourceId),e.sourceId]};turns.push(turn);units.push({entries:[...pending,e],turn});pending=[];}
     else units.push({entries:[e],turn:null});
    }
    flush();return {eligible,turns,units};
   }
   const captured=project(view.entries),{eligible,units}=captured;
   let cursor=null,semantics;
   if(r.cursor!==undefined){const parsed=parseReaderCursor(r.cursor);if(!parsed.ok)throw Error('READER_CURSOR_STALE');cursor=parsed.data;const p=cursor.position;
    if(!plain(p)||Object.keys(p).sort().join('|')!==['schemaVersion','registryEpoch','selectorHash','after','prefixDigest','snapshotOrderRevision','semantics','capturedDigest'].sort().join('|')||p.schemaVersion!==1||p.registryEpoch!==view.sourceEpoch||p.selectorHash!==view.selectorHash||p.after!==null&&!pair(p.after)||typeof p.capturedDigest!=='string'||typeof p.prefixDigest!=='string'||typeof p.snapshotOrderRevision!=='string'||!plain(p.semantics)||!scopeEqual(cursor.scope,scope)||cursor.sourceSetId!==sourceSetId)throw Error('READER_CURSOR_STALE');
    semantics=p.semantics;
    if(r.confirmed!==undefined&&r.confirmed!==semantics.confirmed||r.upperBoundary!==undefined&&r.upperBoundary.keepRecentAssistantTurns!==semantics.keepRecentAssistantTurns||r.recentMessages!==undefined&&r.recentMessages!==semantics.recentMessages)throw Error('READER_CURSOR_STALE');
   }else semantics={selection:r.selection,recentMessages:r.selection==='recent'?(r.recentMessages??12):null,range:r.range??null,keepRecentAssistantTurns:r.selection==='before-window'?(r.keepRecentAssistantTurns??10):r.upperBoundary?.keepRecentAssistantTurns??null,confirmed:r.confirmed===true};
   if(!['recent','range','since-cursor','before-window'].includes(semantics.selection)||!['selection','recentMessages','range','keepRecentAssistantTurns','confirmed'].every(k=>Object.hasOwn(semantics,k))||Object.keys(semantics).length!==5||typeof semantics.confirmed!=='boolean'||semantics.recentMessages!==null&&!integer(semantics.recentMessages,0,16384)||semantics.keepRecentAssistantTurns!==null&&!integer(semantics.keepRecentAssistantTurns,0,8192))throw Error('READER_CURSOR_STALE');
   let frontier=null;
   if(semantics.confirmed){
    inspect();frontier=ports.getConfirmedFrontier?.({scope,sourceEpoch:view.sourceEpoch,selectorHash:view.selectorHash,sourceSetId})??null;inspect();
    if(!frontier)throw Error('SOURCE_FRONTIER_REQUIRED');
    if(!plain(frontier)||!scopeEqual(frontier.scope,scope)||frontier.sourceEpoch!==view.sourceEpoch||frontier.selectorHash!==view.selectorHash||frontier.sourceSetId!==sourceSetId||frontier.after!==null&&!pair(frontier.after)||typeof frontier.isCurrent!=='function'||frontier.isCurrent()!==true)throw Error('SOURCE_FRONTIER_STALE');inspect();
   }
   const frontierBinding=frontier?canonical([frontier.scope,frontier.sourceEpoch,frontier.selectorHash,frontier.sourceSetId,frontier.after]):null,frontierCheck=frontier?.isCurrent;
   const frontierBound=()=>!frontier||(frontier.isCurrent===frontierCheck&&canonical([frontier.scope,frontier.sourceEpoch,frontier.selectorHash,frontier.sourceSetId,frontier.after])===frontierBinding);
   const fullCurrent=()=>{try{if(!current())return false;if(frontier&&(!frontierBound()||frontierCheck.call(frontier)!==true||ports.getConfirmedFrontier({scope,sourceEpoch:view.sourceEpoch,selectorHash:view.selectorHash,sourceSetId})!==frontier||!frontierBound()))return false;return current();}catch{return false;}};
   const indexOfAfter=after=>{if(after===null)return -1;const i=view.entries.findIndex(e=>e.sourceId===after.sourceId&&e.revision===after.revision);if(i<0)throw Error('READER_CURSOR_STALE');return i;};
   const frontierIndex=frontier?indexOfAfter(frontier.after):-1;
   function selectCaptured({eligible,turns,units}){
    const protectedTurns=semantics.keepRecentAssistantTurns===null?[]:turns.slice(Math.max(0,turns.length-semantics.keepRecentAssistantTurns));
    const protectedIds=new Set(protectedTurns.flatMap(t=>t.memberIds));
    let selectedUnits=units;
    if(semantics.selection==='recent'){
     const count=semantics.recentMessages,start=Math.max(0,eligible.length-count),ids=new Set(eligible.slice(start).map(e=>e.sourceId));
     selectedUnits=count===0?[]:units.filter(u=>u.entries.some(e=>ids.has(e.sourceId)));
    }else if(semantics.selection==='range'){
     const range=semantics.range,a=eligible.findIndex(e=>e.sourceId===range?.firstSourceId),b=eligible.findIndex(e=>e.sourceId===range?.lastSourceId);
     if(a<0||b<a)throw Error('SOURCE_RANGE_STALE');const ids=new Set(eligible.slice(a,b+1).map(e=>e.sourceId));
     selectedUnits=units.filter(u=>u.entries.some(e=>ids.has(e.sourceId)));
     if(selectedUnits.some(u=>u.entries.some(e=>!ids.has(e.sourceId))))throw Error('SOURCE_RANGE_GROUP_SPLIT');
    }
    if(semantics.keepRecentAssistantTurns!==null)selectedUnits=selectedUnits.filter(u=>u.turn&&!u.entries.some(e=>protectedIds.has(e.sourceId)));
    if(frontier){
     if(units.some(u=>u.entries.some(e=>e.ordinal<=frontierIndex)&&u.entries.some(e=>e.ordinal>frontierIndex)))throw Error('SOURCE_FRONTIER_GROUP_SPLIT');
     selectedUnits=selectedUnits.filter(u=>u.entries.every(e=>e.ordinal>frontierIndex));
    }
    return selectedUnits;
   }
   const snapshotIdentity=selectedUnits=>digest(['reader-snapshot/v1',sourceSetId,semantics,frontier?.after??null,...(character.data?[character.data.snapshotKey]:[]),selectedUnits.flatMap(u=>u.entries.map(e=>[e.sourceId,e.revision]))]);
   let selectedUnits=selectCaptured(captured);
   const selected=selectedUnits.flatMap(u=>u.entries),snapshotId=snapshotIdentity(selectedUnits);
   const chain=[digest(['reader-prefix/v1'])];
   for(const e of view.entries)chain.push(digest([chain.at(-1),e.sourceId,e.revision]));
   const prefix=ordinal=>chain[ordinal+1],capturedDigest=chain.at(-1);
   let rebased=false;
   if(cursor){
    const i=indexOfAfter(cursor.position.after);if(prefix(i)!==cursor.position.prefixDigest)throw Error('READER_CURSOR_STALE');
    const oldLength=chain.indexOf(cursor.position.capturedDigest);
    if(oldLength<0||i>=oldLength||frontierIndex>=oldLength)throw Error('READER_CURSOR_STALE');
    // A native-prefix match proves append-only source continuity, not unchanged selection.
    // Replay the old capture with these exact settings/current frontier before rebasing.
    try{
     const prior=oldLength===view.entries.length?captured:project(view.entries.slice(0,oldLength));
     if(snapshotIdentity(selectCaptured(prior))!==cursor.snapshotId)throw Error('READER_CURSOR_STALE');
    }catch{throw Error('READER_CURSOR_STALE');}
    if(oldLength!==view.entries.length){
     if(!r.allowAppendRebase)throw Error('READER_CURSOR_STALE');rebased=true;
    }else if(cursor.position.snapshotOrderRevision!==view.orderRevision)throw Error('READER_CURSOR_STALE');
    if(units.some(u=>u.entries.some(e=>e.ordinal<=i)&&u.entries.some(e=>e.ordinal>i)))throw Error('READER_CURSOR_STALE');
    selectedUnits=selectedUnits.filter(u=>u.entries.every(e=>e.ordinal>i));
   }
   const aggregateVisibility=entries=>entries.some(e=>e.visibility.kind==='actor-private'||e.visibleTo!==null)?{kind:'actor-private',actorId:grant.actorId}:{kind:'public'};
   // Metadata describing private selected sources is private even when this particular page is public.
   const characterRecords=character.data?.entries??[];
   const visibility=characterRecords.some(e=>e.visibility.kind==='actor-private')?{kind:'actor-private',actorId:grant.actorId}:aggregateVisibility(eligible);
   const characterUnits=characterRecords.reduce((total,e)=>total+e.text.length,0);
   function build(chosen,complete){
    const entries=chosen.flatMap(u=>u.entries),last=entries.at(-1),after=last?{sourceId:last.sourceId,revision:last.revision}:cursor?.position.after??null;
    const nextCursor={type:'reader-cursor',schemaVersion:1,scope,sourceSetId,snapshotId,position:{schemaVersion:1,registryEpoch:view.sourceEpoch,selectorHash:view.selectorHash,after,prefixDigest:prefix(indexOfAfter(after)),snapshotOrderRevision:view.orderRevision,semantics,capturedDigest}};
    const ref=e=>({sourceId:e.sourceId,revision:e.revision,kind:'chat-message',scope,span:{start:0,end:e.text.length,unit:'utf16'}});
    const records=[...characterRecords,...entries.map(e=>({id:e.sourceId,revision:e.revision,scope,sourceRefs:[ref(e)],visibility:e.visibleTo!==null?{kind:'actor-private',actorId:grant.actorId}:e.visibility,text:e.text}))];
    const context={kind:'context',messages:[...characterRecords.map(e=>({id:e.id,role:'system',text:e.text,sourceRefs:e.sourceRefs,visibility:e.visibility})),...entries.map(e=>({id:e.sourceId,role:e.role,text:e.text,sourceRefs:[ref(e)],visibility:e.visibleTo!==null?{kind:'actor-private',actorId:grant.actorId}:e.visibility}))],visibility};
    if(!parseRuntimeContext(context).ok)throw Error('SOURCE_GROUP_TOO_LARGE');
    const manifest={type:'source-manifest',schemaVersion:1,scope,sourceSetId,snapshotId,completeness:complete?'complete':'page',entries:records.map(e=>({id:e.id,revision:e.revision,sourceRefs:e.sourceRefs})),continuation:complete?null:nextCursor};
    const report={schemaVersion:1,recordType:'source-reader-report',status:records.length?'complete':'empty',pageMessages:records.length,selectedMessages:selected.length+characterRecords.length,sourceSetMessages:eligible.length+characterRecords.length,completeness:manifest.completeness,rebased,actualCalls:0,networkReads:0,deletionEvidence:false};
    const outputs={out:context,records:{kind:'data',value:records,visibility},manifest:{kind:'data',value:manifest,visibility},cursor:{kind:'data',value:nextCursor,visibility},report:{kind:'data',value:report,visibility}};
    if(ports.exposeCursor===false)delete outputs.cursor;
    for(const output of Object.values(outputs))checked(output);
    const groups=chosen.filter(u=>u.turn).map(u=>u.turn),paired=new Set(groups.flatMap(g=>g.memberIds));
    return {outputs:freeze(outputs),mapping:freeze(records.map(record=>{const native=entries.find(e=>e.sourceId===record.id);return {memberId:record.id,revision:record.revision,sourceRefs:record.sourceRefs,visibility:record.visibility,...(native?{sourceOrder:{messageOrdinal:native.ordinal,orderRevision:view.orderRevision}}:{})};})),groups:freeze(groups),unpairedMemberIds:freeze([...characterRecords.map(e=>e.id),...entries.filter(e=>!paired.has(e.sourceId)).map(e=>e.sourceId)])};
   }
   if(characterRecords.length>r.maxMessages||characterUnits>r.maxTextUnits)throw Error('SOURCE_GROUP_TOO_LARGE');
   let chosen=[],built=null,totalUnits=characterUnits;
   for(const unit of selectedUnits){
    const size=unit.entries.reduce((n,e)=>n+e.text.length,0);
    if(characterRecords.length+chosen.reduce((n,u)=>n+u.entries.length,0)+unit.entries.length>r.maxMessages||totalUnits+size>r.maxTextUnits){if(!chosen.length)throw Error('SOURCE_GROUP_TOO_LARGE');break;}
    try{const candidate=build([...chosen,unit],chosen.length+1===selectedUnits.length);chosen.push(unit);totalUnits+=size;built=candidate;}
    catch(e){if(e.message!=='SOURCE_GROUP_TOO_LARGE'||!chosen.length)throw e;break;}
   }
   if(!built)built=build([],true);
   if(!fullCurrent())throw Error('SOURCE_READER_STALE');
   const result=freeze({ok:true,outputs:built.outputs});const page=freeze({outputs:built.outputs,result});
   pages.set(page,{revoked:false,current:fullCurrent,inspectNative:()=>inspectNativeSourceSnapshot(snapshot),view:freeze({scope,sourceEpoch:view.sourceEpoch,selectorHash:view.selectorHash,sourceSetId,snapshotId,...(trigger?{triggerCause}:{}),mapping:built.mapping,groups:built.groups,unpairedMemberIds:built.unpairedMemberIds,outputs:built.outputs,result})});
   return good(page);
  }catch(e){return fail(typeof e?.message==='string'&&/^[A-Z_]+$/.test(e.message)?e.message:'SOURCE_READER_FAILED');}
 }
 return Object.freeze({selectSourcePage:select,release(){released=true;}});
}
const publicReader=createSourceReader();
/** Internal, bounded exact mapping only. The page brand and freshness cannot be reconstructed from JSON. */
export function inspectSourcePage(page){const entry=pages.get(page);if(!entry)return fail('SOURCE_PAGE_UNAUTHORIZED');if(entry.revoked||!entry.current()){entry.revoked=true;return fail('SOURCE_PAGE_STALE');}const native=entry.inspectNative();if(!native.ok)return native;return good(Object.freeze({...entry.view,currentHead:native.data.currentHead}));}
