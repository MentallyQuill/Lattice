import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

export const documentLimit=262144;
const error=(code,message)=>Object.assign(new Error(message),{code});
const security=message=>Object.assign(error('FILE_PATH_DENIED',message),{name:'SecurityError'});
export const inside=(root,value)=>{const relative=path.relative(root,value);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
const identity=value=>process.platform==='win32'?value.toLowerCase():value;

/** Resolve existing ancestors so a missing file cannot conceal a symlink escape. */
export async function physicalPath(value,depth=0){
 if(depth>40)throw security('The file path contains too many symbolic links.');
 let cursor=path.resolve(value);const missing=[];
 for(;;){
  try{const resolved=await fs.realpath(cursor);if(missing.length&&!(await fs.stat(cursor)).isDirectory())throw error('FILE_PATH_INVALID','A parent in this file path is not a folder.');return path.join(resolved,...missing.reverse());}
  catch(cause){
   if(!['ENOENT','ENOTDIR'].includes(cause.code))throw cause;
   let entry;try{entry=await fs.lstat(cursor);}catch(problem){if(!['ENOENT','ENOTDIR'].includes(problem.code))throw problem;}
   if(entry?.isSymbolicLink())return physicalPath(path.resolve(path.dirname(cursor),await fs.readlink(cursor),...missing.reverse()),depth+1);
   const parent=path.dirname(cursor);if(parent===cursor)throw cause;missing.push(path.basename(cursor));cursor=parent;
  }
 }
}

export async function checkedPath(owner,value,{pinned=false}={}){
 const resolved=await physicalPath(value);
 if(!owner.admin&&!inside(owner.root,resolved))throw security('Choose a file inside your SillyTavern user folder. Absolute paths outside it require an administrator.');
 if(inside(owner.metadata,resolved))throw security('The file service’s own metadata cannot be a document destination.');
 if(pinned&&identity(resolved)!==identity(value))throw security('The file path changed through a symbolic link. Configure the destination again.');
 return resolved;
}

async function nearestDirectory(value){
 let cursor=value;
 for(;;){try{const stat=await fs.stat(cursor);if(!stat.isDirectory())throw error('FILE_PATH_INVALID','A parent in this file path is not a folder.');return cursor;}catch(cause){if(cause.code!=='ENOENT')throw cause;const parent=path.dirname(cursor);if(parent===cursor)throw cause;cursor=parent;}}
}
const digest=bytes=>bytes===null?'missing':createHash('sha256').update(bytes).digest('hex');
const sameEntry=(left,right)=>left&&right&&left.dev===right.dev&&left.ino===right.ino;
const readFlags=constants.O_RDONLY|(process.platform==='win32'?0:constants.O_NOFOLLOW??0);
async function pinDirectory(directory,validate){
 await validate?.();
 const canonical=await fs.realpath(directory),entry=await fs.lstat(directory);
 if(identity(canonical)!==identity(directory)||entry.isSymbolicLink()||!entry.isDirectory())throw security('A file parent changed through a symbolic link. Configure the destination again.');
 return async()=>{
  await validate?.();
  const current=await fs.lstat(directory),resolved=await fs.realpath(directory);
  if(current.isSymbolicLink()||!sameEntry(entry,current)||identity(resolved)!==identity(canonical))throw security('The file’s parent folder changed during access. Configure the destination again.');
 };
}
async function pinFile(value,validate){
 const checkParent=await pinDirectory(await nearestDirectory(path.dirname(value)),validate);
 let entry;try{entry=await fs.lstat(value);if(entry.isSymbolicLink())throw security('The file changed through a symbolic link. Configure the destination again.');}catch(cause){if(cause.code!=='ENOENT')throw cause;}
 return async handle=>{
  await checkParent();
  if(!handle)return;
  const opened=await handle.stat(),current=await fs.lstat(value);
  if(current.isSymbolicLink()||!sameEntry(entry,opened)||!sameEntry(opened,current))throw security('The opened file differs from its checked destination. Configure the destination again.');
 };
}
async function readBounded(value,{validate}={}){
 let handle;
 try{
  const check=await pinFile(value,validate);await check();
  handle=await fs.open(value,readFlags);await check(handle);const stat=await handle.stat();
  if(!stat.isFile())throw error('FILE_PATH_INVALID','Choose a file, not a folder.');
  if(stat.size>documentLimit)throw error('FILE_DOCUMENT_LIMIT','File documents must fit the 262,144-byte limit.');
  const buffer=Buffer.allocUnsafe(documentLimit+1);let length=0;
  while(length<buffer.length){const {bytesRead}=await handle.read(buffer,length,buffer.length-length,length);if(!bytesRead)break;length+=bytesRead;}
  await check(handle);
  const after=await handle.stat();if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw error('FILE_REVISION_CONFLICT','The file changed while it was being read.');
  if(length>documentLimit)throw error('FILE_DOCUMENT_LIMIT','File documents must fit the 262,144-byte limit.');
  return {bytes:buffer.subarray(0,length),stat};
 }finally{await handle?.close();}
}
async function existing(value,options){try{return (await readBounded(value,options)).bytes;}catch(cause){if(cause.code==='ENOENT')return null;throw cause;}}
async function syncDirectory(directory){
 let handle;
 try{handle=await fs.open(directory,'r');await handle.sync();}
 catch(cause){if(!['EINVAL','ENOTSUP','EISDIR','EPERM','EBADF'].includes(cause.code))throw cause;}
 finally{await handle?.close();}
}

/** Same-directory temporary file and rename; no partially written document is exposed. */
export async function atomicWrite(value,bytes,{mode=0o600,beforeRename,validate}={}){
 const parent=path.dirname(value),checkAncestor=await pinDirectory(await nearestDirectory(parent),validate);
 await checkAncestor();await fs.mkdir(parent,{recursive:true,mode:0o700});await checkAncestor();
 const checkParent=await pinDirectory(parent,validate);
 const temporary=path.join(parent,'.lattice-'+randomUUID()+'.tmp');let handle,temporaryEntry;
 try{
  await checkParent();handle=await fs.open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(process.platform==='win32'?0:constants.O_NOFOLLOW??0),mode);
  temporaryEntry=await handle.stat();await checkParent();
  if(!sameEntry(temporaryEntry,await fs.lstat(temporary)))throw security('The temporary file changed before writing.');
  await handle.writeFile(bytes);await handle.sync();await checkParent();await handle.close();handle=null;
  await beforeRename?.();await checkParent();await fs.rename(temporary,value);await checkParent();await syncDirectory(parent);
 }finally{
  await handle?.close();
  try{if(temporaryEntry&&sameEntry(temporaryEntry,await fs.lstat(temporary)))await fs.unlink(temporary);}catch(cause){if(cause.code!=='ENOENT')throw cause;}
 }
}

