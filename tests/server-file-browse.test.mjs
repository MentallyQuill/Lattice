import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createServerFileService} from '../server-plugin/index.mjs';
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
test('authorized directory browsing is bounded, read-only and does not grant a file binding',async()=>{
 const root=await fs.mkdtemp(path.join(tmpdir(),'lattice-browse-'));
 try{
  const user={profile:{handle:'alice',admin:false},directories:{root}},service=createServerFileService();
  await fs.mkdir(path.join(root,'folder'));await fs.mkdir(path.join(root,'lattice-file-service'));await fs.writeFile(path.join(root,'notes.txt'),'Keep');
  const roots=must(await service.dispatch('roots',user,{userId:'alice'}));assert.equal(roots.roots[0].path,root);assert.equal(roots.chooserVersion,1);
  const listed=must(await service.dispatch('browse',user,{userId:'alice',path:root}));assert.equal(listed.parent,null);assert.deepEqual(listed.entries.map(row=>row.name),['folder','notes.txt']);
  assert.equal(await fs.readFile(path.join(root,'notes.txt'),'utf8'),'Keep');assert.deepEqual(await fs.readdir(path.join(root,'lattice-file-service')),[]);
  assert.equal((await service.dispatch('browse',user,{userId:'bob',path:root})).error.code,'FILE_USER_CHANGED');
  for(const forbidden of [path.join(root,'lattice-file-service'),path.dirname(root),root+path.sep+'folder'+path.sep+'..'])assert.equal((await service.dispatch('browse',user,{userId:'alice',path:forbidden})).error.code,'FILE_PATH_DENIED');
  for(let i=0;i<205;i++)await fs.writeFile(path.join(root,'entry-'+i),'');
  const bounded=must(await service.dispatch('browse',user,{userId:'alice',path:root}));assert.equal(bounded.entries.length,200);assert.equal(bounded.truncated,true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('directory symlinks cannot reveal another user folder',async()=>{
 const root=await fs.mkdtemp(path.join(tmpdir(),'lattice-browse-links-')),outside=await fs.mkdtemp(path.join(tmpdir(),'lattice-browse-outside-'));
 try{
  await fs.symlink(outside,path.join(root,'escape'),process.platform==='win32'?'junction':'dir');
  const user={profile:{handle:'alice',admin:false},directories:{root}},service=createServerFileService();
  assert.equal((await service.dispatch('browse',user,{userId:'alice',path:path.join(root,'escape')})).error.code,'FILE_PATH_DENIED');
  const listed=must(await service.dispatch('browse',user,{userId:'alice',path:root}));assert.equal(listed.entries.length,0);
 }finally{await fs.rm(root,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});}
});
