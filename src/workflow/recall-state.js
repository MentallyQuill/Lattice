import { cloneJsonValue, stringifyJsonValue } from './operations/json-data.js?v=0.27.2';
import { own, plain, freeze } from './record-data.js?v=0.27.2';
const fail=(code,message)=>({ok:false,error:{code,message}});
const good=data=>({ok:true,data:freeze(data)});
const id=value=>typeof value==='string'&&!!value.trim()&&value.length<=256;
const exact=(value,keys,required=keys)=>plain(value)&&Object.keys(value).every(key=>keys.includes(key))&&required.every(key=>Object.hasOwn(value,key));
const checked=raw=>{const result=cloneJsonValue(raw);return result.ok?result.data.value:null;};
const eventId=value=>typeof value==='string'&&!!value.trim()&&value.length<=2048;
const canonical=value=>{const result=stringifyJsonValue(value);return result.ok?result.data.text:null;};
const targets=['reply','swipe','both'],uses=['next-match','one-per-type','until-disarmed'];
const allows=(target,kind)=>target==='both'||target===kind;
export function validateRecallScope(raw){const value=checked(raw);return exact(value,['userId','chatId','workflowId','actorId'])&&Object.values(value).every(id)?good({userId:value.userId,chatId:value.chatId,workflowId:value.workflowId,actorId:value.actorId}):fail('INVALID_RECALL_SCOPE','Recall requires a checked user, chat, workflow and actor scope.');}
export function validateRecallQueueProposal(raw){
 const value=checked(raw);
 if(!exact(value,['schemaVersion','type','actorId','memorySetId','target','uses','consumeOn','hotkey'])||value.schemaVersion!==1||value.type!=='recall-arm-proposal'||!id(value.actorId)||!id(value.memorySetId)||!targets.includes(value.target)||!uses.includes(value.uses)||!['success','accepted'].includes(value.consumeOn))return fail('INVALID_RECALL_QUEUE','Use a bounded recall proposal with explicit target and consumption policy.');
 const hotkey=value.hotkey;
 if(!exact(hotkey,['code','ctrl','alt','shift','meta'])||typeof hotkey.code!=='string'||!(/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/u).test(hotkey.code)||['ctrl','alt','shift','meta'].some(key=>typeof hotkey[key]!=='boolean'))return fail('INVALID_RECALL_HOTKEY','Select a physical key with Control, Alt or Meta, or a function key.');
 if(hotkey.code==='KeyR')return fail('RECALL_HOTKEY_CONFLICT','R is reserved for Run to here. Choose a different key.');
 if(!hotkey.ctrl&&!hotkey.alt&&!hotkey.meta&&!/^F/u.test(hotkey.code))return fail('INVALID_RECALL_HOTKEY','Select a physical key with Control, Alt or Meta, or a function key.');
 return good({schemaVersion:1,type:'recall-arm-proposal',actorId:value.actorId,memorySetId:value.memorySetId,target:value.target,uses:value.uses,consumeOn:value.consumeOn,hotkey:{code:hotkey.code,ctrl:hotkey.ctrl,alt:hotkey.alt,shift:hotkey.shift,meta:hotkey.meta}});
}
function automaticTrigger(raw){const value=checked(raw);return exact(value,['kind','sourceId','revision','eventIds'])&&['keyword','event','character'].includes(value.kind)&&id(value.sourceId)&&id(value.revision)&&Array.isArray(value.eventIds)&&value.eventIds.length<=64&&value.eventIds.every(eventId)&&new Set(value.eventIds).size===value.eventIds.length?good(value):fail('INVALID_RECALL_TRIGGER','Recall activation needs bounded distinct source and event identities.');}
const generationEnvelope=value=>exact(value,['generationId','kind','stage','newlyGenerated'])&&id(value.generationId)&&['reply','swipe'].includes(value.kind)&&['pre','post'].includes(value.stage)&&typeof value.newlyGenerated==='boolean';
function validateAuthority(raw){
 const value=checked(raw);if(!exact(value,['scope','generation']))return fail('INVALID_RECALL_AUTHORITY','Return one bounded own-data scope and owned generation snapshot.');
 const scope=validateRecallScope(value.scope);if(!scope.ok)return scope;
 if(value.generation!==null&&!generationEnvelope(value.generation))return fail('INVALID_RECALL_GENERATION','The coherent authority needs a checked generation envelope or no active generation.');
 return good({scope:scope.data,generation:value.generation});
}
/** The trusted callback returns one coherent owner snapshot; portable DTOs never restore live authority. */
export function createRecallState(ports){
 if(!exact(ports,['getAuthority','signal'],['getAuthority'])||typeof own(ports,'getAuthority')!=='function')return fail('INVALID_RECALL_PORTS','Bind one trusted coherent scope and owned generation authority callback.');
 const getAuthority=own(ports,'getAuthority'),signal=own(ports,'signal');let released=false;
 const live=()=>released||signal?.aborted?fail('RECALL_STATE_RELEASED','The scoped recall state has been released.'):null;
 const readAuthority=()=>{const before=live();if(before)return before;let result;try{result=validateAuthority(getAuthority());}catch{return fail('RECALL_AUTHORITY_UNAVAILABLE','The trusted coherent Recall authority is unavailable.');}const after=live();return after??result;};
 const initial=readAuthority();if(!initial.ok)return initial;
 const scope=initial.data.scope,scopeKey=canonical(scope),requests=new Map(),claims=new Map(),claimAuthority=new WeakMap();let sequence=0;
 const authority=()=>{const result=readAuthority();if(!result.ok)return result;return canonical(result.data.scope)===scopeKey?result:fail('STALE_RECALL_SCOPE','The recall user, chat, workflow or actor changed.');};
 const current=()=>{const result=authority();return result.ok?good(scope):result;};
 // Every guard after the authority callback is local. No later callback can invalidate another facet.
 function liveClaim(entry){
  const available=live();if(available)return available;
  if(claims.get(entry.key)!==entry||['failed','cancelled'].includes(entry.status))return fail('RECALL_CLAIM_CLOSED','This activation was released without consumption.');
  const request=entry.request;
  if(!entry.consumed&&request&&(requests.get(request.requestId)!==request||!request.queued||!request.pending.has(entry.key)||!request.remaining[entry.activation.generationType]))return fail('RECALL_CLAIM_CLOSED','The exact queued allowance is no longer reserved for this activation.');
  return null;
 }
 function claimGeneration(entry,generation,options={}){
  if(generation===null)return fail('INVALID_RECALL_GENERATION','No owned generation is available for this Recall claim.');
  if(generation.generationId!==entry.activation.generationId||generation.kind!==entry.activation.generationType||generation.newlyGenerated!==true||options.stage!==undefined&&generation.stage!==options.stage)return fail('STALE_RECALL_GENERATION','The owned generation changed while Recall was pending.');
  return null;
 }
 const requestView=request=>({requestId:request.requestId,scope,...request.proposal,queued:request.queued,remaining:{...request.remaining},pendingGenerationIds:[...request.pending].map(key=>claims.get(key)?.activation.generationId).filter(Boolean),pendingGenerationCount:request.pending.size,pendingState:request.pending.size?([...request.pending].some(key=>claims.get(key)?.status==='reserved')?'generation':'acceptance'):null});
 const policy=proposal=>canonical(Object.fromEntries(['actorId','memorySetId','target','uses','consumeOn'].map(key=>[key,proposal[key]])));
 function changeQueues(raw){
  const fresh=authority();if(!fresh.ok)return fresh;const batch=checked(raw);
  if(!exact(batch,batch?.action==='queue'?['action','proposals']:['action','memorySetIds'])||!['queue','cancel'].includes(batch.action))return fail('INVALID_RECALL_QUEUE','Use a bounded queue or cancellation batch.');
  const values=batch.action==='queue'?batch.proposals:batch.memorySetIds;
  if(!Array.isArray(values)||values.length>1000)return fail('INVALID_RECALL_QUEUE','Use at most 1000 selected nodes in a recall batch.');
  const unique=new Map();
  for(const value of values){
   if(batch.action==='cancel'){if(!id(value))return fail('INVALID_RECALL_QUEUE','Select valid memory sets to cancel.');unique.set(value,null);continue;}
   const result=validateRecallQueueProposal(value);if(!result.ok)return result;const proposal=result.data;
   if(proposal.actorId!==scope.actorId)return fail('RECALL_ACTOR_MISMATCH','Queue only the actor authorized by this recall session.');
   const previous=unique.get(proposal.memorySetId);if(previous&&policy(previous)!==policy(proposal))return fail('RECALL_QUEUE_CONFLICT','Matching Recall Shortcuts use different policies. Make their target, repetition, and consumption settings match.');
   unique.set(proposal.memorySetId,proposal);
  }
  const additions=[];
  if(batch.action==='queue')for(const [memorySetId,proposal]of unique){const existing=[...requests.values()].find(entry=>entry.queued&&entry.proposal.memorySetId===memorySetId);if(existing){if(policy(existing.proposal)!==policy(proposal))return fail('RECALL_QUEUE_CONFLICT','Cancel the existing request before changing its target or policy.');}else additions.push(proposal);}
  const reclaimable=[...requests.values()].filter(entry=>!entry.queued&&!entry.pending.size);
  if(requests.size+additions.length-reclaimable.length>64)return fail('RECALL_QUEUE_LIMIT','This session reached its bounded request limit. Cancel unused requests before adding more.');
  const available=live();if(available)return available;
  const changed=[];
  if(batch.action==='queue'){
   let remove=Math.max(0,requests.size+additions.length-64);for(const entry of reclaimable){if(remove--<=0)break;requests.delete(entry.requestId);}
   for(const proposal of additions){for(const old of requests.values())if(!old.queued&&!old.pending.size&&old.proposal.memorySetId===proposal.memorySetId)requests.delete(old.requestId);const entry={requestId:'recall-request:'+ ++sequence,proposal,queued:true,remaining:{reply:allows(proposal.target,'reply'),swipe:allows(proposal.target,'swipe')},pending:new Set()};requests.set(entry.requestId,entry);changed.push(proposal.memorySetId);}
  }else for(const memorySetId of unique.keys())for(const entry of requests.values())if(entry.queued&&entry.proposal.memorySetId===memorySetId){cancelEntry(entry);changed.push(memorySetId);break;}
  return good({changedMemorySetIds:changed});
 }
 function queue(raw){const result=changeQueues({action:'queue',proposals:[raw]});if(!result.ok)return result;const proposal=validateRecallQueueProposal(raw);return proposal.ok?good(requestView([...requests.values()].find(entry=>entry.queued&&entry.proposal.memorySetId===proposal.data.memorySetId))):proposal;}
 const skip=(code,message,status='skipped')=>good({status,reason:{code,message}});
 function activate(raw){
  const fresh=authority();if(!fresh.ok)return fresh;const request=checked(raw);
  if(!exact(request,['actorId','memorySetId','target','automatic'],['actorId','memorySetId','target'])||request.actorId!==scope.actorId||!id(request.memorySetId)||!targets.includes(request.target))return fail('INVALID_RECALL_ACTIVATION','Recall activation must match the authorized actor and memory set.');
  let automatic;if(Object.hasOwn(request,'automatic')){const result=automaticTrigger(request.automatic);if(!result.ok)return result;automatic=result.data;}
  const generation=fresh.data.generation;if(generation===null)return fail('INVALID_RECALL_GENERATION','Recall activation requires an owned reply or generated-swipe operation.');
  if(!generation.newlyGenerated||!allows(request.target,generation.kind))return skip('RECALL_TARGET_INELIGIBLE','This operation is not a newly generated eligible recall target.');
  const key=canonical([scope.userId,scope.chatId,scope.workflowId,scope.actorId,request.memorySetId,generation.generationId]);
  if(claims.has(key))return skip('RECALL_ALREADY_ACTIVATED','This memory set already activated for this owned generation.');
  const queued=[...requests.values()].find(entry=>entry.queued&&entry.proposal.memorySetId===request.memorySetId&&entry.remaining[generation.kind]);
  if(queued&&queued.pending.size&&queued.proposal.uses!=='until-disarmed')return skip('RECALL_USE_RESERVED','A matching queued allowance is reserved by another generation.','unresolved');
  if(!queued&&!automatic)return skip('RECALL_NOT_QUEUED','No matching queue or automatic activation is available.');
  if(claims.size>=1024)return fail('RECALL_HISTORY_LIMIT','The scoped activation history reached its bound; start a fresh session explicitly.');
  const available=live();if(available)return available;
  const claim=Object.freeze({claimId:'recall-claim:'+ ++sequence}),activation=freeze({schemaVersion:1,type:'recall-activation',activationId:key,scope,memorySetId:request.memorySetId,generationId:generation.generationId,generationType:generation.kind,stage:generation.stage,origin:queued?'manual':automatic.kind,...(automatic?{sourceId:automatic.sourceId,revision:automatic.revision,eventIds:automatic.eventIds}:{}),...(queued?{requestId:queued.requestId}:{})});
  const entry={key,claim,activation,request:queued,consumeOn:queued?.proposal.consumeOn??'accepted',status:'reserved',consumed:false};claims.set(key,entry);claimAuthority.set(claim,entry);queued?.pending.add(key);
  return {ok:true,data:{status:'activated',activation,claim}};
 }
 function consume(entry){if(entry.consumed)return;entry.consumed=true;const request=entry.request;if(!request)return;request.pending.delete(entry.key);if(request.proposal.uses==='next-match')request.remaining={reply:false,swipe:false};else if(request.proposal.uses==='one-per-type')request.remaining[entry.activation.generationType]=false;request.queued=request.queued&&(request.proposal.uses==='until-disarmed'||request.remaining.reply||request.remaining.swipe);}
 function checkClaim(claim,options={}){
  const entry=claim&&typeof claim==='object'?claimAuthority.get(claim):undefined;if(!entry)return fail('RECALL_CLAIM_UNAUTHORIZED','Use the exact live activation claim.');
  const checkedOptions=checked(options);if(!exact(checkedOptions,['stage'],[])||checkedOptions.stage!==undefined&&!['pre','post'].includes(checkedOptions.stage))return fail('INVALID_RECALL_GENERATION','Use a supported Recall stage.');
  const fresh=authority();if(!fresh.ok)return fresh;
  const open=liveClaim(entry);if(open)return open;const owner=claimGeneration(entry,fresh.data.generation,checkedOptions);return owner??good(entry.activation);
 }
 function settle(claim,raw){
  const entry=claim&&typeof claim==='object'?claimAuthority.get(claim):undefined;if(!entry)return fail('RECALL_CLAIM_UNAUTHORIZED','Settle the exact live claim retained by the trusted host.');
  const outcome=checked(raw);if(!exact(outcome,['status'])||!['succeeded','accepted','failed','cancelled'].includes(outcome.status))return fail('INVALID_RECALL_SETTLEMENT','Use an explicit successful, accepted, failed or cancelled outcome.');
  const fresh=authority();if(!fresh.ok)return fresh;
  if(['failed','cancelled'].includes(entry.status))return entry.status===outcome.status?good({status:entry.status,consumed:false}):fail('RECALL_CLAIM_CLOSED','This unsuccessful activation claim has closed.');
  const open=liveClaim(entry);if(open)return open;
  if(['succeeded','accepted'].includes(outcome.status)){const owner=claimGeneration(entry,fresh.data.generation);if(owner)return owner;}
  if(entry.status==='accepted'||entry.consumed)return good({status:entry.status,consumed:entry.consumed});
  entry.status=outcome.status;
  if(['failed','cancelled'].includes(outcome.status)){entry.request?.pending.delete(entry.key);claims.delete(entry.key);return good({status:entry.status,consumed:false});}
  if(outcome.status==='accepted'||entry.consumeOn==='success')consume(entry);
  return good({status:entry.status,consumed:entry.consumed});
 }
 // Trusted exact-token cleanup can only revoke; it cannot spend or grant authority.
 function releaseClaim(claim){const entry=claim&&typeof claim==='object'?claimAuthority.get(claim):undefined;if(!entry)return fail('RECALL_CLAIM_UNAUTHORIZED','Release the exact live claim retained by the trusted host.');if(entry.consumed)return good({status:entry.status,consumed:true});if(claims.get(entry.key)===entry){entry.request?.pending.delete(entry.key);claims.delete(entry.key);entry.status='cancelled';}return good({status:entry.status,consumed:false});}
 function cancelEntry(entry){entry.queued=false;entry.remaining={reply:false,swipe:false};for(const key of entry.pending){const claim=claims.get(key);if(claim){claim.status='cancelled';claims.delete(key);}}entry.pending.clear();}
 function cancel(memorySetId){const key=requests.get(memorySetId)?.proposal.memorySetId??memorySetId;const result=changeQueues({action:'cancel',memorySetIds:[key]});if(!result.ok)return result;const entry=[...requests.values()].find(value=>value.proposal.memorySetId===key);return good(entry?requestView(entry):{memorySetId:key,queued:false});}
 const inspect=()=>{const fresh=authority();return fresh.ok?good({scope,requests:[...requests.values()].map(requestView),activationCount:claims.size}):fresh;};
 const release=()=>{released=true;requests.clear();claims.clear();};
 return {ok:true,data:Object.freeze({current,queue,changeQueues,activate,checkClaim,settle,releaseClaim,cancel,inspect,release})};
}
