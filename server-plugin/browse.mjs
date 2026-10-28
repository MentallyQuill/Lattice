import fs from 'node:fs/promises';
import path from 'node:path';
import {checkedPath} from './filesystem.mjs';
export const chooserVersion=1;
export function fileRoots(owner){
 const roots=[{name:'Your SillyTavern files',path:owner.root}];
 if(owner.admin){const disk=path.parse(owner.root).root;if(disk!==owner.root)roots.push({name:'Server filesystem',path:disk});}
 return {chooserVersion,roots};
}
/** Stream at most 400 candidates, and return at most 200 authorized regular entries. */
export async function browseFiles(owner,value){
 if(typeof value!=='string'||!value||value.length>4096||value.includes('\0')||!path.isAbsolute(value))throw Object.assign(Error('Use an absolute server folder path.'),{code:'INVALID_FILE_REQUEST'});
 if(value.split(/[\\/]/).includes('..'))throw Object.assign(Error('Parent traversal is not supported.'),{code:'FILE_PATH_DENIED'});
 const directory=await checkedPath(owner,value);
 if(!(await fs.stat(directory)).isDirectory())throw Object.assign(Error('Choose a folder.'),{code:'FILE_PATH_INVALID'});
 const entries=[];let scanned=0,truncated=false;
 const iterator=await fs.opendir(directory);
 for await(const row of iterator){
  if(++scanned>400||entries.length===200){truncated=true;break;}
  if(row.isSymbolicLink()||!row.isFile()&&!row.isDirectory()||row.name.length>256)continue;
  try{
   const candidate=path.join(directory,row.name),checked=await checkedPath(owner,candidate,{pinned:true});
   entries.push({name:row.name,path:checked,kind:row.isDirectory()?'directory':'file'});
  }catch(cause){if(cause.code!=='FILE_PATH_DENIED'&&cause.code!=='ENOENT')throw cause;}
 }
 await checkedPath(owner,directory,{pinned:true});
 let parent=null;const candidate=path.dirname(directory);
 if(candidate!==directory)try{parent=await checkedPath(owner,candidate,{pinned:true});}catch{}
 entries.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==='directory'?-1:1);
 return {chooserVersion,path:directory,parent,entries,truncated};
}
