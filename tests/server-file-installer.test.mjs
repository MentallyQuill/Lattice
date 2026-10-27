import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve,isAbsolute} from 'node:path';
import {installServerFilePlugin} from '../tools/install-server-plugin.mjs';
test('installer registers the installed component without changing host configuration',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-file-install-'));
 try{
  const host=join(directory,'SillyTavern');await mkdir(host);await writeFile(join(host,'server.js'),'// host');await writeFile(join(host,'config.yaml'),'enableServerPlugins: false\n');
  const installed=await installServerFilePlugin({sillyTavernPath:host});
  const entry=await readFile(join(host,'plugins','lattice-files','index.mjs'),'utf8');
  assert.match(entry,/export \{info,init\} from "file:\/\//);assert.match(entry,/server-plugin\/index.mjs/);
  assert.equal(await readFile(join(host,'config.yaml'),'utf8'),'enableServerPlugins: false\n');
  assert.equal(installed.enabled,false);assert.equal(installed.requiresRestart,true);
  await installServerFilePlugin({sillyTavernPath:host});
  await writeFile(join(host,'plugins','lattice-files','index.mjs'),'// another plugin');
  await assert.rejects(()=>installServerFilePlugin({sillyTavernPath:host}),/existing/i);
 }finally{const scope=relative(resolve(tmpdir()),resolve(directory));assert.ok(scope&&!scope.startsWith('..')&&!isAbsolute(scope));await rm(directory,{recursive:true,force:true});}
});
