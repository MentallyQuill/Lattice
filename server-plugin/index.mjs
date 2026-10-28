import * as fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256Text} from '../src/workflow/definition-data.js?v=0.29.0';
import {createNodeFileAccess} from '../src/ui/node-file-access.js?v=0.29.0';
import {cloneServerFileData} from '../src/ui/server-file-access.js?v=0.29.0';
import {checkedPath,physicalPath,serverHandle,serverPersistence} from './filesystem.mjs';
import {browseFiles,fileRoots,chooserVersion} from './browse.mjs';
import {historyReference,validHistoryReference,parseHistoryPage,captureHistorySnapshot} from '../src/workflow/file-history-transfer.js?v=0.29.0';
const sameScope=(left,right)=>left?.userId===right?.userId&&left?.chatId===right?.chatId&&(left?.actorId??null)===(right?.actorId??null);

export const info=Object.freeze({id:'lattice-files',name:'Lattice file service',description:'Per-node filesystem paths with reviewed, version-checked writes for Lattice.'});
const fail=(code,message)=>({ok:false,error:{code,message}}),good=data=>({ok:true,data});
const formats=new Set(['text','json','jsonl','csv','markdown']);
let queue=Promise.resolve(),transferEpoch=0;
const serial=action=>{const next=queue.then(action);queue=next.catch(()=>{});return next;};
const id=value=>typeof value==='string'&&value.trim()&&value.length<=256&&!/[\0\r\n]/.test(value);
function checkedBody(raw){
 const checked=cloneServerFileData(raw);if(!checked||typeof checked!=='object'||Array.isArray(checked))throw Object.assign(new Error('Use bounded file service request data.'),{code:'INVALID_FILE_REQUEST'});return checked;
}
async function ownerFor(user){
 const handle=user?.profile?.handle,root=user?.directories?.root;
 if(!id(handle)||typeof root!=='string'||!path.isAbsolute(root))throw Object.assign(new Error('Sign in to SillyTavern before configuring files.'),{code:'FILE_USER_REQUIRED'});
 const canonicalRoot=await fs.realpath(root),metadata=await physicalPath(path.join(canonicalRoot,'lattice-file-service'));
 if(!path.relative(canonicalRoot,metadata)||path.relative(canonicalRoot,metadata).startsWith('..')||path.isAbsolute(path.relative(canonicalRoot,metadata)))throw Object.assign(new Error('The file service metadata folder is outside this user’s data folder.'),{code:'FILE_PATH_DENIED'});
 const files=user.directories.files?path.resolve(user.directories.files):path.join(canonicalRoot,'user','files');
 return {userId:handle,root:canonicalRoot,metadata,basePath:path.join(files,'lattice'),admin:user.profile.admin===true};
}
async function accessFor(owner,selected){
 const persistence=serverPersistence(owner);
 const access=createNodeFileAccess({persistence,showOpenFilePicker:async()=>[selected],showSaveFilePicker:async()=>selected});
 const ready=await access.ready;if(!ready.ok)throw Object.assign(new Error(ready.error.message),{code:ready.error.code});
 return {access,persistence};
}
async function bindingViews(owner,persistence){
 const state=await persistence.load();const rows=await Promise.all((state?.bindings??[]).map(async row=>{
  let status='unavailable';try{if(await row.handle.queryPermission()==='granted')status='ready';}catch{}
  return [row.bindingId,{bindingId:row.bindingId,name:row.name,format:row.format,path:row.handle.path,generation:row.generation,storage:'server',status}];
 }));return Object.fromEntries(rows);
}
function publicFailure(cause){
 if(cause?.code==='ENOENT')return fail('FILE_NOT_FOUND','The configured file does not exist.');
 if(['EACCES','EPERM'].includes(cause?.code))return fail('FILE_PERMISSION','SillyTavern cannot access this path. Check the server account’s file permissions.');
 const messages={FILE_USER_REQUIRED:'Sign in to SillyTavern before configuring files.',FILE_USER_CHANGED:'The signed-in user changed. Refresh the file settings.',FILE_PATH_DENIED:'Choose a file inside your SillyTavern user folder. Paths outside it require an administrator.',FILE_PATH_INVALID:'Choose a valid file path, not a folder.',FILE_PATH_PLATFORM:'Use a path for the operating system running SillyTavern.',INVALID_FILE_REQUEST:'Use bounded file service request data.',FILE_DOCUMENT_LIMIT:'File documents must fit the 262,144-byte limit.',FILE_ENCODING_INVALID:'Use a UTF-8 text file.'};
 return fail(messages[cause?.code]?cause.code:'FILE_SERVICE_FAILED',messages[cause?.code]??'The file service could not complete this operation. Check the server log and file permissions.');
}

