import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const build=await import('../tools/build-server-setup.mjs').catch(()=>({}));
test('downloadable setup ZIP extracts and installs a self-contained verified runtime into a temporary host',async()=>{
 assert.equal(typeof build.buildServerSetup,'function');
 const root=await fs.mkdtemp(path.join(tmpdir(),'lattice-setup-bundle-'));
 try{
  const zip=path.join(root,'setup.zip'),extracted=path.join(root,'Extracted setup & files'),host=path.join(root,'SillyTavern & stories');
  await build.buildServerSetup({outputPath:zip});
  if(process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Expand-Archive -LiteralPath '"+zip.replaceAll("'","''")+"' -DestinationPath '"+extracted.replaceAll("'","''")+"'"],{stdio:'pipe'});
  else {await fs.mkdir(extracted);execFileSync('unzip',['-q',zip,'-d',extracted]);}
  assert.equal(JSON.parse(await fs.readFile(path.join(extracted,'package.json'),'utf8')).type,'module');
  for(const file of ['Setup-Windows.cmd','Setup-macOS.command','Setup-Linux.sh'])assert.match(await fs.readFile(path.join(extracted,file),'utf8'),/setup.mjs/);
  await fs.mkdir(host);await fs.writeFile(path.join(host,'server.js'),'// temporary fixture');await fs.writeFile(path.join(host,'config.yaml'),'port: 8000\nenableServerPlugins: false\n');
  const installer=await import(pathToFileURL(path.join(extracted,'tools','install-server-plugin.mjs')));
  const installed=await installer.installServerFilePlugin({sillyTavernPath:host,extensionPath:extracted,enableServerPlugins:true});assert.equal(installed.verified,true);
  await fs.rm(extracted,{recursive:true,force:true});
  const plugin=await import(pathToFileURL(path.join(host,'plugins','lattice-files','index.mjs')));assert.equal(plugin.info.id,'lattice-files');assert.equal(typeof plugin.init,'function');
  assert.equal((await fs.readFile(path.join(host,'config.yaml'),'utf8')).includes('enableServerPlugins: true'),true);
 }finally{const relative=path.relative(tmpdir(),root);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));await fs.rm(root,{recursive:true,force:true});}
});