/** Node-backed equivalent of the existing journal's file-handle boundary. */
export function serverHandle(owner,value){
 const target=path.resolve(value);
 return {
  kind:'file',name:path.basename(target),path:target,
  async isSameEntry(other){return typeof other?.path==='string'&&identity(target)===identity(other.path);},
  async queryPermission(){
   try{
    const checked=await checkedPath(owner,target,{pinned:true});
    try{await fs.access(checked,constants.R_OK|constants.W_OK);}
    catch(cause){if(cause.code!=='ENOENT')throw cause;await fs.access(await nearestDirectory(path.dirname(checked)),constants.R_OK|constants.W_OK);}
    return 'granted';
   }catch(cause){if(cause.name==='SecurityError')throw cause;return 'denied';}
  },
  async getFile(){
   const checked=await checkedPath(owner,target,{pinned:true});
   try{
    const {bytes,stat}=await readBounded(checked,{validate:()=>checkedPath(owner,target,{pinned:true})});
    let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw error('FILE_ENCODING_INVALID','Use a UTF-8 text file.');}
    return {size:bytes.byteLength,lastModified:stat.mtimeMs,text:async()=>content};
   }catch(cause){if(cause.code==='ENOENT')throw Object.assign(cause,{name:'NotFoundError'});throw cause;}
  },
  async createWritable(){
   const validate=()=>checkedPath(owner,target,{pinned:true});
   await validate();const previous=await existing(target,{validate});let bytes,aborted=false;
   let mode=0o600;try{mode=(await fs.stat(target)).mode&0o777;}catch(cause){if(cause.code!=='ENOENT')throw cause;}
   return {
    async write(content){if(aborted)throw error('CANCELLED','File writing was cancelled.');if(typeof content!=='string')throw error('INVALID_FILE_CONTENT','File contents must be text.');bytes=Buffer.from(content,'utf8');if(bytes.byteLength>documentLimit)throw error('FILE_DOCUMENT_LIMIT','File documents must fit the 262,144-byte limit.');},
    async close(){
     if(aborted||!bytes)throw error('CANCELLED','File writing was cancelled.');
     await checkedPath(owner,target,{pinned:true});
     await atomicWrite(target,bytes,{mode,validate,beforeRename:async()=>{if(aborted)throw error('CANCELLED','File writing was cancelled.');await validate();if(digest(await existing(target,{validate}))!==digest(previous))throw error('FILE_REVISION_CONFLICT','The file changed before replacement.');}});
    },
    async abort(){aborted=true;bytes=undefined;},
   };
  },
 };
}

/** Journal handles are rebuilt from paths and never persisted as functions. */
export function serverPersistence(owner){
 const statePath=path.join(owner.metadata,'state.json');
 return {
  async load(){
   let text;try{if((await fs.stat(statePath)).size>16777216)throw error('FILE_JOURNAL_LIMIT','The file service journal exceeds its supported size.');text=await fs.readFile(statePath,'utf8');}catch(cause){if(cause.code==='ENOENT')return undefined;throw cause;}
   if(Buffer.byteLength(text)>16777216)throw error('FILE_JOURNAL_LIMIT','The file service journal exceeds its supported size.');
   const state=JSON.parse(text);
   if(state?.schemaVersion!==1||!Array.isArray(state.bindings)||typeof state.records!=='object'||!state.records||Array.isArray(state.records))throw error('FILE_JOURNAL_INVALID','The file service journal could not be validated.');
   const bindings=state.bindings.map(row=>{if(typeof row?.handle?.path!=='string')throw error('FILE_JOURNAL_INVALID','A stored path could not be validated.');return {...row,initializeEmpty:false,handle:serverHandle(owner,row.handle.path)};});
   return {bindings,records:state.records};
  },
  async save(state){
   const stored={schemaVersion:1,bindings:state.bindings.map(row=>({...row,initializeEmpty:false,handle:{path:row.handle.path}})),records:state.records};
   const text=JSON.stringify(stored);if(Buffer.byteLength(text)>16777216)throw error('FILE_JOURNAL_LIMIT','The file service journal exceeds its supported size.');
   await atomicWrite(statePath,text);
  },
 };
}
