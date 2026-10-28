import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const smoke=(extra=[])=>spawnSync(process.execPath,[...extra,'tools/smoke-install.mjs'],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});

test('installation smoke accepts missing optional host support without model or write calls',()=>{
 const result=smoke();
 assert.equal(result.status,0,result.stderr);
 const report=JSON.parse(result.stdout);
 assert.equal(report.startupApiRequests,report.startupOptionalApiRequests);
 assert.equal(report.providerCalls,0);
 assert.ok(report.expectedHostMissingRequests>=2);
 assert.deepEqual(report.errors,[]);
 assert.deepEqual(report.missing,[]);
});

test('installation smoke still rejects a required installed stylesheet returning 404',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lattice-smoke-missing-'));
 try{
  const hook=join(directory,'missing-stylesheet.mjs');
  await writeFile(hook,`import http from 'node:http';
import {syncBuiltinESMExports} from 'node:module';
const createServer=http.createServer;
http.createServer=handler=>createServer((request,response)=>{
 if(new URL(request.url,'http://localhost').pathname==='/dist/lattice.css'){response.writeHead(404).end();return;}
 return handler(request,response);
});
syncBuiltinESMExports();
`);
  const result=smoke(['--import',pathToFileURL(hook).href]);
  assert.notEqual(result.status,0,'a missing shipped stylesheet must reject the installation');
  const errorLine=result.stderr.split(/\r?\n/).find(line=>line.startsWith('Error: {'));
  assert.ok(errorLine,result.stderr);
  const failure=JSON.parse(errorLine.slice('Error: '.length));
  assert.equal(failure.result.mounted,true);
  assert.deepEqual(failure.errors,[]);
  assert.ok(failure.missing.length>0);
  assert.ok(failure.missing.every(url=>new URL(url).pathname==='/dist/lattice.css'),JSON.stringify(failure.missing));
 }finally{
  const scope=relative(resolve(tmpdir()),resolve(directory));
  assert.ok(scope&&!scope.startsWith('..')&&!isAbsolute(scope));
  await rm(directory,{recursive:true,force:true});
 }
});
