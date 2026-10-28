import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
const module=await import('../tools/server-setup/setup.mjs').catch(()=>({}));
test('local setup listens only on loopback and rejects unauthenticated or cross-origin changes',async()=>{
 assert.equal(typeof module.startSetupServer,'function');
 const root=await fs.mkdtemp(path.join(tmpdir(),'lattice-local-setup-'));
 let server;
 try{
  await fs.writeFile(path.join(root,'server.js'),'// fixture');await fs.writeFile(path.join(root,'config.yaml'),'enableServerPlugins: false\n');
  server=await module.startSetupServer({openBrowser:false});assert.equal(server.address.address,'127.0.0.1');
  const origin='http://127.0.0.1:'+server.address.port;
  const request=(headers={},body={})=>fetch(origin+'/install',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await request()).status,403);assert.equal((await request({Authorization:'Bearer '+server.token,Origin:'https://evil.example'})).status,403);
  assert.equal(await fs.readFile(path.join(root,'config.yaml'),'utf8'),'enableServerPlugins: false\n');
  const result=await request({Authorization:'Bearer '+server.token,Origin:origin},{sillyTavernPath:root,enableServerPlugins:true});assert.equal(result.status,200);const installed=await result.json();assert.equal(installed.ok,true);assert.equal(installed.data.requiresRestart,true);
 }finally{await server?.close();await fs.rm(root,{recursive:true,force:true});}
});
