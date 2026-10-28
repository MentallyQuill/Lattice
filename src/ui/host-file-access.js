import {createFileMetadataBlobs} from '../workflow/file-metadata-blobs.js?v=0.29.0';
import {validChatSourceBinding} from '../workflow/chat-prefix-binding.js?v=0.29.0';
import {inspectDocumentHistory} from '../workflow/document-history.js?v=0.29.0';
import {createNodeFileAccess} from './node-file-access.js?v=0.29.0';
import {cloneServerFileData} from './server-file-access.js?v=0.29.0';
import {sha256Text} from '../workflow/definition-data.js?v=0.29.0';
const fail=(code,message)=>({ok:false,error:{code,message}});
const formats={text:'.txt',json:'.json',jsonl:'.jsonl',markdown:'.md',csv:'.csv'};
const id=value=>typeof value==='string'&&value.trim().length>0&&value.length<=256;
const hash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const validRevision=value=>id(value)||Number.isSafeInteger(value)&&value>=0;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const coordinators=new Map();
const scopeKey=(scope,targetId)=>JSON.stringify([scope.userId,scope.chatId,scope.actorId??null,targetId]);
/** Native checked metadata machinery backed by authenticated host files, never browser handle persistence. */
function createUserHostFileAccess({store,getUserId}={}){
 const user=()=>{try{return getUserId?.()??null;}catch{return null;}};
 const owner=user(),listeners=new Set(),handles=new Map();let rows=[],revision=null,issue=null,selection=null,garbageNames=[];
 const current=()=>id(owner)&&user()===owner;
 const changed=()=>{for(const listener of listeners)try{listener();}catch{}};
 const assertCurrent=()=>{if(!current())throw Object.assign(Error('The SillyTavern user changed.'),{code:'STALE_FILE_SCOPE'});};
 function handle(hostName,name){
  const key=JSON.stringify([hostName,name]);if(handles.has(key))return handles.get(key);
  let baseline=null;
  const result={kind:'file',name,hostName,
   queryPermission:async()=>current()?'granted':'denied',
   isSameEntry:async other=>other?.hostName===hostName,
   async getFile(){assertCurrent();const read=await store.read(hostName);assertCurrent();if(!read.ok)throw Object.assign(Error(read.error.message),read.error);baseline=read.data.revision;if(!read.data.exists)throw Object.assign(Error('Missing host file'),{name:'NotFoundError'});return {size:new TextEncoder().encode(read.data.content).byteLength,text:async()=>read.data.content};},
   async createWritable(){assertCurrent();const expectedRevision=baseline;let content,aborted=false;return {async write(value){assertCurrent();content=value;},async abort(){aborted=true;},async close(){assertCurrent();if(aborted)return;const saved=await store.write({name:hostName,expectedRevision,content,intentId:crypto.randomUUID()});assertCurrent();if(!saved.ok)throw Object.assign(Error(saved.error.message),saved.error);baseline=saved.data.revision;}};},
  };handles.set(key,result);return result;
 }
 const blobCache=new Set();
 const blobs=createFileMetadataBlobs({async read(name){const read=await store.read(name);assertCurrent();if(!read.ok||!read.data.exists)throw Error('Missing file metadata');return read.data.content;},async write(name,content){if(name.startsWith('archive-')&&blobCache.has(name))return;const existing=await store.read(name);assertCurrent();if(!existing.ok)throw Error('Cannot read file metadata');if(existing.data.exists){if(existing.data.content!==content)throw Error('Immutable metadata conflict');}else{const saved=store.writeImmutable?await store.writeImmutable(name,content):await store.write({name,expectedRevision:null,content,intentId:sha256Text(content)});assertCurrent();if(!saved.ok)throw Error('Cannot preserve file metadata');}if(name.startsWith('archive-'))blobCache.add(name);}});
 const persistence={
  async load(){
   assertCurrent();const loaded=await store.read('node-bindings.json');assertCurrent();if(!loaded.ok)throw Object.assign(Error(loaded.error.message),loaded.error);
   revision=loaded.data.revision;
   if(!loaded.data.exists){rows=[];return {bindings:[],records:{}};}
   let data;try{data=cloneServerFileData(JSON.parse(loaded.data.content));}catch{}
   if(!data||data.schemaVersion!==2||data.userId!==owner||!Array.isArray(data.bindings)||data.bindings.length>4096)throw Error('Invalid host file metadata');
   const seen=new Set();for(const row of data.bindings){if(!row||!id(row.bindingId)||seen.has(row.bindingId)||!id(row.generation)||typeof row.name!=='string'||!row.name||row.name.length>255||!Object.hasOwn(formats,row.format)||!/^output-[a-f0-9]{64}\.(txt|json|jsonl|md|csv)$/.test(row.hostName)||row.managedScope!==undefined&&typeof row.managedScope!=='string')throw Error('Invalid host binding');seen.add(row.bindingId);}
   const records={};
   for(const row of data.bindings){
    if(!/^journal-[a-f0-9]{64}\.json$/.test(row.journalName)||!/^sha256:[a-f0-9]{64}$/.test(row.journalRevision))throw Error('Invalid journal reference');
    const shard=await store.read(row.journalName);assertCurrent();
    if(!shard.ok||!shard.data.exists||shard.data.revision!==row.journalRevision)throw Error('Host journal bytes could not be verified');
    let entries;try{entries=cloneServerFileData(JSON.parse(shard.data.content));}catch{}
    if(!entries||typeof entries!=='object'||Array.isArray(entries))throw Error('Invalid journal entries');
    entries=await blobs.unpack(entries);assertCurrent();
    for(const [key,record] of Object.entries(entries)){
     let parts;try{parts=JSON.parse(key);}catch{}
     if(!Array.isArray(parts)||parts.length!==6||parts[0]!==owner||!id(parts[1])||parts[2]!==null&&!id(parts[2])||!id(parts[3])||parts[4]!==row.bindingId||parts[5]!==row.generation||!record||!Array.isArray(record.receipts)||record.receipts.length>256)throw Error('Invalid host write journal');
     if(row.managedScope&&row.managedScope!==JSON.stringify(parts.slice(0,4)))throw Error('Host journal scope differs from its managed binding');
     if(record.receipts.some(receipt=>!plain(receipt)||!id(receipt.intentId)||!hash(receipt.fingerprint)||!validRevision(receipt.revision))||new Set(record.receipts.map(receipt=>receipt.intentId)).size!==record.receipts.length)throw Error('Invalid host receipt');
     if(record.sourceBinding!==undefined&&!validChatSourceBinding(record.sourceBinding))throw Error('Invalid stored source binding');
     if(record.pending!==undefined){const pending=record.pending;if(!plain(pending)||!id(pending.intentId)||!hash(pending.fingerprint)||!id(pending.beforeHash)||!hash(pending.afterHash)||pending.revision!==pending.afterHash||pending.sourceBinding!==undefined&&!validChatSourceBinding(pending.sourceBinding))throw Error('Invalid pending host save');}
     if(record.history!==undefined&&!inspectDocumentHistory({targetId:parts[3],scope:{userId:parts[0],chatId:parts[1],...(parts[2]?{actorId:parts[2]}:{})},history:record.history,pages:record.historyPages??{}}).ok)throw Error('Invalid host history');
     records[key]=record;
    }
   }
   garbageNames=Array.isArray(data.garbageNames)?data.garbageNames:[];if(garbageNames.length>4096||garbageNames.some(name=>!/^(journal|content|metadata)-[a-f0-9]{64}\.json$/.test(name)))throw Error('Invalid cleanup index');
   rows=data.bindings;return {bindings:rows.map(row=>({...row,handle:handle(row.hostName,row.name)})),records};
  },
  async save(state){
   assertCurrent();const bindings=state.bindings.map(row=>{const previous=rows.find(item=>item.bindingId===row.bindingId);return {bindingId:row.bindingId,name:row.name,format:row.format,generation:row.generation,hostName:row.handle.hostName,...(previous?.managedScope?{managedScope:previous.managedScope}:selection?.hostName===row.handle.hostName&&selection.managedScope?{managedScope:selection.managedScope}:{}),...(row.initializeEmpty?{initializeEmpty:true}:{})};});
   for(const row of bindings){
    const records=Object.fromEntries(Object.entries(state.records).filter(([key])=>{const parts=JSON.parse(key);return parts[4]===row.bindingId&&parts[5]===row.generation;}));
    const packed=await blobs.pack(records);row.contentNames=packed.names;const content=JSON.stringify(packed.records),digest=sha256Text(content);
    row.journalName='journal-'+digest.slice(7)+'.json';row.journalRevision=digest;
    const existing=await store.read(row.journalName);assertCurrent();if(!existing.ok)throw Error('Host journal could not be read');
    if(existing.data.exists&&existing.data.revision!==digest)throw Error('Immutable host journal differs from its expected bytes');
    if(!existing.data.exists){const saved=store.writeImmutable?await store.writeImmutable(row.journalName,content):await store.write({name:row.journalName,expectedRevision:null,content,intentId:digest});assertCurrent();if(!saved.ok)throw Object.assign(Error(saved.error.message),saved.error);}
   }
   const reachable=new Set(bindings.flatMap(row=>[row.journalName,...(row.contentNames??[])]));garbageNames=[...new Set([...garbageNames,...rows.flatMap(row=>[row.journalName,...(row.contentNames??[])])])].filter(name=>!reachable.has(name));
   if(garbageNames.length>4096)throw Error('Restore host cleanup access before more saves');
   const saved=await store.write({name:'node-bindings.json',expectedRevision:revision,content:JSON.stringify({schemaVersion:2,userId:owner,bindings,garbageNames}),intentId:crypto.randomUUID()});assertCurrent();if(!saved.ok)throw Object.assign(Error(saved.error.message),saved.error);revision=saved.data.revision;rows=bindings;
   if(store.removeGenerated){const remaining=[];for(const name of garbageNames){assertCurrent();const removed=await store.removeGenerated(name);assertCurrent();if(!removed.ok||!removed.data.removed)remaining.push(name);}garbageNames=remaining;}
  },
 };
 if(!coordinators.has(owner))coordinators.set(owner,{});
 const native=createNodeFileAccess({persistence,coordinator:coordinators.get(owner),showSaveFilePicker:()=>handle(selection.hostName,selection.name),showOpenFilePicker:()=>[handle(selection.hostName,selection.name)],onChange:changed});
 const ready=native.ready.then(result=>{if(!result.ok)issue={code:current()?'HOST_FILE_UNAVAILABLE':'HOST_FILE_USER',message:current()?'SillyTavern saved files could not be restored. Check the host connection and retry.':'Refresh file access for the current SillyTavern user.'};changed();return result.ok?result:fail(issue.code,issue.message);});
 let chooseQueue=Promise.resolve();
 function select(settings,managedScope){
  const captured=cloneServerFileData(settings);
  if(!captured||!['save','open'].includes(captured.mode)||!Object.hasOwn(formats,captured.format)||typeof captured.name!=='string'||!captured.name.trim())return Promise.resolve(fail('INVALID_FILE_SELECTION','Choose a name and supported file type.'));
  const action=async()=>{
   if(!current())return fail('STALE_FILE_SCOPE','The SillyTavern user changed.');
   const restored=await ready;if(!restored.ok)return restored;
   try{await persistence.load();}catch{return fail('HOST_FILE_UNAVAILABLE','SillyTavern saved files could not be restored.');}
   const previous=managedScope?rows.find(row=>row.managedScope===managedScope):rows.find(row=>row.bindingId===captured.bindingId);
   if(captured.mode==='open'&&!previous)return fail('HOST_FILE_SELECTION_REQUIRED','Choose an existing authorized file or create an automatic destination.');
   if(previous&&previous.format!==captured.format)return fail('FILE_FORMAT_CONFLICT','Preserve this saved file type or choose a new destination.');
   const hostName=previous?.hostName??'output-'+sha256Text(managedScope??crypto.randomUUID()).slice(7)+formats[captured.format];
   selection={hostName,name:previous?.name??captured.name,...(managedScope?{managedScope}:{})};
   try{const chosen=await native.choose({...captured,name:selection.name,bindingId:previous?.bindingId});if(!chosen.ok)return chosen;changed();return {ok:true,data:chosen.data};}finally{selection=null;}
  };
  const pending=chooseQueue.then(action);chooseQueue=pending.catch(()=>{});return pending;
 }
 async function ensureManaged(definition,controls={}){
  const captured=cloneServerFileData(definition),scope=cloneServerFileData(controls.scope);
  let fresh=false;try{fresh=controls.isCurrent?.()===true;}catch{}
  if(!fresh||!current()||scope?.userId!==owner||!id(scope.chatId)||scope.actorId!==undefined&&!id(scope.actorId))return fail('STALE_FILE_SCOPE','Capture the current authenticated user and chat before preparing a file.');
  if(!captured||!id(captured.targetId)||!Object.hasOwn(formats,captured.format)||typeof captured.content!=='string'||new TextEncoder().encode(captured.content).byteLength>262144||!['create','error'].includes(captured.missing))return fail('INVALID_FILE_BACKEND_CONFIG','Use a checked managed file definition.');
  if(controls.create===false){
   const readyResult=await ready;if(!readyResult.ok)return readyResult;const refreshed=await native.refresh();if(!refreshed.ok)return refreshed;
   if(!current()||controls.isCurrent?.()!==true)return fail('STALE_FILE_SCOPE','The captured branch source changed.');
   const row=rows.find(row=>row.managedScope===scopeKey(scope,captured.targetId));if(!row)return fail('FILE_BINDING_MISSING','No owned source file exists at this branch point.');
   if(row.format!==captured.format)return fail('FILE_FORMAT_CONFLICT','The source file format differs.');
   const {path,...data}=captured;return {ok:true,data:{...data,bindingId:row.bindingId,name:row.name,storage:'host'}};
  }
  const selected=await select({mode:'save',name:captured.name,format:captured.format},scopeKey(scope,captured.targetId));
  try{fresh=controls.isCurrent?.()===true;}catch{fresh=false;}
  if(!fresh||!current())return fail('STALE_FILE_SCOPE','The captured file scope changed during preparation.');
  if(!selected.ok)return selected;const {path,...definitionData}=captured;return {ok:true,data:{...definitionData,...selected.data,storage:'host'}};
 }
 function backend(definitions,controls={}){
  const copied=cloneServerFileData(definitions),scope=cloneServerFileData(controls.scope),valid=Array.isArray(copied)&&scope?.userId===owner;
  const denied=()=>{if(!valid||!current())return true;return copied.some(definition=>{const row=rows.find(binding=>binding.bindingId===definition.bindingId);return row?.managedScope&&row.managedScope!==scopeKey(scope,definition.targetId);});};
  const backend=native.backend(valid?copied:[],{...controls,isCurrent:()=>current()&&!denied()&&controls.isCurrent?.()===true});
  return backend;
 }
 const snapshot=()=>current()?Object.fromEntries(Object.entries(native.snapshot()).map(([key,row])=>{const stored=rows.find(item=>item.bindingId===key);return [key,{...row,status:issue||row.status==='unavailable'?'unavailable':'ready',storage:'host',generation:stored?.generation,...(stored?{path:'/user/files/lattice-'+sha256Text(owner).slice(7,31)+'-'+stored.hostName}:{})}];})):{};
 async function refresh(){try{const refreshed=await native.refresh();if(!refreshed.ok)throw Error('Host metadata refresh failed');issue=null;changed();return {ok:true,data:{persistent:true}};}catch{issue={code:current()?'HOST_FILE_UNAVAILABLE':'HOST_FILE_USER',message:'SillyTavern saved files could not be restored. Refresh file access and retry.'};changed();return fail(issue.code,issue.message);}}
 return Object.freeze({storage:'host',native:false,capabilities:store.capabilities,get supported(){return current()&&!issue;},get availability(){return current()?issue:{code:'HOST_FILE_USER',message:'Refresh file access for the current SillyTavern user.'};},location:{basePath:'/user/files',platform:'SillyTavern',canUseAbsolutePaths:false},ready,refresh,snapshot,ensureManaged,choose:settings=>select(settings),backend,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}});
}

/** Switch active users without allowing previously captured backends to follow that switch. */
export function createHostFileAccess(options={}){
 let identity,active,unsubscribe;const listeners=new Set();
 const changed=()=>{for(const listener of listeners)try{listener();}catch{}};
 function current(){
  let user;try{user=options.getUserId?.()??null;}catch{user=null;}
  if(!active||identity!==user){unsubscribe?.();identity=user;active=createUserHostFileAccess(options);unsubscribe=active.subscribe(changed);}
  return active;
 }
 current();
 return Object.freeze({storage:'host',native:false,get capabilities(){return current().capabilities;},get supported(){return current().supported;},get availability(){return current().availability;},get location(){return current().location;},get ready(){return current().ready;},async refresh(){const before=current(),restored=await before.ready;if(!restored.ok&&active===before){unsubscribe?.();active=createUserHostFileAccess(options);unsubscribe=active.subscribe(changed);await active.ready;}return current().refresh();},snapshot:()=>current().snapshot(),choose:settings=>current().choose(settings),ensureManaged:(definition,controls)=>current().ensureManaged(definition,controls),backend:(definitions,controls)=>current().backend(definitions,controls),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}});
}

