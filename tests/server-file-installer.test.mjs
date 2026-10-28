import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import filesystem from 'node:fs/promises';
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

test('explicit enablement changes the active config line and preserves matching examples in comments',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-comment-config-'));
 try{
  await writeFile(join(directory,'server.js'),'// fixture');
  const configuration='# Example: enableServerPlugins: false\r\nenableServerPlugins: false\r\nport: 8000\r\n';await writeFile(join(directory,'config.yaml'),configuration);
  const result=await installServerFilePlugin({sillyTavernPath:directory,enableServerPlugins:true});
  assert.equal(result.enabled,true);
  assert.equal(await readFile(join(directory,'config.yaml'),'utf8'),'# Example: enableServerPlugins: false\r\nenableServerPlugins: true\r\nport: 8000\r\n');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('an invalid source update leaves the previous working runtime, entry and configuration intact',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-failed-update-'));
 try{
  const host=join(directory,'host'),source=join(directory,'source');await mkdir(host);await mkdir(join(source,'server-plugin'),{recursive:true});await writeFile(join(host,'server.js'),'// fixture');
  const configuration='enableServerPlugins: false\n',original='export const info={id:"lattice-files"}; export function init(){return "previous";}\n';
  await writeFile(join(host,'config.yaml'),configuration);await writeFile(join(source,'server-plugin','index.mjs'),original);
  const installed=await installServerFilePlugin({sillyTavernPath:host,extensionPath:source});
  const entry=await readFile(join(installed.pluginDirectory,'index.mjs'),'utf8');
  await writeFile(join(source,'server-plugin','index.mjs'),'export const info = ;\n');
  await assert.rejects(()=>installServerFilePlugin({sillyTavernPath:host,extensionPath:source,enableServerPlugins:true}),SyntaxError);
  assert.equal(await readFile(installed.entry,'utf8'),original);
  assert.equal(await readFile(join(installed.pluginDirectory,'index.mjs'),'utf8'),entry);
  assert.equal(await readFile(join(host,'config.yaml'),'utf8'),configuration);
  assert.equal((await import(pathToFileURL(join(installed.pluginDirectory,'index.mjs')))).init(),'previous');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('staging writes and publication failures restore the prior installation without changing config',async context=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-publication-failure-'));
 try{
  const host=join(directory,'host'),source=join(directory,'source');await mkdir(host);await mkdir(join(source,'server-plugin'),{recursive:true});await writeFile(join(host,'server.js'),'// fixture');
  const configuration='enableServerPlugins: false\n',original='export const info={id:"lattice-files"}; export function init(){return "previous";}\n';await writeFile(join(host,'config.yaml'),configuration);await writeFile(join(source,'server-plugin','index.mjs'),original);
  const installed=await installServerFilePlugin({sillyTavernPath:host,extensionPath:source}),entry=await readFile(join(installed.pluginDirectory,'index.mjs'),'utf8');
  await writeFile(join(source,'server-plugin','index.mjs'),'export const info={id:"lattice-files"}; export function init(){return "next";}\n');
  for(const fault of ['write','publish','config']){
   let injected=false;const originalWrite=filesystem.writeFile,originalRename=filesystem.rename;
   context.mock.method(filesystem,'writeFile',async(...args)=>{if(fault==='write'&&String(args[0]).includes('.lattice-files-stage-')&&!injected){injected=true;throw Object.assign(Error('Injected staging failure'),{code:'EIO'});}return originalWrite(...args);});
   context.mock.method(filesystem,'rename',async(...args)=>{if(!injected&&(fault==='publish'&&String(args[0]).includes('.lattice-files-stage-')&&args[1]===installed.pluginDirectory||fault==='config'&&args[1]===join(host,'config.yaml'))){injected=true;throw Object.assign(Error('Injected publication failure'),{code:'EIO'});}return originalRename(...args);});
   try{await assert.rejects(()=>installServerFilePlugin({sillyTavernPath:host,extensionPath:source,enableServerPlugins:true}),/Injected/);assert.equal(injected,true);}finally{context.mock.restoreAll();}
   assert.equal(await readFile(installed.entry,'utf8'),original,fault);assert.equal(await readFile(join(installed.pluginDirectory,'index.mjs'),'utf8'),entry,fault);assert.equal(await readFile(join(host,'config.yaml'),'utf8'),configuration,fault);
  }
 }finally{context.mock.restoreAll();await rm(directory,{recursive:true,force:true});}
});

test('a failed rollback retains the prior plugin backup for host-owner recovery',async context=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-rollback-backup-'));
 try{
  const host=join(directory,'host'),source=join(directory,'source');await mkdir(host);await mkdir(join(source,'server-plugin'),{recursive:true});await writeFile(join(host,'server.js'),'// fixture');await writeFile(join(host,'config.yaml'),'enableServerPlugins: false\n');
  const original='export const info={id:"lattice-files"}; export function init(){return "previous";}\n';await writeFile(join(source,'server-plugin','index.mjs'),original);
  const installed=await installServerFilePlugin({sillyTavernPath:host,extensionPath:source});await writeFile(join(source,'server-plugin','index.mjs'),'export const info={id:"lattice-files"}; export function init(){return "next";}\n');
  const originalRename=filesystem.rename;let backup;
  context.mock.method(filesystem,'rename',async(from,to)=>{if(String(to).includes('.lattice-files-previous-'))backup=to;if(to===join(host,'config.yaml')||from===installed.pluginDirectory&&String(to).includes('.lattice-files-stage-'))throw Object.assign(Error('Injected publication/rollback failure'),{code:'EIO'});return originalRename(from,to);});
  try{await assert.rejects(()=>installServerFilePlugin({sillyTavernPath:host,extensionPath:source,enableServerPlugins:true}),AggregateError);}finally{context.mock.restoreAll();}
  assert.ok(backup);assert.equal(await readFile(join(backup,'runtime','server-plugin','index.mjs'),'utf8'),original);
 }finally{context.mock.restoreAll();await rm(directory,{recursive:true,force:true});}
});

test('config backups, pending publication and rollback request private creation permissions',async context=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-config-mode-options-'));
 try{
  const source=join(directory,'source');await mkdir(join(source,'server-plugin'),{recursive:true});await writeFile(join(source,'server-plugin','index.mjs'),'export const info={id:"lattice-files"}; export function init(){}\n');
  for(const rollback of [false,true]){
   const host=join(directory,rollback?'rollback':'success');await mkdir(host);await writeFile(join(host,'server.js'),'// fixture');const configPath=join(host,'config.yaml'),configuration='enableServerPlugins: false\n';await writeFile(configPath,configuration);
   const writes=[],originalStat=filesystem.stat,originalWrite=filesystem.writeFile,originalRename=filesystem.rename,originalRead=filesystem.readFile;let published=false,injected=false;
   context.mock.method(filesystem,'stat',async(...args)=>{const result=await originalStat(...args);if(args[0]===configPath)result.mode=result.mode&~0o777|0o600;return result;});
   context.mock.method(filesystem,'writeFile',async(...args)=>{if(String(args[0]).startsWith(configPath+'.lattice-'))writes.push({path:args[0],mode:args[2]?.mode});return originalWrite(...args);});
   context.mock.method(filesystem,'rename',async(...args)=>{const result=await originalRename(...args);if(args[1]===configPath)published=true;return result;});
   context.mock.method(filesystem,'readFile',async(...args)=>{if(rollback&&published&&!injected&&args[0]===configPath){injected=true;throw Error('Injected verification failure after config publication');}return originalRead(...args);});
   try{
    if(rollback)await assert.rejects(()=>installServerFilePlugin({sillyTavernPath:host,extensionPath:source,enableServerPlugins:true}),/Injected verification/);
    else await installServerFilePlugin({sillyTavernPath:host,extensionPath:source,enableServerPlugins:true});
   }finally{context.mock.restoreAll();}
   assert.equal(writes.length,rollback?3:2);for(const write of writes)assert.equal(write.mode,0o600,'config copies must be created privately: '+write.path);
   assert.equal(await readFile(configPath,'utf8'),rollback?configuration:'enableServerPlugins: true\n');
  }
 }finally{context.mock.restoreAll();const scope=relative(resolve(tmpdir()),resolve(directory));assert.ok(scope&&!scope.startsWith('..')&&!isAbsolute(scope));await rm(directory,{recursive:true,force:true});}
});

test('POSIX config publication and rollback preserve private mode and ownership', {skip:process.platform==='win32'?'POSIX mode and ownership require a POSIX filesystem':false},async context=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-config-posix-mode-')),originalUmask=process.umask(0o022);
 try{
  const source=join(directory,'source'),host=join(directory,'host');await mkdir(join(source,'server-plugin'),{recursive:true});await mkdir(host);await writeFile(join(source,'server-plugin','index.mjs'),'export const info={id:"lattice-files"}; export function init(){}\n');await writeFile(join(host,'server.js'),'// fixture');
  const configPath=join(host,'config.yaml'),configuration='enableServerPlugins: false\n';await writeFile(configPath,configuration,{mode:0o600});const original=await filesystem.stat(configPath);
  const assertMetadata=async path=>{const current=await filesystem.stat(path);assert.equal(current.mode&0o777,0o600,path);assert.equal(current.uid,original.uid,path);assert.equal(current.gid,original.gid,path);};
  const installed=await installServerFilePlugin({sillyTavernPath:host,extensionPath:source,enableServerPlugins:true});await assertMetadata(configPath);await assertMetadata(installed.configBackup);
  await writeFile(configPath,configuration);const originalRename=filesystem.rename,originalRead=filesystem.readFile;let published=false,injected=false;
  context.mock.method(filesystem,'rename',async(...args)=>{const result=await originalRename(...args);if(args[1]===configPath)published=true;return result;});
  context.mock.method(filesystem,'readFile',async(...args)=>{if(published&&!injected&&args[0]===configPath){injected=true;throw Error('Injected verification failure after config publication');}return originalRead(...args);});
  try{await assert.rejects(()=>installServerFilePlugin({sillyTavernPath:host,extensionPath:source,enableServerPlugins:true}),/Injected verification/);}finally{context.mock.restoreAll();}
  assert.equal(await readFile(configPath,'utf8'),configuration);await assertMetadata(configPath);
  for(const entry of await filesystem.readdir(host))if(entry.startsWith('config.yaml.lattice-backup-'))await assertMetadata(join(host,entry));
 }finally{context.mock.restoreAll();process.umask(originalUmask);const scope=relative(resolve(tmpdir()),resolve(directory));assert.ok(scope&&!scope.startsWith('..')&&!isAbsolute(scope));await rm(directory,{recursive:true,force:true});}
});
