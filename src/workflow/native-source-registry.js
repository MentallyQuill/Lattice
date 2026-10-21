import {normalizeNativeSourceMessages} from './native-source-identity.js?v=0.27.5';
import {cloneJsonValue} from './operations/json-data.js?v=0.27.5';
import {sha256Text} from './definition-data.js?v=0.27.5';
import {parseScope,canonicalSourceSetKey} from './source-manifests.js?v=0.27.5';
import {freeze} from './record-data.js?v=0.27.5';
const fail=code=>({ok:false,error:{code,message:'The native source registry requires explicit current, verified setup.'}});
const good=data=>({ok:true,data:freeze(data)});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const id=v=>typeof v==='string'&&v.length>0&&v.length<=128&&!!v.trim()&&!['__proto__','prototype','constructor'].includes(v)&&!/[\\/:\r\n]/.test(v)&&!v.includes('..');
const own=(v,k)=>{if(!plain(v))throw Error('SOURCE_REGISTRY_INVALID');const p=Object.getOwnPropertyDescriptor(v,k);if(p&&(!p.enumerable||!Object.hasOwn(p,'value')))throw Error('SOURCE_REGISTRY_INVALID');return p?.value;};
const clone=v=>{const r=cloneJsonValue(v);if(!r.ok)throw Error('SOURCE_REGISTRY_LIMIT');return r.data.value;};
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const digest=v=>sha256Text(canonical(v));
const hash=v=>typeof v==='string'&&/^sha256:[0-9a-f]{64}$/.test(v);
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
function namespace(value,maximum=256){if(!plain(value)||Reflect.ownKeys(value).length>maximum)throw Error('SOURCE_REGISTRY_INVALID');const result={};for(const key of Reflect.ownKeys(value)){if(!id(key))throw Error('SOURCE_REGISTRY_INVALID');Object.defineProperty(result,key,{value:own(value,key),enumerable:true,writable:true,configurable:true});}return result;}
function validateHeader(header,userId,chatId){
 if(!exact(header,['schemaVersion','scope','revision','branchStates'])||header.schemaVersion!==1||canonical(header.scope)!==canonical({userId,chatId})||!id(header.revision)||!plain(header.branchStates)||Object.keys(header.branchStates).length>128)throw Error('SOURCE_REGISTRY_INVALID');
 const pageIds=new Set();for(const [key,branch] of Object.entries(header.branchStates)){
  const parsed=parseScope(branch?.scope);if(!id(key)||!exact(branch,['scope','sourceEpoch','orderRevision','pageIds'])||!parsed.ok||branch.scope.userId!==userId||branch.scope.chatId!==chatId||branch.scope.actorId!==undefined||key!==(branch.scope.branchId===undefined?'unbranched':'branch-'+digest(branch.scope.branchId).slice(7))||!id(branch.sourceEpoch)||!id(branch.orderRevision)||!Array.isArray(branch.pageIds)||branch.pageIds.length>128)throw Error('SOURCE_REGISTRY_INVALID');
  for(const pageId of branch.pageIds){if(!id(pageId)||pageIds.has(pageId))throw Error('SOURCE_REGISTRY_INVALID');pageIds.add(pageId);}
 }
}
function validateRows(rows){
 const seen=new Set();let ordinal=0;for(const row of rows){
  if(!exact(row,['sourceId','adapter','immutableIdDigest','birthAnchorDigest','fingerprint','revision','selectionDigest','ordinal','tombstone'])||!id(row.sourceId)||seen.has(row.sourceId)||!id(row.adapter)||![row.immutableIdDigest,row.birthAnchorDigest].every(v=>v===null||hash(v))||![row.fingerprint,row.revision,row.selectionDigest].every(hash)||!Number.isSafeInteger(row.ordinal)||row.ordinal<0||row.ordinal>=16384||typeof row.tombstone!=='boolean'||!row.tombstone&&row.ordinal!==ordinal++)throw Error('SOURCE_REGISTRY_INVALID');seen.add(row.sourceId);
 }
}
function nativeReferences(value){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1)throw Error('SOURCE_REGISTRY_STALE');
 const refs=[];for(let i=0;i<value.length;i++){const property=Object.getOwnPropertyDescriptor(value,String(i));if(!property?.enumerable||!Object.hasOwn(property,'value')||!plain(property.value))throw Error('SOURCE_REGISTRY_STALE');refs.push(property.value);}return refs;
}
const snapshots=new WeakMap();
/** Internal reader boundary. JSON copies and objects from other modules confer no authority. */
export function inspectNativeSourceSnapshot(snapshot){
 const captured=snapshots.get(snapshot);if(!captured)return fail('SOURCE_SNAPSHOT_UNAUTHORIZED');
 const current=captured.inspect();return current?good(Object.freeze({...captured.view,currentHead:current.currentHead})):fail('SOURCE_SNAPSHOT_STALE');
}
/** Explicit metadata coordination; inspect and capture never save or verify remotely. */
export function createNativeSourceRegistry(ports){
 if(!plain(ports))throw Error('Trusted source registry ports required');
 const methods={};for(const key of ['getContext','getUserId','getBranchId','randomId','onInvalidated']){const value=own(ports,key);if(value!==undefined&&typeof value!=='function')throw Error('Trusted source registry methods required');methods[key]=value;}
 if(!methods.getContext||!methods.getUserId)throw Error('Trusted source scope required');
 const verifier=own(ports,'persistenceVerifier');if(!verifier||typeof verifier.saveAndVerify!=='function'||typeof verifier.verify!=='function')throw Error('Native persistence verifier required');
 const identityAdapter=own(ports,'identityAdapter');let adapter=null;
 if(identityAdapter!==undefined){if(!plain(identityAdapter)||!id(own(identityAdapter,'kind')))throw Error('Trusted identity adapter required');adapter={kind:identityAdapter.kind};for(const key of ['getImmutableId','getBirthAnchor']){const method=own(identityAdapter,key);if(method!==undefined&&typeof method!=='function')throw Error('Trusted identity adapter required');adapter[key]=method;}}
 const adapterDigest=(method,message)=>{const value=method?.(message);if(value===undefined||value===null)return null;if(typeof value!=='string'||!value.trim()||value.length>1024)throw Error('SOURCE_IDENTITY_AMBIGUOUS');return digest([adapter.kind,value]);};
 let released=false,version=0,ack=null,pending=null,busy=false,observed=null;
 const objects=new WeakMap();
 function read(){try{return readFrame();}catch(e){version++;ack=null;observed=null;throw e;}}
 function readFrame(){
  if(released)throw Error('SOURCE_REGISTRY_RELEASED');
  const c=methods.getContext(),userId=methods.getUserId(),chatId=c.getCurrentChatId?.()??c.chatId,branchId=methods.getBranchId?.();
  const parsed=parseScope({userId,chatId,...(branchId===undefined?{}:{branchId})});
  if(!parsed.ok||!id(userId)||!id(chatId)||branchId!==undefined&&!id(branchId)||c.groupId||!Array.isArray(c.chat)||!plain(c.chatMetadata))throw Error('SOURCE_SCOPE_UNAVAILABLE');
  const scope=parsed.data;
  if(observed&&(observed.key!==canonical(scope)||observed.chat!==c.chat||observed.metadata!==c.chatMetadata)){version++;ack=null;}
  observed={key:canonical(scope),chat:c.chat,metadata:c.chatMetadata};
  const branchKey=branchId===undefined?'unbranched':'branch-'+digest(branchId).slice(7),key=canonical(scope);
  if(c.chat.length>16384)throw Error('SOURCE_REGISTRY_CAPACITY');
  const normalized=normalizeNativeSourceMessages(c.chat);if(!normalized.ok)throw Error('SOURCE_IDENTITY_INVALID');
  const messages=nativeReferences(c.chat).map((message,index)=>({...normalized.data[index],message,adapter:adapter?.kind??'fingerprint',immutableIdDigest:adapterDigest(adapter?.getImmutableId,message),birthAnchorDigest:adapterDigest(adapter?.getBirthAnchor,message)}));
  const rawSources=own(c.chatMetadata,'latticeSources'),rawPages=own(c.chatMetadata,'latticeSourcePages'),sourceRoot=rawSources===undefined?undefined:namespace(rawSources),pageRoot=rawPages===undefined?undefined:namespace(rawPages);
  const raw=sourceRoot===undefined?undefined:own(sourceRoot,userId);let header=null,branch=null,rows=[],pages=[];
  if(raw!==undefined){header=clone(raw);validateHeader(header,userId,chatId);branch=header.branchStates[branchKey];
   if(branch){if(canonical(branch.scope)!==key||!Array.isArray(branch.pageIds)||branch.pageIds.length>128)throw Error('SOURCE_REGISTRY_INVALID');const pageNamespace=namespace(own(pageRoot,userId),16384);pages=branch.pageIds.map(pageId=>{if(!id(pageId))throw Error('SOURCE_REGISTRY_INVALID');return clone(own(pageNamespace,pageId));});
    for(const page of pages){if(!exact(page,['schemaVersion','scope','branchKey','rows'])||page.schemaVersion!==1||canonical(page.scope)!==key||page.branchKey!==branchKey||!Array.isArray(page.rows)||page.rows.length>128)throw Error('SOURCE_REGISTRY_INVALID');rows.push(...page.rows);}if(rows.length>16384)throw Error('SOURCE_REGISTRY_CAPACITY');validateRows(rows);
   }
  }
  return {c,scope,key,branchKey,chat:c.chat,metadata:c.chatMetadata,messages,header,branch,rows,pages,stamp:canonical([header,pages])};
 }
 function same(a,b){return a.key===b.key&&a.chat===b.chat&&a.metadata===b.metadata&&a.stamp===b.stamp&&a.messages.length===b.messages.length&&a.messages.every((m,i)=>m.message===b.messages[i].message&&m.fingerprint===b.messages[i].fingerprint&&m.immutableIdDigest===b.messages[i].immutableIdDigest&&m.birthAnchorDigest===b.messages[i].birthAnchorDigest);}
 function current(captured){try{return !released&&captured.version===version&&same(captured.live,read());}catch{return false;}}
 function fresh(live){return ack&&same(ack.live,live)&&ack.version===version;}
 function status(live){return {scope:live.scope,revision:live.header?.revision??null,status:pending?'pending':fresh(live)?'acknowledged':live.branch?'unverified':'setup-required',retainedSources:live.rows.length,activeSources:live.rows.filter(r=>!r.tombstone).length};}
 function reconcile(live,used,allocateNew=true){
  const active=live.rows.filter(row=>!row.tombstone),seen=new Set(),matched=[];
  const index=(values,field)=>{const result=new Map();for(const value of values){const key=value[field];if(key===null)continue;const entries=result.get(key)??[];entries.push(value);result.set(key,entries);}return result;};
  const byId=new Map(active.map(row=>[row.sourceId,row])),byFingerprint=index(active,'fingerprint');
  const anchors=Object.fromEntries(['immutableIdDigest','birthAnchorDigest'].map(field=>[field,{stored:index(active,field),live:index(live.messages,field)}]));
  for(const message of live.messages){
   const known=objects.get(message.message);let row=known?.key===live.key?byId.get(known.sourceId):undefined;
   let anchored;
   for(const field of ['immutableIdDigest','birthAnchorDigest']){if(!message[field])continue;
    const matches=anchors[field].stored.get(message[field])??[];if(matches.length>1||(anchors[field].live.get(message[field])??[]).length>1)throw Error('SOURCE_IDENTITY_AMBIGUOUS');
    if(matches[0]){if(anchored&&anchored.sourceId!==matches[0].sourceId)throw Error('SOURCE_IDENTITY_AMBIGUOUS');anchored=matches[0];}
   }
   if(row&&anchored&&row.sourceId!==anchored.sourceId)throw Error('SOURCE_IDENTITY_AMBIGUOUS');row??=anchored;
   if(!row){const matches=(byFingerprint.get(message.fingerprint)??[]).filter(row=>['immutableIdDigest','birthAnchorDigest'].every(field=>row[field]===message[field]));if(matches.length>1)throw Error('SOURCE_IDENTITY_AMBIGUOUS');row=matches[0];}
   if(row&&['immutableIdDigest','birthAnchorDigest'].some(field=>row[field]!==message[field]))throw Error('SOURCE_IDENTITY_AMBIGUOUS');
   if(row&&seen.has(row.sourceId))throw Error('SOURCE_IDENTITY_AMBIGUOUS');if(row)seen.add(row.sourceId);matched.push(row);
  }
  if(matched.some((row,i)=>!row&&!live.messages[i].immutableIdDigest&&!live.messages[i].birthAnchorDigest)&&active.some(row=>!seen.has(row.sourceId)))throw Error('SOURCE_IDENTITY_AMBIGUOUS');
  if(live.rows.length+matched.filter(row=>!row).length>16384)throw Error('SOURCE_REGISTRY_CAPACITY');
  if(!allocateNew&&matched.some(row=>!row))throw Error('SOURCE_REGISTRY_STALE');
  const next=live.messages.map((message,ordinal)=>({sourceId:matched[ordinal]?.sourceId??allocate(used),adapter:message.adapter,immutableIdDigest:message.immutableIdDigest,birthAnchorDigest:message.birthAnchorDigest,fingerprint:message.fingerprint,revision:message.revision,selectionDigest:message.selectionDigest,ordinal,tombstone:false}));
  return {active:next,rows:[...next,...live.rows.filter(row=>row.tombstone||!seen.has(row.sourceId)).map(row=>({...row,tombstone:true}))]};
 }
 function invalidate(live,rows,reason){
  if(!methods.onInvalidated)return;
  const byId=new Map(rows?.map(row=>[row.sourceId,row])??[]);
  const changes=live.rows.filter(row=>!row.tombstone).flatMap(row=>{const next=byId.get(row.sourceId);return !next||next.revision!==row.revision||next.tombstone?[{sourceId:row.sourceId,priorRevision:row.revision,nextRevision:next?.revision??null,tombstone:next?.tombstone??false}]:[];});
  for(let start=0;start<changes.length;start+=128)methods.onInvalidated(freeze({scope:{...live.scope},reason,changes:changes.slice(start,start+128)}));
 }
 function controls(raw={}){if(!plain(raw)||Reflect.ownKeys(raw).some(k=>k!=='signal'))throw Error('INVALID_SOURCE_CONTROLS');const signal=own(raw,'signal');if(signal!==undefined)Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal);if(signal?.aborted)throw Error('CANCELLED');return signal;}
 function guarded(plan,signal){if(signal?.aborted)throw Error('CANCELLED');if(!current(plan))throw Error('SOURCE_REGISTRY_STALE');}
 function allocate(used){const value=(methods.randomId??(()=>crypto.randomUUID()))();if(!id(value)||used.has(value))throw Error('SOURCE_REGISTRY_ID_COLLISION');used.add(value);return value;}
 const errorCodes=new Set(['SOURCE_REGISTRY_INVALID','SOURCE_REGISTRY_LIMIT','SOURCE_REGISTRY_RELEASED','SOURCE_REGISTRY_CAPACITY','SOURCE_SCOPE_UNAVAILABLE','SOURCE_IDENTITY_INVALID','SOURCE_IDENTITY_AMBIGUOUS','SOURCE_REGISTRY_STALE','SOURCE_REGISTRY_ID_COLLISION','SOURCE_REGISTRY_TARGET_UNAVAILABLE','CANCELLED','INVALID_SOURCE_CONTROLS']);
 const error=e=>fail(errorCodes.has(e?.message)?e.message:'SOURCE_REGISTRY_INVALID');
 async function confirm(plan,signal,save){
  try{guarded(plan,signal);const receipt=await verifier[save?'saveAndVerify':'verify'](plan.selection,{...(signal?{signal}:{})});guarded(plan,signal);
   if(!receipt.ok||receipt.data?.acknowledged!==true)return fail('PERSISTENCE_UNKNOWN');
   ack={live:plan.live,version};pending=null;
   plan.live.messages.forEach((m,i)=>objects.set(m.message,{key:plan.live.key,sourceId:plan.active[i].sourceId}));
   return good({...status(plan.live),sourceEpoch:plan.live.branch.sourceEpoch,orderRevision:plan.live.branch.orderRevision,acknowledged:true,persistence:'confirmed',...(plan.recovery?{rebuildRequired:true,priorPersistence:plan.recovery}: {})});
  }catch(e){return error(e);}
 }
 async function synchronize(command,rawControls={},reset=false){
   if(busy)return fail('SOURCE_REGISTRY_BUSY');busy=true;
   try{const signal=controls(rawControls),live=read();const cmd=clone(command);
    if(reset){if(!exact(cmd,['expectedRevision','reason','confirmRebuild'])||cmd.confirmRebuild!==true||!['identity-ambiguity','unrecoverable-pending-save'].includes(cmd.reason)||!live.branch||pending&&pending.live.key!==live.key||Boolean(pending)!==(cmd.reason==='unrecoverable-pending-save'))return fail('SOURCE_RECOVERY_REQUIRED');}
    else if(pending)return fail('PERSISTENCE_UNKNOWN');
    if(!plain(cmd)||!reset&&(!['enroll','host-change','explicit-reconcile'].includes(cmd.cause)||Object.keys(cmd).some(k=>!['cause','expectedRevision'].includes(k)))||cmd.expectedRevision!==(live.header?.revision??null))return fail('SOURCE_REGISTRY_REVISION_CONFLICT');
    if(!live.branch&&cmd.cause!=='enroll')return fail('SOURCE_REGISTRY_SETUP_REQUIRED');
    const plan={live,version,...(reset?{recovery:pending?'unknown':fresh(live)?'confirmed':'unverified'}:{})},used=new Set([...live.rows.map(row=>row.sourceId),...(live.header?[live.header.revision]:[]),...(live.branch?[live.branch.sourceEpoch,live.branch.orderRevision,...live.branch.pageIds]:[])]);let reconciled;
    if(reset){if(live.rows.length+live.messages.length>16384)throw Error('SOURCE_REGISTRY_CAPACITY');const active=live.messages.map((m,ordinal)=>({sourceId:allocate(used),adapter:m.adapter,immutableIdDigest:m.immutableIdDigest,birthAnchorDigest:m.birthAnchorDigest,fingerprint:m.fingerprint,revision:m.revision,selectionDigest:m.selectionDigest,ordinal,tombstone:false}));reconciled={active,rows:[...active,...live.rows.map(row=>({...row,tombstone:true}))]};}
    else try{reconciled=reconcile(live,used);}catch(e){if(e.message==='SOURCE_IDENTITY_AMBIGUOUS')invalidate(live,null,e.message);throw e;}
    const {rows,active}=reconciled;
    const sourceEpoch=reset?allocate(used):live.branch?.sourceEpoch??allocate(used),orderRevision=allocate(used),revision=allocate(used),pageIds=[],pages={};
    for(let start=0;start<rows.length;start+=128){const pageId=live.branch?.pageIds[pageIds.length]??allocate(used);pageIds.push(pageId);pages[pageId]=clone({schemaVersion:1,scope:live.scope,branchKey:live.branchKey,rows:rows.slice(start,start+128)});}
    const branch={scope:live.scope,sourceEpoch,orderRevision,pageIds},header=clone({schemaVersion:1,scope:{userId:live.scope.userId,chatId:live.scope.chatId},revision,branchStates:{...(live.header?.branchStates??{}),[live.branchKey]:branch}});
    guarded(plan,signal);const sourceRoot=namespace(own(live.metadata,'latticeSources')??{}),pageRoot=namespace(own(live.metadata,'latticeSourcePages')??{});
    const nextSources={...sourceRoot,[live.scope.userId]:header},nextPages={...pageRoot,[live.scope.userId]:{...namespace(own(pageRoot,live.scope.userId)??{},16384),...pages}};
    validateHeader(header,live.scope.userId,live.scope.chatId);namespace(nextSources);namespace(nextPages);namespace(nextPages[live.scope.userId],16384);
    invalidate(live,rows,'SOURCE_CHANGED');guarded(plan,signal);
    for(const key of ['latticeSources','latticeSourcePages']){const property=Object.getOwnPropertyDescriptor(live.metadata,key);if(property?(!Object.hasOwn(property,'value')||!property.writable||!property.configurable||!property.enumerable):!Object.isExtensible(live.metadata))throw Error('SOURCE_REGISTRY_TARGET_UNAVAILABLE');}
    Object.defineProperties(live.metadata,{latticeSources:{value:nextSources,enumerable:true,writable:true,configurable:true},latticeSourcePages:{value:nextPages,enumerable:true,writable:true,configurable:true}});
    version++;ack=null;plan.version=version;plan.live=read();plan.active=active;plan.selection={kind:'source-registry',branchKey:live.branchKey,pageIds};pending=plan;
    return await confirm(plan,signal,true);
   }catch(e){return error(e);}finally{busy=false;}
 }
 return Object.freeze({
  inspect(){try{return good(status(read()));}catch(e){return error(e);}},
  capture(options){try{
   const live=read();if(pending)return fail('PERSISTENCE_UNKNOWN');if(!live.branch)return fail('SOURCE_REGISTRY_SETUP_REQUIRED');if(!fresh(live))return fail('SOURCE_REGISTRY_UNVERIFIED');
   const prefixReferences=nativeReferences(options.chat);
   const signal=controls({...(options.signal?{signal:options.signal}:{})});if(typeof options.isCurrent!=='function'||options.isCurrent()!==true||!Array.isArray(options.chat)||options.chat.length>live.chat.length||prefixReferences.some((message,i)=>message!==live.messages[i].message)||canonical(parseScope(options.scope).data)!==live.key)return fail('SOURCE_REGISTRY_STALE');
   const selector=clone(options.selector),key=canonicalSourceSetKey(live.scope,selector);if(!key.ok)return key;
   const active=[...live.rows].filter(r=>!r.tombstone).sort((a,b)=>a.ordinal-b.ordinal);if(active.length!==live.messages.length)return fail('SOURCE_REGISTRY_STALE');
   const prefix=options.chat,length=prefix.length,check=options.isCurrent,allowPrefixAppend=options.allowPrefixAppend,grant={live,version};
   const inspectCurrent=()=>{try{
    if(signal?.aborted||released||prefix.length!==length||!nativeReferences(prefix).every((message,i)=>message===live.messages[i].message)||check()!==true)return null;
    let now=read();if(!same(live,now)){if(typeof allowPrefixAppend!=='function'||allowPrefixAppend()!==true)return null;now=read();}
    if(signal?.aborted||released||grant.version!==version||now.key!==live.key||now.chat!==live.chat||now.metadata!==live.metadata||now.stamp!==live.stamp||now.messages.length<length||!live.messages.slice(0,length).every((m,i)=>m.message===now.messages[i].message&&m.fingerprint===now.messages[i].fingerprint&&m.immutableIdDigest===now.messages[i].immutableIdDigest&&m.birthAnchorDigest===now.messages[i].birthAnchorDigest))return null;
    return {currentHead:length===now.messages.length&&same(live,now)};
   }catch{return null;}};
   const sourceSetId=digest(key.data),snapshotId=digest([sourceSetId,live.branch.sourceEpoch,active.slice(0,length).map(r=>[r.sourceId,r.revision])]);
   const snapshot=Object.freeze({scope:freeze({...live.scope}),revision:live.header.revision,sourceEpoch:live.branch.sourceEpoch,orderRevision:live.branch.orderRevision,sourceSetId,snapshotId});
   const view=freeze({...snapshot,selector,selectorHash:digest(selector),entries:live.messages.slice(0,length).map((m,i)=>({sourceId:active[i].sourceId,revision:active[i].revision,ordinal:i,text:m.text,role:m.role,protocol:m.protocol,name:m.name,settled:m.settled,visibility:m.visibility,visibleTo:m.visibleTo,selectionDigest:m.selectionDigest}))});
   if(!inspectCurrent())return fail('SOURCE_REGISTRY_STALE');snapshots.set(snapshot,{view,inspect:inspectCurrent});return {ok:true,data:snapshot};
  }catch(e){return error(e);}},
  synchronize:(command,controls)=>synchronize(command,controls),
  resetSourceEpoch:(command,controls)=>synchronize(command,controls,true),
  async verifyPending(rawControls={}){if(busy)return fail('SOURCE_REGISTRY_BUSY');busy=true;try{const signal=controls(rawControls);if(!pending){
    const live=read();if(!live.branch)return fail('SOURCE_REGISTRY_SETUP_REQUIRED');const matched=reconcile(live,new Set(live.rows.map(row=>row.sourceId)),false);
    if(canonical(matched.rows)!==canonical(live.rows))return fail('SOURCE_REGISTRY_STALE');
    pending={live,version,active:matched.active,selection:{kind:'source-registry',branchKey:live.branchKey,pageIds:[...live.branch.pageIds]}};
   }return await confirm(pending,signal,false);}catch(e){return error(e);}finally{busy=false;}},
  release(){released=true;version++;ack=null;}
 });
}
