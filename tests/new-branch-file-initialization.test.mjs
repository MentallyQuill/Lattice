import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareManagedBranchFiles} from '../src/workflow/managed-branch-files.js';

const definition={targetId:'managed:new',bindingId:'child',name:'State.json',format:'json',content:'[]',missing:'create',visibility:{kind:'public'}};
const scope={userId:'owner',chatId:'child'},binding={schemaVersion:1,messageCount:2,prefixHash:'sha256:'+'a'.repeat(64)};

test('a managed file absent from the parent remains new branch-local state',async()=>{
 let lookups=0,historyReads=0;
 const access={
  backend:()=>({load:async()=>({ok:true,data:{revision:'missing:initial'}}),readVersion:async()=>{historyReads++;throw Error('An absent parent has no history to copy');}}),
  ensureManaged:async(_definition,controls)=>{lookups++;assert.equal(controls.create,false);assert.deepEqual(controls.scope,{userId:'owner',chatId:'parent'});return {ok:false,error:{code:'MANAGED_FILE_NOT_FOUND',message:'No owned parent binding exists'}};},
 };
 const result=await prepareManagedBranchFiles({definitions:[definition],access,scope,branch:{parentChatId:'parent',binding},isCurrent:()=>true});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(result.data,{definitions:[definition],adoptions:[]});
 assert.equal(lookups,1);assert.equal(historyReads,0);
});

test('a deleted parent file cannot turn its virtual seed into inherited state',async()=>{
 const access={
  ensureManaged:async()=>({ok:true,data:{...definition,bindingId:'parent'}}),
  backend:(definitions)=>definitions[0].bindingId==='child'
   ?{load:async()=>({ok:true,data:{revision:'missing:initial'}})}
   :{readVersion:async()=>({ok:true,data:{snapshot:{...definition,scope:{userId:'owner',chatId:'parent'},revision:'missing:deleted',receipts:[],history:{schemaVersion:1,epoch:0,head:null},branchBinding:binding},pages:{},visibility:{kind:'public'}}}),listVersions:async()=>({ok:true,data:{versions:[]}})},
 };
 const result=await prepareManagedBranchFiles({definitions:[definition],access,scope,branch:{parentChatId:'parent',binding},isCurrent:()=>true});
 assert.equal(result.ok,false,JSON.stringify(result));
 assert.equal(result.error.code,'BRANCH_POINT_UNAVAILABLE');
});

test('a deleted parent can still inherit its real retained branch-point contents',async()=>{
 const reads=[];
 const access={
  ensureManaged:async()=>({ok:true,data:{...definition,bindingId:'parent'}}),
  backend:(definitions)=>definitions[0].bindingId==='child'
   ?{load:async()=>({ok:true,data:{revision:'missing:initial'}})}
   :{readVersion:async(_target,{versionId})=>{reads.push(versionId);return {ok:true,data:{snapshot:{...definition,scope:{userId:'owner',chatId:'parent'},revision:versionId==='current'?'missing:deleted':'retained',content:versionId==='current'?'[]':'["retained"]',receipts:[],history:{schemaVersion:1,epoch:0,head:null},branchBinding:binding},pages:{},visibility:{kind:'public'}}};},listVersions:async()=>({ok:true,data:{versions:[{versionId:'retained',branchBinding:binding}]}})},
 };
 const result=await prepareManagedBranchFiles({definitions:[definition],access,scope,branch:{parentChatId:'parent',binding},isCurrent:()=>true});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.data.definitions[0].content,'["retained"]');
 assert.equal(result.data.adoptions[0].snapshot.scope.chatId,'child');
 assert.deepEqual(reads,['current','retained']);
});

for(const code of ['FILE_BINDING_MISSING','HOST_FILE_METADATA_CORRUPT','HOST_FILE_UNAVAILABLE','PRIVATE_DESTINATION']){
 test(`${code} never authorizes fresh initialization in a branch`,async()=>{
  const access={backend:()=>({load:async()=>({ok:true,data:{revision:'missing:initial'}})}),ensureManaged:async()=>({ok:false,error:{code,message:'Parent lookup failed'}})};
  const result=await prepareManagedBranchFiles({definitions:[definition],access,scope,branch:{parentChatId:'parent',binding},isCurrent:()=>true});
  assert.equal(result.ok,false);assert.equal(result.error.code,'BRANCH_POINT_UNAVAILABLE');
 });
}

test('verified parent absence preserves the required-file policy',async()=>{
 const access={backend:()=>({load:async()=>({ok:true,data:{revision:'missing:initial'}})}),ensureManaged:async()=>({ok:false,error:{code:'MANAGED_FILE_NOT_FOUND'}})};
 const result=await prepareManagedBranchFiles({definitions:[{...definition,missing:'error'}],access,scope,branch:{parentChatId:'parent',binding},isCurrent:()=>true});
 assert.equal(result.ok,false);assert.equal(result.error.code,'BRANCH_POINT_UNAVAILABLE');
});

test('a scope change during parent lookup cannot authorize initialization',async()=>{
 let current=true;
 const access={backend:()=>({load:async()=>({ok:true,data:{revision:'missing:initial'}})}),ensureManaged:async()=>{current=false;return {ok:false,error:{code:'MANAGED_FILE_NOT_FOUND'}};}};
 const result=await prepareManagedBranchFiles({definitions:[definition],access,scope,branch:{parentChatId:'parent',binding},isCurrent:()=>current});
 assert.equal(result.ok,false);assert.equal(result.error.code,'STALE_FILE_SCOPE');
});