export function createServerFileService(){
 const transfers=new Map(),maxBytes=30000000,maxSessions=32,ttl=15*60*1000;
 const prune=()=>{const now=Date.now();for(const [token,entry] of transfers)if(entry.expires<=now||entry.epoch!==transferEpoch)transfers.delete(token);};
 const size=()=>[...transfers.values()].reduce((total,entry)=>total+entry.bytes,0);
 const openTransfer=(owner,body,kind,path,pages={})=>{
  prune();const bytes=Buffer.byteLength(JSON.stringify(pages));if(transfers.size>=maxSessions||size()+bytes>maxBytes)return null;
  const token=randomUUID();transfers.set(token,{owner:owner.userId,root:owner.root,scope:JSON.stringify(body.scope),definition:JSON.stringify(body.definition),generation:body.generation,kind,path,pages,bytes,epoch:transferEpoch,expires:Date.now()+ttl});return token;
 };
 const getTransfer=(owner,body,kind)=>{prune();const entry=transfers.get(body.request?.token??body.request?.transfer?.token);return entry&&entry.epoch===transferEpoch&&entry.kind===kind&&entry.owner===owner.userId&&entry.root===owner.root&&entry.scope===JSON.stringify(body.scope)&&entry.definition===JSON.stringify(body.definition)&&entry.generation===body.generation?entry:null;};
 async function dispatch(action,user,raw={},controls={}){
  return serial(async()=>{
   try{
    const owner=await ownerFor(user);
    if(action==='status'){
     const {persistence}=await accessFor(owner);
     return good({apiVersion:1,chooserVersion,operations:['configure','load','cas','history','adopt','adopt-begin','adopt-page','versions','version','version-page','restore','roots','browse'],userId:owner.userId,basePath:owner.basePath,platform:process.platform,canUseAbsolutePaths:owner.admin,bindings:await bindingViews(owner,persistence)});
    }
    const body=checkedBody(raw);
    if(body.userId!==owner.userId)return fail('FILE_USER_CHANGED','The signed-in user changed. Refresh the file settings.');
    if(controls.signal?.aborted)return fail('CANCELLED','File access was cancelled.');
    if(action==='roots')return good(fileRoots(owner));
    if(action==='browse')return good(await browseFiles(owner,body.path));
    if(action==='configure'){
     transferEpoch++;transfers.clear();
     if(typeof body.path!=='string'||body.path.length>4096||body.path.includes('\0')||!formats.has(body.format)||!['open','save'].includes(body.mode))return fail('INVALID_FILE_REQUEST','Enter a file path and supported format.');
     const supplied=body.path.trim();
     if(!supplied&&(typeof body.name!=='string'||!body.name.trim()||/[\/\\]/.test(body.name)))return fail('INVALID_FILE_REQUEST','Enter a filename or a complete file path.');
     if(process.platform!=='win32'&&(/^[a-z]:[\\/]/i.test(supplied)||/^\\\\/.test(supplied)))return fail('FILE_PATH_PLATFORM','Use a path for the operating system running SillyTavern.');
     const candidate=supplied?(path.isAbsolute(supplied)?supplied:path.resolve(owner.basePath,supplied)):path.join(owner.basePath,body.name.trim());
     const target=await checkedPath(owner,candidate),handle=serverHandle(owner,target);
     try{const stat=await fs.stat(target);if(!stat.isFile())return fail('FILE_PATH_INVALID','Choose a file path, not a folder.');await handle.getFile();}catch(cause){if(cause.code!=='ENOENT')throw cause;if(body.mode==='open')return fail('FILE_NOT_FOUND','The configured file does not exist.');}
     const {access,persistence}=await accessFor(owner,handle);
     const chosen=await access.choose({mode:body.mode,name:handle.name,format:body.format,...(body.bindingId?{bindingId:body.bindingId}:{})});if(!chosen.ok)return chosen;
     return good((await bindingViews(owner,persistence))[chosen.data.bindingId]);
    }
    if(!['load','cas','history','adopt','adopt-begin','adopt-page','versions','version','version-page','restore'].includes(action))return fail('FILE_OPERATION_UNKNOWN','Unknown file service operation.');
    if(!body.scope||body.scope.userId!==owner.userId||!id(body.scope.chatId)||!body.definition||typeof body.definition!=='object'||typeof body.generation!=='string')return fail('INVALID_FILE_REQUEST','Capture an authorized file, user, chat and generation.');
    if(action==='version-page'||action==='adopt-page'){
     const entry=getTransfer(owner,body,action==='version-page'?'read':'adopt');
     if(!entry)return fail('FILE_RECOVERY_TRANSFER_INVALID','The recovery transfer expired or changed.');
     await checkedPath(owner,entry.path,{pinned:true});if(controls.signal?.aborted)return fail('CANCELLED','File access was cancelled.');
     if(action==='version-page'){
      const reference=body.request?.reference,page=validHistoryReference(reference)?entry.pages[reference.pageId]:null;
      if(!page||historyReference(page).hash!==reference.hash)return fail('FILE_RECOVERY_TRANSFER_INVALID','This page is not part of the selected retained history.');
      const previous=page.previous===null?null:historyReference(entry.pages[page.previous]);if(previous===null)transfers.delete(body.request.token);
      return good({pageText:JSON.stringify(page),previous});
     }
     const parsed=parseHistoryPage(body.request?.pageText,body.request?.previous);if(!parsed.ok)return parsed;
     if(parsed.data.targetId!==body.definition.targetId||!sameScope(parsed.data.scope,body.scope))return fail('FILE_RECOVERY_TRANSFER_INVALID','The archive transfer does not match this target and scope.');
     const record={pageText:body.request.pageText,previous:body.request.previous},hash=sha256Text(JSON.stringify(record)),bytes=Buffer.byteLength(JSON.stringify(record));
     if(!entry.pages[hash]){if(Object.keys(entry.pages).length>=4096||size()+bytes>maxBytes)return fail('FILE_RECOVERY_TRANSFER_INVALID','The recovery transfer reached its bounded capacity.');entry.pages[hash]=record;entry.bytes+=bytes;}
     return good({pageId:parsed.data.pageId,hash});
    }
    const transfer=action==='adopt'&&body.request?.transfer?getTransfer(owner,body,'adopt'):null;
    if(action==='adopt'&&body.request?.transfer&&!transfer)return fail('FILE_RECOVERY_TRANSFER_INVALID','The recovery transfer expired or changed.');
    if(['cas','restore','adopt'].includes(action)){transferEpoch++;transfers.clear();}
    const {access,persistence}=await accessFor(owner);
    const stored=await persistence.load(),binding=stored?.bindings.find(row=>row.bindingId===body.definition.bindingId);
    if(!binding)return fail('FILE_BINDING_MISSING','Configure this file path for the signed-in user.');
    if(binding.generation!==body.generation)return fail('STALE_FILE_BINDING','The destination changed. Run and review the workflow again.');
    if(body.definition.path!==undefined&&body.definition.path!==binding.handle.path)return fail('FILE_PATH_CONFLICT','The configured path differs from its server binding. Save the file settings again.');
    await checkedPath(owner,binding.handle.path,{pinned:true});
    const backend=access.backend([body.definition],{scope:body.scope,branchBinding:body.branchBinding,signal:controls.signal,isCurrent:()=>!controls.signal?.aborted});
    if(action==='load')return backend.load(body.definition.targetId);
    if(action==='history')return backend.lookupHistory(body.definition.targetId,body.query);
    if(action==='version'){
     const selected=await backend.readVersion(body.definition.targetId,{versionId:body.request?.versionId});if(!selected.ok)return selected;
     const {pages,...snapshot}=selected.data,head=selected.data.snapshot.history?.head??null,token=head?openTransfer(owner,body,'read',binding.handle.path,pages):randomUUID();
     if(!token)return fail('FILE_RECOVERY_TRANSFER_INVALID','The recovery transfer reached its bounded capacity.');
     return good({...snapshot,transfer:{schemaVersion:1,token,head:head?historyReference(pages[head]):null}});
    }
    if(action==='adopt-begin'){
     const permitted=await backend.load(body.definition.targetId);if(!permitted.ok)return permitted;
     const token=openTransfer(owner,body,'adopt',binding.handle.path);return token?good({token}):fail('FILE_RECOVERY_TRANSFER_INVALID','The recovery transfer reached its bounded capacity.');
    }
    if(action==='versions')return backend.listVersions(body.definition.targetId);
    if(action==='restore')return backend.restoreVersion(body.definition.targetId,body.request);
    if(action==='adopt'){
     if(!body.request?.transfer)return backend.adoptLegacy(body.definition.targetId,body.request);
     const captured=captureHistorySnapshot(body.request.snapshot);if(!captured.ok)return captured;
     const snapshot=captured.data,pages={},seen=new Set();let reference=body.request.transfer.head;
     if(body.request.transfer.schemaVersion!==1||(reference?.pageId??null)!==(snapshot.history?.head??null))return fail('FILE_RECOVERY_TRANSFER_INVALID','The archive transfer head differs from its snapshot.');
     while(reference!==null){
      if(!validHistoryReference(reference)||seen.has(reference.pageId)||seen.size>=4096)return fail('FILE_RECOVERY_TRANSFER_INVALID','The archive transfer is cyclic or exceeds its bound.');
      seen.add(reference.pageId);const record=transfer.pages[reference.hash];if(!record||sha256Text(JSON.stringify(record))!==reference.hash)return fail('FILE_RECOVERY_TRANSFER_INVALID','The archive transfer record is unavailable.');const parsed=parseHistoryPage(record.pageText,record.previous);if(!parsed.ok)return parsed;
      if(parsed.data.pageId!==reference.pageId||parsed.data.targetId!==body.definition.targetId||!sameScope(parsed.data.scope,body.scope))return fail('FILE_RECOVERY_TRANSFER_INVALID','The archive transfer differs from this scope.');
      Object.defineProperty(pages,reference.pageId,{value:parsed.data,enumerable:true});reference=record.previous;
     }
     return backend.adoptLegacy(body.definition.targetId,{snapshot,pages});
    }
    if(body.update?.targetId!==body.definition.targetId)return fail('INVALID_FILE_REQUEST','The update must match its captured destination.');
    return backend.compareAndSwap(body.update,{signal:controls.signal});
   }catch(cause){return publicFailure(cause);}
  });
 }
 return Object.freeze({dispatch});
}

/** SillyTavern supplies its authenticated router and CSRF middleware. */
export async function init(router){
 const service=createServerFileService();
 const route=action=>async(req,res)=>{
  const controller=new AbortController();
  const closed=()=>{if(!res.writableEnded)controller.abort();};
  req.once?.('aborted',closed);res.once?.('close',closed);
  const result=await service.dispatch(action,req.user,req.body??{},{signal:controller.signal});
  if(!res.destroyed)res.json(result);
 };
 router.get('/status',route('status'));
 for(const action of ['configure','load','cas','history','adopt','adopt-begin','adopt-page','versions','version','version-page','restore','roots','browse'])router.post('/'+action,route(action));
}
