import assert from 'node:assert/strict';
import test from 'node:test';
import {createHostFileStore} from '../src/ui/host-file-store.js';
import {createHostFileAccess} from '../src/ui/host-file-access.js';
import {createHostFileFixture} from './helpers/host-file-fixture.mjs';
import {prepareManagedBranchFiles} from '../src/workflow/managed-branch-files.js';
import {sha256Text} from '../src/workflow/definition-data.js';

test('recreating a deleted parent never archives its virtual seed as real branch-point contents',async()=>{
 const disk=createHostFileFixture(),userId='deleted-parent-owner';
 const store=createHostFileStore({fetch:disk.fetch,getUserId:()=>userId});
 const access=createHostFileAccess({store,getUserId:()=>userId});
 const must=result=>{assert.equal(result.ok,true,JSON.stringify(result.error));return result.data;};
 must(await access.ready);
 const definition={targetId:'managed:deleted-parent',name:'State.json',format:'json',content:'[]',missing:'create',visibility:{kind:'public'}};
 const stamp=count=>({schemaVersion:1,messageCount:count,prefixHash:sha256Text('prefix '+count)});
 const parentControls={scope:{userId,chatId:'parent'},isCurrent:()=>true};
 const parent=must(await access.ensureManaged(definition,parentControls));
 async function write(count,content){
  const backend=access.backend([parent],{...parentControls,branchBinding:stamp(count)});
  const snapshot=must(await backend.load(parent.targetId));
  must(await backend.compareAndSwap({targetId:parent.targetId,expectedRevision:snapshot.revision,expectedContent:snapshot.content,projectedDocument:{format:'json',content},intentId:'write-'+count,fingerprint:sha256Text('write '+count)}));
 }
 await write(1,'["Real branch-point contents"]');
 const outputs=[...disk.files.keys()].filter(name=>name.includes('-output-'));
 assert.equal(outputs.length,1);
 disk.files.delete(outputs[0]);
 await write(2,'["New parent contents"]');
 const childScope={userId,chatId:'child'};
 const child=must(await access.ensureManaged(definition,{scope:childScope,isCurrent:()=>true}));
 const result=await prepareManagedBranchFiles({definitions:[child],access,scope:childScope,branch:{parentChatId:'parent',binding:stamp(1)},isCurrent:()=>true});
 assert.equal(result.ok,false,'Deleted branch-point bytes must remain unavailable, not inherit the virtual [] seed');
 assert.equal(result.error.code,'BRANCH_POINT_UNAVAILABLE');
 assert.deepEqual(disk.unexpected,[]);
});
