import {prepareDocumentCheckpoint,validateDocumentHistory} from './document-history.js?v=0.29.0';
import {validChatSourceBinding} from './chat-prefix-binding.js?v=0.29.0';
import {cloneJsonValue} from './operations/json-data.js?v=0.29.0';

/** Pure accepted-write projection. Call only within the backend's checked settlement. */
export async function prepareAcceptedFileMaintenance(snapshot,{scope,visibility,historyHandling,previousContent}={}){
    if(historyHandling!==undefined&&!['replace','append'].includes(historyHandling))return {ok:false,error:{code:'INVALID_FILE_HANDLING',message:'Choose Replace or Append.'}};
    let value;try{if(snapshot.format==='json')value=JSON.parse(snapshot.content);}catch{}
    const clock=!!value?.clockId, outcomes=Array.isArray(value)&&value.length>0&&value.every(item=>item?.recordType==='random-outcome');
    const needed=snapshot.receipts.length>=224||clock&&((value.acceptedTimeAdvances?.length??0)>=24||(value.settledTimeEventIds?.length??0)>=768)||outcomes&&(value.length>=96||new TextEncoder().encode(snapshot.content).byteLength>=131072)||historyHandling==='replace'&&(clock||outcomes);
    if(!needed)return {ok:true,data:{content:snapshot.content,receipts:snapshot.receipts,history:snapshot.history??{schemaVersion:1,epoch:0,head:null},pages:{}}};
    let retainedOutcomes=null,checkpointSnapshot=snapshot;
    if(outcomes&&historyHandling==='replace'&&typeof previousContent==='string'){let previous;try{previous=JSON.parse(previousContent);}catch{}if(Array.isArray(previous)){const priorIds=new Set(previous.map(item=>item?.outcomeId));retainedOutcomes=value.filter(item=>!priorIds.has(item.outcomeId));checkpointSnapshot={...snapshot,content:JSON.stringify(value.filter(item=>priorIds.has(item.outcomeId)))};}}
    const prepared=await prepareDocumentCheckpoint(checkpointSnapshot,{scope,visibility,checkpointId:'checkpoint:'+crypto.randomUUID()});
    if(!prepared.ok)return prepared;
    if(!Object.values(prepared.data.counts).some(count=>count>0))return {ok:true,data:{content:snapshot.content,receipts:snapshot.receipts,history:snapshot.history??{schemaVersion:1,epoch:0,head:null},pages:{}}};
    return {ok:true,data:{content:retainedOutcomes?JSON.stringify(retainedOutcomes):prepared.data.content,receipts:[],history:prepared.data.history,pages:prepared.data.pages}};
}

/** Trusted host branch hook only. This pure value grants no destination or write authority. */
export async function prepareTrustedBranchSnapshot({snapshot:raw,pages,branchScope,branchBinding,visibility}){
    const checked=cloneJsonValue(raw),scope=cloneJsonValue(branchScope);
    const fail=(code,message)=>({ok:false,error:{code,message}});
    if(!checked.ok||!scope.ok)return fail('INVALID_BRANCH_STATE','Use a captured, bounded branch state.');
    const snapshot=checked.data.value,destination=scope.data.value,source=snapshot?.scope;
    if(!source||!destination||source.userId!==destination.userId||source.chatId===destination.chatId||typeof destination.chatId!=='string'||!destination.chatId||source.actorId!==destination.actorId||visibility?.kind==='actor-private'&&visibility.actorId!==destination.actorId||snapshot.pending||snapshot.copiedScope)return fail('INVALID_BRANCH_STATE','A branch requires fresh same-owner authority and unchanged actor privacy.');
    const capturedBinding=snapshot.branchBinding;
    if(!validChatSourceBinding(capturedBinding)||!validChatSourceBinding(branchBinding)||capturedBinding.messageCount!==branchBinding.messageCount||capturedBinding.prefixHash!==branchBinding.prefixHash)return fail('BRANCH_POINT_UNAVAILABLE','No verified canonical state is retained at this exact branch point.');
    const history=await validateDocumentHistory({targetId:snapshot.targetId,scope:source,history:snapshot.history,pages});if(!history.ok)return history;
    if(history.data.privateActorIds.some(actor=>actor!==destination.actorId))return fail('PRIVATE_DESTINATION','The branch must retain its original actor privacy.');
    const allowed=mark=>mark.kind==='public'||visibility?.kind==='hidden'||mark.kind==='actor-private'&&visibility?.kind==='actor-private'&&mark.actorId===visibility.actorId;
    if(!allowed(history.data.visibility))return fail('PRIVATE_DESTINATION','Branch history cannot widen its visibility.');
    const rebased={};let head=null,epoch=0;
    // Parent receipts authorize only the parent. Draw/turn/progression identities remain intact.
    for(const page of [...history.data.pages].reverse())if(page.kind!=='receipts'){
        const pageId='archive:'+crypto.randomUUID();epoch++;
        rebased[pageId]={...page,pageId,scope:destination,previous:head,epoch,checkpointId:'branch:'+crypto.randomUUID()};head=pageId;
    }
    let content=snapshot.content;
    if(snapshot.format==='json'){let value;try{value=JSON.parse(content);}catch{}if(value?.historyCheckpoint){value.historyCheckpoint={targetId:snapshot.targetId,epoch};content=JSON.stringify(value);}}
    return {ok:true,data:{snapshot:{targetId:snapshot.targetId,scope:destination,revision:0,format:snapshot.format,content,receipts:[],branchBinding:structuredClone(branchBinding),...(snapshot.sourceBinding?{sourceBinding:snapshot.sourceBinding}:{}),history:{schemaVersion:1,epoch,head}},pages:rebased,visibility}};
}
