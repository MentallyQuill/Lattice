import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
export async function runtimeFiles(root){
 const files=new Map(),base=await fs.realpath(root);
 async function visit(relative){
  const absolute=path.resolve(base,relative),physical=await fs.realpath(absolute);
  if(!inside(base,physical)||physical!==absolute)throw Error('Runtime source paths must stay inside the setup folder without symbolic links.');
  const name=path.relative(base,physical).split(path.sep).join('/');if(files.has(name))return;
  const bytes=await fs.readFile(physical);files.set(name,bytes);
  const source=bytes.toString('utf8'),imports=[...source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?['"]([^'"]+)['"]/gm),...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+\.m?js(?:[?#][^'"]*)?)['"]\s*\)/g)];
  for(const match of imports){
   const specifier=match[1];
   if(specifier.startsWith('.'))await visit(path.relative(base,path.resolve(path.dirname(physical),specifier.split(/[?#]/)[0])));
   else if(!specifier.startsWith('node:'))throw Error('Setup runtime cannot depend on external packages: '+specifier);
  }
 }
 await visit('server-plugin/index.mjs');return files;
}
export async function safeDestination(root,file){
 const target=path.resolve(root,file);if(!inside(root,target))throw Error('Unsafe destination outside the SillyTavern folder.');
 let cursor=target;
 while(cursor!==root){try{if((await fs.lstat(cursor)).isSymbolicLink())throw Error('Unsafe symbolic link in the setup destination.');}catch(error){if(error.code!=='ENOENT')throw error;}cursor=path.dirname(cursor);}
 return target;
}
