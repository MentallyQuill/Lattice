import assert from 'node:assert/strict';
import test from 'node:test';
import {createNativePersistenceVerifier} from '../src/workflow/native-persistence.js?v=0.30.1';
function fixture(kind){
 let saves=0,headers=0,fetches=0,calls=0;const abort=new AbortController();
 const original={chatId:'story',characterId:0,groupId:null,characters:[{avatar:'Mara.png',name:'Mara',chat:'Story'}],chat:[{mes:'Original',is_user:true}],chatMetadata:{latticeDocuments:{user:{notes:{version:'1',text:'Original'}}}},saveMetadata(){saves++;},getRequestHeaders(){headers++;return {'Content-Type':'application/json'};}};
 const receiver={...original};if(kind.startsWith('foreign')){receiver.chat=[];receiver.chatMetadata={};}
 if(kind==='cancel-save')Object.defineProperty(receiver,'saveMetadata',{get(){abort.abort();return original.saveMetadata;},enumerable:true});
 if(kind==='cancel-fetch')receiver.getRequestHeaders=function(){headers++;abort.abort();return {'Content-Type':'application/json'};};
 const getterFrame=kind==='foreign-headers'||kind==='changed-headers'||kind==='cancel-fetch'?3:2;
 const verifier=createNativePersistenceVerifier({getContext(){calls++;if(kind.startsWith('changed')&&calls===getterFrame+1){receiver.chat=[];receiver.chatMetadata={};}return calls===getterFrame?receiver:original;},getUserId:()=> 'user',fetch:async()=>{fetches++;return {ok:true,text:async()=>JSON.stringify([{chat_metadata:original.chatMetadata},...original.chat])};}});
 return {verifier,abort,counts:()=>({saves,headers,fetches})};
}
for(const kind of ['foreign-save','changed-save','foreign-headers','changed-headers','cancel-save','cancel-fetch'])test('foundation persistence refuses '+kind+' before native dispatch',async()=>{
 const f=fixture(kind),save=kind.endsWith('save'),result=await f.verifier[save?'saveAndVerify':'verify']({kind:'document',targetId:'notes'},{signal:f.abort.signal});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.acknowledged,false);assert.equal(result.data.saveAttempted,false);assert.equal(result.data.verificationAttempted,false);assert.equal(f.counts().saves,0);assert.equal(f.counts().fetches,0);if(kind==='foreign-headers')assert.equal(f.counts().headers,0);
});
test('foundation persistence acknowledges an unchanged actual receiver',async()=>{const f=fixture('unchanged'),result=await f.verifier.saveAndVerify({kind:'document',targetId:'notes'});assert.equal(result.ok,true);assert.equal(result.data.acknowledged,true);assert.deepEqual(f.counts(),{saves:1,headers:1,fetches:1});});
