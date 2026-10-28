import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createWorkflowLibrary} from '../src/ui/workflow-library.js';

export function memoryStore() {
    const values = new Map();
    return {
        values,
        async read(name) { const content=values.get(name);return {ok:true,data:{name,content:content??'',exists:content!==undefined,revision:content===undefined?null:createHash('sha256').update(content).digest('hex')}}; },
        async write({name,expectedRevision,content}) {
            const old=await this.read(name);
            if(old.data.revision!==expectedRevision)return {ok:false,error:{code:'REVISION_CONFLICT',message:'Changed'}};
            values.set(name,content);return {ok:true,data:{...(await this.read(name)).data,acknowledged:true,concurrency:'verified-write'}};
        },
    };
}
export const graph=()=>({id:'original',name:'Draft',schema:3,runtime:2,mode:'native-unified',nodes:{text:{id:'text',type:'workflow',operation:'text',text:'before'}},wires:{}});
const store=memoryStore();let sequence=0;
const a=createWorkflowLibrary({store,createId:()=>`saved-${++sequence}`});
const b=createWorkflowLibrary({store});
const {serializeWorkflowDocument}=await import('../src/workflow/document-file.js');
const saved=await a.saveAs({json:serializeWorkflowDocument(graph()).data.json,name:'Shared'});
assert.equal(saved.ok,true);
const opened=await b.read(saved.data.id);
assert.equal(opened.data.graph.name,'Shared');
opened.data.graph.nodes.text.text='updated';
const result=await b.save({id:saved.data.id,expectedRevision:opened.data.revision,json:serializeWorkflowDocument(opened.data.graph).data.json});
assert.equal(result.ok,true);
assert.equal((await a.read(saved.data.id)).data.graph.nodes.text.text,'updated');
assert.equal((await a.list()).data.length,1);
console.log('workflow-saved-library: shared identity ok');

// Save As is a new resource even when the friendly name matches, preserving authored views.
const root=graph(),views={version:1,workflowId:root.id,activeKey:JSON.stringify(['root',root.id]),views:[{identity:{kind:'root',workflowId:root.id},open:true,camera:{x:0,y:0,zoom:1},selection:{primary:null,multi:[]},inspector:{item:null,section:'',open:true},nodePresentation:{text:{alias:'Authored alias'}}}]};
const copied=await a.saveAs({json:serializeWorkflowDocument(root,views).data.json,name:'Shared'});
assert.equal(copied.ok,true);
assert.notEqual(copied.data.id,saved.data.id);
assert.equal(copied.data.workspaceViews?.workflowId,copied.data.graph.id);
assert.equal(copied.data.workspaceViews.views[0].nodePresentation.text.alias,'Authored alias');
assert.equal((await a.list()).data.length,2,'matching names never merge identities');

const {operationDefaults}=await import('../src/workflow/catalog.js');
const configured=graph();configured.nodes.read={id:'read',type:'workflow',...operationDefaults('read-file'),targetId:'notes',fileTarget:{bindingId:'private-grant',path:'C:\\Stories\\notes.txt',name:'notes.txt',format:'text',missing:'create',content:'',visibility:{kind:'public'}}};
const safeCopy=await a.saveAs({json:serializeWorkflowDocument(configured).data.json,name:'Independent'});
assert.equal(safeCopy.ok,true);assert.equal(safeCopy.data.graph.nodes.read.fileTarget.bindingId,'');assert.equal(Object.hasOwn(safeCopy.data.graph.nodes.read.fileTarget,'path'),false);
assert.equal(configured.nodes.read.fileTarget.bindingId,'private-grant');
const staleSave=await a.save({id:saved.data.id,expectedRevision:'old',json:safeCopy.data.json});
assert.equal(staleSave.ok,false);assert.ok(a.recovery().some(draft=>draft.id===saved.data.id));

configured.nodes.text.profileId='profile-local';configured.roles={writer:{profileId:'role-local',model:'saved-model'}};
const localCopy=await a.saveAs({json:serializeWorkflowDocument(configured).data.json,name:'Configured copy'});
assert.equal(localCopy.ok,true);assert.equal(localCopy.data.graph.nodes.text.profileId,'profile-local');assert.equal(localCopy.data.graph.roles.writer.profileId,'role-local');
assert.equal(localCopy.data.graph.nodes.read.fileTarget.bindingId,'');
const adopted=await a.adopt({json:serializeWorkflowDocument(configured).data.json});
assert.equal(adopted.ok,true);assert.equal(adopted.data.graph.nodes.read.fileTarget.bindingId,'private-grant');assert.equal(adopted.data.graph.nodes.text.profileId,'profile-local');

const {computeDefinitionIdentity,definitionRefKey}=await import('../src/workflow/definition-data.js');
const nestedDefinition={id:'nested',version:1,name:'Nested',interface:[],parameters:[],body:{schema:3,runtime:2,mode:'native-pre',nodes:structuredClone(configured.nodes),wires:{},roles:{writer:{profileId:'nested-profile',model:'nested-model'}}}};
const checked=computeDefinitionIdentity(nestedDefinition);assert.equal(checked.ok,true);
const definition={...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};
const ref={id:definition.id,version:definition.version,semanticHash:definition.semanticHash};
const nestedGraph=graph();nestedGraph.definitions={[definitionRefKey(ref)]:definition};nestedGraph.nodes.instance={id:'instance',type:'subgraph',definition:ref,parameterOverrides:{}};
const nestedEncoded=serializeWorkflowDocument(nestedGraph);assert.equal(nestedEncoded.ok,true,JSON.stringify(nestedEncoded));
const nestedCopy=await a.saveAs({json:nestedEncoded.data.json,name:'Nested copy'});assert.equal(nestedCopy.ok,true,JSON.stringify(nestedCopy));

const savedDefinition=nestedCopy.data.graph.definitions[definitionRefKey(nestedCopy.data.graph.nodes.instance.definition)];
assert.equal(savedDefinition.body.nodes.read.fileTarget.bindingId,'');assert.equal(savedDefinition.body.roles.writer.profileId,'nested-profile');

const intentions=[];let lost=true;
const retryLibrary=createWorkflowLibrary({store:{...store,async write(request){intentions.push(request.intentId);if(lost){lost=false;return {ok:false,error:{code:'PERSISTENCE_UNKNOWN',message:'Response lost'}};}return store.write(request);}}});
const retryJson=serializeWorkflowDocument(graph()).data.json;
assert.equal((await retryLibrary.save({id:'retry',expectedRevision:null,json:retryJson})).ok,false);
assert.equal((await retryLibrary.save({id:'retry',expectedRevision:null,json:retryJson})).ok,true);
assert.equal(intentions[0],intentions[1],'retrying the same captured draft reuses its durable provider intent');

let adoptionLost=true;const adoptedNames=[];
const adoptionRetry=createWorkflowLibrary({store:{...store,async write(request){if(request.name!=='workflow-library-index.json')adoptedNames.push(request.name);if(adoptionLost){adoptionLost=false;return {ok:false,error:{code:'PERSISTENCE_UNKNOWN',message:'Response lost'}};}return store.write(request);}}});
assert.equal((await adoptionRetry.adopt({json:retryJson})).ok,false);
assert.equal((await adoptionRetry.adopt({json:retryJson})).ok,true);
assert.equal(adoptedNames[0],adoptedNames[1],'retrying a failed first adoption keeps its intended identity');
