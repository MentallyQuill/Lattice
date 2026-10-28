import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createNodeFileAccess} from '../src/ui/node-file-access.js?v=0.29.0';
import {cloneServerFileData} from '../src/ui/server-file-access.js?v=0.29.0';
import {checkedPath,physicalPath,serverHandle,serverPersistence} from './filesystem.mjs';
import {browseFiles,fileRoots,chooserVersion} from './browse.mjs';

export const info=Object.freeze({id:'lattice-files',name:'Lattice file service',description:'Per-node filesystem paths with reviewed, version-checked writes for Lattice.'});
const fail=(code,message)=>({ok:false,error:{code,message}}),good=data=>({ok:true,data});
const formats=new Set(['text','json','jsonl','csv','markdown']);
let queue=Promise.resolve();
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
 async function dispatch(action,user,raw={},controls={}){
  return serial(async()=>{
   try{
    const owner=await ownerFor(user);
    if(action==='status'){
     const {persistence}=await accessFor(owner);
     return good({apiVersion:1,chooserVersion,operations:['configure','load','cas','history','adopt','versions','version','restore','roots','browse'],userId:owner.userId,basePath:owner.basePath,platform:process.platform,canUseAbsolutePaths:owner.admin,bindings:await bindingViews(owner,persistence)});
    }
    const body=checkedBody(raw);
    if(body.userId!==owner.userId)return fail('FILE_USER_CHANGED','The signed-in user changed. Refresh the file settings.');
    if(controls.signal?.aborted)return fail('CANCELLED','File access was cancelled.');
    if(action==='roots')return good(fileRoots(owner));
    if(action==='browse')return good(await browseFiles(owner,body.path));
    if(action==='configure'){
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
    if(!['load','cas','history','adopt','versions','version','restore'].includes(action))return fail('FILE_OPERATION_UNKNOWN','Unknown file service operation.');
    if(!body.scope||body.scope.userId!==owner.userId||!id(body.scope.chatId)||!body.definition||typeof body.definition!=='object'||typeof body.generation!=='string')return fail('INVALID_FILE_REQUEST','Capture an authorized file, user, chat and generation.');
    const {access,persistence}=await accessFor(owner);
    const stored=await persistence.load(),binding=stored?.bindings.find(row=>row.bindingId===body.definition.bindingId);
    if(!binding)return fail('FILE_BINDING_MISSING','Configure this file path for the signed-in user.');
    if(binding.generation!==body.generation)return fail('STALE_FILE_BINDING','The destination changed. Run and review the workflow again.');
    if(body.definition.path!==undefined&&body.definition.path!==binding.handle.path)return fail('FILE_PATH_CONFLICT','The configured path differs from its server binding. Save the file settings again.');
    await checkedPath(owner,binding.handle.path,{pinned:true});
    const backend=access.backend([body.definition],{scope:body.scope,branchBinding:body.branchBinding,signal:controls.signal,isCurrent:()=>!controls.signal?.aborted});
    if(action==='load')return backend.load(body.definition.targetId);
    if(action==='history')return backend.lookupHistory(body.definition.targetId,body.query);
    if(action==='version')return backend.readVersion(body.definition.targetId,body.request);
    if(action==='versions')return backend.listVersions(body.definition.targetId);
    if(action==='restore')return backend.restoreVersion(body.definition.targetId,body.request);
    if(action==='adopt')return backend.adoptLegacy(body.definition.targetId,body.request);
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
 for(const action of ['configure','load','cas','history','adopt','versions','version','restore','roots','browse'])router.post('/'+action,route(action));
}
