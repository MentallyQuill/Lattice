import assert from 'node:assert/strict';
import {migrateUnboundOwnFile,declaredFileInput} from '../src/workflow/file-application-policy.js';
const old={id:'scene',type:'workflow',operation:'write-file',destinationMode:'own',targetId:'old-scene',mode:'append',fileTarget:{name:'SceneContext.txt',content:'',format:'text',visibility:{kind:'hidden'}}};
const migrated=migrateUnboundOwnFile(old);
assert.equal(migrated.fileTarget.managed,true);assert.equal(migrated.fileTarget.name,'SceneContext.txt');assert.equal(migrated.mode,'append');assert.deepEqual(migrated.fileTarget.visibility,{kind:'hidden'});assert.equal(old.fileTarget.managed,undefined);
assert.equal(migrateUnboundOwnFile(old,{canonicalDocuments:{'old-scene':{content:'canonical'}}}),old);
for(const target of [{...old.fileTarget,bindingId:'existing'},{...old.fileTarget,path:'C:\\scene.txt'},{...old.fileTarget,content:'template'}]){const configured={...old,fileTarget:target};assert.equal(migrateUnboundOwnFile(configured),configured);}
assert.deepEqual(declaredFileInput({id:'write'},{format:{operation:'format',format:'csv',columns:['name']}},{wire:{from:'format',to:'write',toPort:'records'}}),{inputKind:'data',inputFormat:'csv',inputColumns:['name']});
console.log('file application policy: conservative old own-file migration and declared format passed');
