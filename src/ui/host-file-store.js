import {sha256Text} from '../workflow/definition-data.js?v=0.30.3';
const fail=(code,message)=>({ok:false,error:{code,message}});
const safeName=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value)&&!value.includes('..');
const hash=value=>/^sha256:[a-f0-9]{64}$/.test(value??'');
const queues=new Map();
const capabilities=Object.freeze({persistent:true,actualFiles:true,concurrency:'verified-write',crossDeviceCAS:false,verifiedAcknowledgement:true});
/** Authenticated files in SillyTavern's user directory. Pre/post verification cannot exclude cross-device races. */
export function createHostFileStore(options={}){
 const maxBytes=Number.isSafeInteger(options.maxBytes)&&options.maxBytes>0&&options.maxBytes<=8388608?options.maxBytes:8388608;
 const fetcher=options.fetch??((...args)=>globalThis.fetch(...args));
 const user=()=>{try{const value=options.getUserId?.();return typeof value==='string'&&value.trim()&&value.length<=256?value:null;}catch{return null;}};
 const physical=(identity,name)=>'lattice-'+sha256Text(identity).slice(7,31)+'-'+name;
 const current=identity=>user()===identity;
 async function readPhysical(identity,name,limit=maxBytes){
  // Retry only idempotent reads. Upload acknowledgement remains explicit:
  // retrying an uncertain write here could replay a real side effect.
  for(let attempt=0;attempt<3;attempt++){
   if(attempt)await new Promise(resolve=>setTimeout(resolve,attempt===1?100:300));
  try{
   if(!current(identity))return fail('STALE_FILE_SCOPE','The SillyTavern user changed.');
   const path='/user/files/'+name,response=await fetcher(path,{method:'GET',headers:{...(options.getRequestHeaders?.()??{})},credentials:'same-origin',cache:'no-store',redirect:'error'});
   if(!current(identity))return fail('STALE_FILE_SCOPE','The SillyTavern user changed.');
   if(response.status===404)return {ok:true,data:{path,content:'',revision:null,exists:false}};
   if(!response.ok){if([408,429,500,502,503,504].includes(response.status)&&attempt<2)continue;return fail(response.status===401||response.status===403?'HOST_FILE_DENIED':'HOST_FILE_UNAVAILABLE','The SillyTavern file could not be read.');}
   const content=await response.text();
   if(!current(identity))return fail('STALE_FILE_SCOPE','The SillyTavern user changed.');
   if(new TextEncoder().encode(content).byteLength>limit)return fail('FILE_DOCUMENT_LIMIT','Host files must fit the configured storage byte bound.');
   return {ok:true,data:{path,content,revision:sha256Text(content),exists:true}};
  }catch{if(!current(identity))return fail('STALE_FILE_SCOPE','The SillyTavern user changed.');if(attempt===2)return fail('HOST_FILE_UNAVAILABLE','The SillyTavern file host could not be reached.');}
  }
 }
 async function upload(identity,name,content){
  if(!current(identity))return fail('STALE_FILE_SCOPE','The SillyTavern user changed.');
  try{
   const bytes=new TextEncoder().encode(content);let binary='';for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
   const response=await fetcher('/api/files/upload',{method:'POST',headers:{...(options.getRequestHeaders?.()??{}),'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',redirect:'error',body:JSON.stringify({name,data:bytes.length?btoa(binary):'='})});
   if(!current(identity))return fail('PERSISTENCE_UNKNOWN','The user changed during the host save.');
   if(!response.ok)return fail(response.status===401||response.status===403?'HOST_FILE_DENIED':content===''?'HOST_EMPTY_UNSUPPORTED':'PERSISTENCE_UNKNOWN','The host did not accept this file save.');
   const body=await response.json();
   if(body?.path!=='user/files/'+name&&body?.path!=='/user/files/'+name)return fail('PERSISTENCE_UNKNOWN','The host returned an unexpected saved file path.');
   const checked=await readPhysical(identity,name,Math.max(maxBytes,1048576));
   return checked.ok&&checked.data.exists&&checked.data.content===content?checked:fail('PERSISTENCE_UNKNOWN','The saved host file bytes could not be verified.');
  }catch{return fail('PERSISTENCE_UNKNOWN','The host save response could not be confirmed.');}
 }
 async function read(name){const identity=user();if(!identity)return fail('HOST_FILE_USER','Sign in to SillyTavern before accessing saved files.');if(!safeName(name))return fail('INVALID_HOST_FILE_NAME','Use a safe managed file name.');const result=await readPhysical(identity,physical(identity,name));return result.ok?{ok:true,data:{name,...result.data}}:result;}
 const generated=name=>/^(journal|content|metadata)-[a-f0-9]{64}\.json$/.test(name);
 async function removePhysical(identity,name){
  if(!current(identity)||!name.startsWith(physical(identity,'')))return false;
  try{
   let removed;
   if(typeof options.deleteGenerated==='function')removed=await options.deleteGenerated('/user/files/'+name)===true;
   else {const response=await fetcher('/api/files/delete',{method:'POST',headers:{...(options.getRequestHeaders?.()??{}),'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',redirect:'error',body:JSON.stringify({path:'files/'+name})});removed=response.ok||response.status===404;}
   if(!removed||!current(identity))return false;
   const verified=await readPhysical(identity,name);return verified.ok&&!verified.data.exists;
  }catch{return false;}
 }
 async function removeGenerated(name){const identity=user();if(!identity||!generated(name))return fail('FILE_DELETE_UNAUTHORIZED','Only unreachable generated content metadata may be removed.');return {ok:true,data:{removed:await removePhysical(identity,physical(identity,name))}};}
 async function writeImmutable(name,content){
  const identity=user();if(!identity||!(/^(journal|content|metadata|archive)-[a-f0-9]{64}\.json$/.test(name))||typeof content!=='string'||new TextEncoder().encode(content).byteLength>maxBytes)return fail('INVALID_HOST_FILE_WRITE','Use a bounded generated immutable file.');
  if(name.slice(name.indexOf('-')+1,-5)!==sha256Text(content).slice(7))return fail('FILE_INTENT_CONFLICT','Immutable metadata must match its content hash.');
  const key=physical(identity,name),existing=await readPhysical(identity,key);if(!existing.ok)return existing;
  if(existing.data.exists)return existing.data.content===content?{ok:true,data:{name,...existing.data}}:fail('FILE_INTENT_CONFLICT','Immutable metadata changed.');
  const saved=await upload(identity,key,content);return saved.ok?{ok:true,data:{name,...saved.data}}:saved;
 }
 const indexName=(identity,name)=>physical(identity,'recovery-'+sha256Text(name).slice(7)+'.json');
 async function recoveryIndex(identity,name){
  const result=await readPhysical(identity,indexName(identity,name),1048576);if(!result.ok)return result;
  if(!result.data.exists)return {ok:true,data:{versions:[]}};
  try{const value=JSON.parse(result.data.content);if(value.schemaVersion!==1||value.name!==name||!Array.isArray(value.versions)||value.versions.length>21||value.versions.some(row=>!hash(row.revision)||!/^recovery-content-[a-f0-9]{64}\.txt$/.test(row.name))||value.garbage!==undefined&&(!Array.isArray(value.garbage)||value.garbage.length>4096||value.garbage.some(row=>typeof row.name!=='string'||!row.name.startsWith(physical(identity,''))||!/^((attempt|previous|recovery-content)-[a-f0-9]{64}\.txt)$/.test(row.name.slice(physical(identity,'').length))||row.completedName!==undefined&&(!row.completedName.startsWith(physical(identity,''))||!/^completed-[a-f0-9]{64}\.json$/.test(row.completedName.slice(physical(identity,'').length))))))throw Error();return {ok:true,data:value};}catch{return fail('PERSISTENCE_UNKNOWN','The content recovery index is invalid.');}
 }
 async function listVersions(name){const identity=user();if(!identity||!safeName(name))return fail('INVALID_HOST_FILE_NAME','Select an owned file.');const index=await recoveryIndex(identity,name);if(!index.ok)return index;return {ok:true,data:{versions:index.data.versions.slice(1).map(row=>({...row,path:'/user/files/'+physical(identity,row.name)}))}};}
 async function retainContent(identity,name,saved,priorName,attemptName,completedName){
  const index=await recoveryIndex(identity,name);if(!index.ok)return index;
  const contentName='recovery-content-'+sha256Text(JSON.stringify([name,saved.revision])).slice(7)+'.txt';
  const kept=await upload(identity,physical(identity,contentName),saved.content);if(!kept.ok)return kept;
  const previous=await readPhysical(identity,priorName);if(!previous.ok)return previous;
  const priorVersions=[...index.data.versions];
  if(previous.data.exists&&!priorVersions.some(row=>row.revision===previous.data.revision)){
   const priorContentName='recovery-content-'+sha256Text(JSON.stringify([name,previous.data.revision])).slice(7)+'.txt';const preserved=await upload(identity,physical(identity,priorContentName),previous.data.content);if(!preserved.ok)return preserved;priorVersions.unshift({name:priorContentName,revision:previous.data.revision,createdAt:Date.now()});
  }
  const all=[{name:contentName,revision:saved.revision,createdAt:Date.now()},...priorVersions.filter(row=>row.revision!==saved.revision)],versions=all.slice(0,21);
  const garbage=[...(index.data.garbage??[]),...all.slice(21).map(row=>({name:physical(identity,row.name)})),{name:attemptName,completedName},{name:priorName,completedName}].filter((row,index,array)=>array.findIndex(other=>other.name===row.name)===index&&!versions.some(version=>physical(identity,version.name)===row.name));
  if(garbage.length>4096)return fail('HOST_RECOVERY_CLEANUP_REQUIRED','Recovery cleanup is unavailable. Restore host deletion access before more saves; current and attempted bytes are retained.');
  const indexed=await upload(identity,indexName(identity,name),JSON.stringify({schemaVersion:1,name,versions,garbage}));if(!indexed.ok)return indexed;
  return {ok:true,data:{path:'/user/files/'+physical(identity,contentName),index:{schemaVersion:1,name,versions,garbage}}};
 }
 async function write(request){
  const {name,expectedRevision,content,intentId}=request??{},identity=user();
  if(!identity)return fail('HOST_FILE_USER','Sign in to SillyTavern before saving files.');
  if(!safeName(name)||typeof content!=='string'||new TextEncoder().encode(content).byteLength>maxBytes||expectedRevision!==null&&!hash(expectedRevision)||typeof intentId!=='string'||!intentId.trim()||intentId.length>256)return fail('INVALID_HOST_FILE_WRITE','Use bounded text, a safe name and a checked revision and intent.');
  const key=physical(identity,name),action=async()=>{
   const revision=sha256Text(content),fingerprint=sha256Text(JSON.stringify([name,expectedRevision,revision]));
   const token=sha256Text(JSON.stringify([identity,name,intentId])).slice(7),journalName=physical(identity,'intent-'+token+'.json');
   const attemptName=physical(identity,'attempt-'+token+'.txt'),priorName=physical(identity,'previous-'+token+'.txt');
   const completedName=physical(identity,'completed-'+token+'.json');
   const recovery={attemptPath:'/user/files/'+attemptName};
   const acknowledged=async(saved,deduplicated=false)=>{const retained=await retainContent(identity,name,saved,priorName,attemptName,completedName);if(!retained.ok)return {...retained,recovery};const completed=await upload(identity,completedName,JSON.stringify({fingerprint,revision}));if(completed.ok){const garbage=[];for(const row of retained.data.index.garbage){const gate=row.completedName?await readPhysical(identity,row.completedName,4096):null;if(row.completedName&&(!gate.ok||!gate.data.exists)||!await removePhysical(identity,row.name))garbage.push(row);}await upload(identity,indexName(identity,name),JSON.stringify({...retained.data.index,garbage}));recovery.attemptPath=retained.data.path;delete recovery.previousPath;}return completed.ok?{ok:true,data:{name,...saved,acknowledged:true,concurrency:'verified-write',recovery,...(deduplicated?{deduplicated:true}:{})}}:{...completed,recovery};};
   const journal=await readPhysical(identity,journalName,4096);if(!journal.ok)return journal;
   if(journal.data.exists){
    let record;try{record=JSON.parse(journal.data.content);}catch{return fail('PERSISTENCE_UNKNOWN','The saved intent metadata is invalid.');}
    if(record.fingerprint!==fingerprint)return fail('FILE_INTENT_CONFLICT','This saved intent identity has different content.');
    const live=await readPhysical(identity,key);if(!live.ok)return live;
    const completed=await readPhysical(identity,completedName,4096);if(!completed.ok)return completed;
    if(completed.data.exists){let receipt;try{receipt=JSON.parse(completed.data.content);}catch{}if(receipt?.fingerprint!==fingerprint||receipt?.revision!==revision)return fail('PERSISTENCE_UNKNOWN','The completed save receipt is invalid.');if(live.data.revision!==revision)return {...fail('FILE_REVISION_CONFLICT','This completed save differs from the current file. Its intent will not be replayed.'),recovery};return {ok:true,data:{name,...live.data,acknowledged:true,concurrency:'verified-write',recovery:{attemptPath:'/user/files/'+physical(identity,'recovery-content-'+sha256Text(JSON.stringify([name,revision])).slice(7)+'.txt')},deduplicated:true}};}
    const attempted=await readPhysical(identity,attemptName);if(!attempted.ok||attempted.data.content!==content||!attempted.data.exists)return fail('PERSISTENCE_UNKNOWN','The attempted save recovery bytes could not be verified.');
    if(live.data.revision===revision)return acknowledged(live.data,true);
   }
   const attempt=await readPhysical(identity,attemptName);if(!attempt.ok)return attempt;
   if(attempt.data.exists&&attempt.data.revision!==revision)return fail('FILE_INTENT_CONFLICT','The intent recovery copy has different bytes.');
   if(!attempt.data.exists){const preserved=await upload(identity,attemptName,content);if(!preserved.ok)return preserved;}
   if(!journal.data.exists){const recorded=await upload(identity,journalName,JSON.stringify({schemaVersion:1,fingerprint,expectedRevision,revision}));if(!recorded.ok)return recorded;}
   const previous=await readPhysical(identity,key);if(!previous.ok)return previous;
   if(previous.data.revision!==expectedRevision)return {...fail('FILE_REVISION_CONFLICT','This host file changed after it was read. The attempted version is retained.'),recovery};
   if(previous.data.exists){
    const prior=await readPhysical(identity,priorName);if(!prior.ok)return prior;
    if(prior.data.exists&&prior.data.revision!==previous.data.revision)return fail('PERSISTENCE_UNKNOWN','The previous version recovery copy disagrees with the live file.');
    if(!prior.data.exists){const preserved=await upload(identity,priorName,previous.data.content);if(!preserved.ok)return preserved;}
    recovery.previousPath='/user/files/'+priorName;
   }
   const latest=await readPhysical(identity,key);if(!latest.ok)return latest;
   if(latest.data.revision!==expectedRevision)return {...fail('FILE_REVISION_CONFLICT','This host file changed while recovery data was saved.'),recovery};
   const saved=await upload(identity,key,content);return saved.ok?acknowledged(saved.data):{...saved,recovery};
  };
  const before=queues.get(key)??Promise.resolve(),pending=before.then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('lattice-host-'+key,action):action());
  const tail=pending.catch(()=>{});queues.set(key,tail);
  void tail.then(()=>{if(queues.get(key)===tail)queues.delete(key);});
  return pending;
 }
 return Object.freeze({read,write,writeImmutable,removeGenerated,listVersions,capabilities:Object.freeze({...capabilities,contentGarbageCollection:true})});
}
