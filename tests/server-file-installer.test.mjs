import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve,isAbsolute} from 'node:path';
import {installServerFilePlugin} from '../tools/install-server-plugin.mjs';
test('installer registers the installed component without changing host configuration',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-file-install-'));
 try{
  const host=join(directory,'SillyTavern');await mkdir(host);await writeFile(join(host,'server.js'),'// host');await writeFile(join(host,'config.yaml'),'enableServerPlugins: false\n');
  const installed=await installServerFilePlugin({sillyTavernPath:host});
  const entry=await readFile(join(host,'plugins','lattice-files','index.mjs'),'utf8');
  assert.match(entry,/export \{info,init\} from "\.\/runtime\/server-plugin\/index.mjs"/);
  const loaded=await import(new URL('file:///'+join(host,'plugins','lattice-files','index.mjs').replaceAll('\\','/')));assert.equal(loaded.info.id,'lattice-files');assert.equal(typeof loaded.init,'function');
  assert.equal(await readFile(join(host,'config.yaml'),'utf8'),'enableServerPlugins: false\n');
  assert.equal(installed.enabled,false);assert.equal(installed.requiresRestart,true);
  await installServerFilePlugin({sillyTavernPath:host});
  await writeFile(join(host,'plugins','lattice-files','index.mjs'),'// another plugin');
  await assert.rejects(()=>installServerFilePlugin({sillyTavernPath:host}),/existing/i);
 }finally{const scope=relative(resolve(tmpdir()),resolve(directory));assert.ok(scope&&!scope.startsWith('..')&&!isAbsolute(scope));await rm(directory,{recursive:true,force:true});}
});

test('explicit setup enables only one unambiguous flag with a preserved config backup',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-config-install-'));
 try{
  await writeFile(join(directory,'server.js'),'// host');const original='port: 8000\r\nenableServerPlugins: false # optional\r\nlogging:\r\n  enabled: true\r\n';await writeFile(join(directory,'config.yaml'),original);
  await mkdir(join(directory,'plugins','other'),{recursive:true});await writeFile(join(directory,'plugins','other','index.mjs'),'// Keep');
  const installed=await installServerFilePlugin({sillyTavernPath:directory,enableServerPlugins:true});assert.equal(installed.enabled,true);assert.equal(await readFile(installed.configBackup,'utf8'),original);
  assert.equal(await readFile(join(directory,'config.yaml'),'utf8'),original.replace('enableServerPlugins: false','enableServerPlugins: true'));assert.equal(await readFile(join(directory,'plugins','other','index.mjs'),'utf8'),'// Keep');
  assert.equal((await installServerFilePlugin({sillyTavernPath:directory,enableServerPlugins:true})).configBackup,null);
  for(const invalid of ['enableServerPlugins: false\nenableServerPlugins: true\n','server:\n  enableServerPlugins: false\n','enableServerPlugins: *alias\n','"enableServerPlugins": false\n','{port: 8000}\n']){await writeFile(join(directory,'config.yaml'),invalid);await assert.rejects(()=>installServerFilePlugin({sillyTavernPath:directory,enableServerPlugins:true}),/ambiguous|config/i);assert.equal(await readFile(join(directory,'config.yaml'),'utf8'),invalid);}
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('installer rejects a symlinked plugin destination before writing outside the host',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-unsafe-install-')),outside=await mkdtemp(join(tmpdir(),'lattice-unsafe-outside-'));
 try{await writeFile(join(directory,'server.js'),'// host');await writeFile(join(directory,'config.yaml'),'enableServerPlugins: false\n');await symlink(outside,join(directory,'plugins'),process.platform==='win32'?'junction':'dir');await assert.rejects(()=>installServerFilePlugin({sillyTavernPath:directory}),/symbolic|outside|safe/i);assert.deepEqual(await import('node:fs/promises').then(fs=>fs.readdir(outside)),[]);}
 finally{await rm(directory,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
