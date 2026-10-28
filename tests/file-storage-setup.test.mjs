import assert from 'node:assert/strict';
import test from 'node:test';
const module=await import('../src/ui/file-storage-setup.js').catch(()=>({}));
function fixture(){
 let host={hostId:'https://host.example',userId:'alice',local:false},code=null;const saved=new Map();
 const preferences={async read(name){return {ok:true,data:{exists:saved.has(name),content:saved.get(name)??'',revision:saved.has(name)?'revision':null}};},async write({name,content}){saved.set(name,content);return {ok:true,data:{acknowledged:true,revision:'revision'}};}};
 const access={serviceVersion:{apiVersion:1,chooserVersion:1},async refresh(){return code?{ok:false,error:{code,message:code}}:{ok:true,data:{persistent:true}};}};
 return {preferences,access,getHost:()=>host,host(value){host=value;},code(value){code=value;},saved};
}
test('setup checks installed support first and persists the explicit choice without installing',async()=>{
 assert.equal(typeof module.createFileStorageSetup,'function');const f=fixture();let downloads=0;
 const setup=module.createFileStorageSetup({...f,downloadSetup:async()=>downloads++});await setup.ready;
 assert.equal(setup.view().status,'ready');assert.equal(setup.view().choice,null);
 await setup.choose('anywhere');assert.equal(setup.view().step,'complete');assert.equal(setup.view().effectiveMode,'anywhere');assert.equal(downloads,0);
 const resumed=module.createFileStorageSetup(f);await resumed.ready;assert.equal(resumed.view().choice,'anywhere');assert.equal(resumed.view().open,false);
});
test('missing, incompatible, denied and offline remain distinct and cancellation retains inside saving',async()=>{
 const f=fixture(),setup=module.createFileStorageSetup(f);await setup.ready;
 for(const [code,status] of [['FILE_SERVICE_REQUIRED','missing'],['FILE_SERVICE_INCOMPATIBLE','incompatible'],['FILE_SERVICE_DENIED','denied'],['FILE_SERVICE_UNAVAILABLE','unreachable']]){
  f.code(code);await setup.choose('anywhere');assert.equal(setup.view().status,status);assert.equal(setup.view().effectiveMode,'inside');
  await setup.next();await setup.cancel();assert.equal(setup.view().open,false);assert.equal(setup.view().effectiveMode,'inside');assert.equal(setup.view().choice,'anywhere');
 }
 f.host({hostId:'https://host.example',userId:'bob'});await setup.check();assert.equal(setup.view().choice,null);assert.equal(setup.view().step,'choice');
 f.host({hostId:'https://other.example',userId:'alice'});await setup.check();assert.equal(setup.view().choice,null);
});
test('restart resumes progress but always rechecks support and refuses unacknowledged preferences',async()=>{
 const f=fixture();f.code('FILE_SERVICE_REQUIRED');const setup=module.createFileStorageSetup(f);await setup.ready;await setup.choose('anywhere');await setup.next();await setup.next();
 const resumed=module.createFileStorageSetup(f);await resumed.ready;assert.equal(resumed.view().step,'restart');assert.equal(resumed.view().status,'missing');await resumed.open();assert.equal(resumed.view().step,'restart');
 f.code(null);await resumed.check();assert.equal(resumed.view().status,'ready');assert.equal(resumed.view().step,'complete');
 const failed=module.createFileStorageSetup({...f,preferences:{read:f.preferences.read,write:async()=>({ok:false,error:{code:'PERSISTENCE_UNKNOWN',message:'Not confirmed'}})}});await failed.ready;await failed.choose('inside');assert.equal(failed.view().preferenceError,'Not confirmed');
});
