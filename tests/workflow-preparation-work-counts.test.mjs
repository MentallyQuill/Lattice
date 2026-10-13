import assert from 'node:assert/strict';
import test from 'node:test';
import {describeOperation} from '../src/workflow/catalog.js?v=0.27.1';
import {prepareNativeNodeEdit} from '../src/workflow/definition-library.js?v=0.27.1';
import {captureGraphEditContext} from '../src/workflow/transactions.js?v=0.27.1';
const graph=()=>({id:'work-counts',schema:3,runtime:2,mode:'native-unified',nodes:Object.fromEntries(Array.from({length:100},(_,i)=>['n'+i,{id:'n'+i,type:'workflow',operation:'text',operationVersion:1,text:'short text'}])),wires:{},groups:{},roles:{},portals:{},definitions:{}});
function countClones(run) { const clone=globalThis.structuredClone;let calls=0;globalThis.structuredClone=(...args)=>{calls++;return clone(...args);};try{return {result:run(),calls};}finally{globalThis.structuredClone=clone;} }
test('scalar text operation descriptions do not allocate structured clones',()=>{
 const root=graph();const measured=countClones(()=>{for(const node of Object.values(root.nodes)) assert.equal(describeOperation(root,node).ok,true);});
 assert.equal(measured.calls,0,`scalar description clone calls: ${measured.calls}`);
});
test('a captured 100-node edit avoids per-node static metadata cloning',(t)=>{
 const root=graph();captureGraphEditContext(root,()=>({sessionId:'work',viewPath:[],readOnly:false}));
 const measured=countClones(()=>prepareNativeNodeEdit(root,{kind:'enabled',viewPath:[],nodeId:'n0',value:false}));
 assert.equal(measured.result.ok,true);t.diagnostic(`captured 100-node edit structuredClone calls: ${measured.calls}`);assert.ok(measured.calls<50,`edit clone calls: ${measured.calls}`);
});
test('document recovery can reuse matching checked artifacts but still validates changed projections', async(t)=>{
 const {prepareGraphArtifacts}=await import('../src/workflow/graph-artifacts.js?v=0.27.1');
 const {serializeWorkflowDocument}=await import('../src/workflow/document-file.js?v=0.27.1');
 const root=graph(),checkedArtifacts=prepareGraphArtifacts(root).data;
 const cold=countClones(()=>serializeWorkflowDocument(root));
 const warm=countClones(()=>serializeWorkflowDocument(root,null,{checkedArtifacts}));
 assert.equal(cold.result.ok,true);assert.equal(warm.result.ok,true);
 t.diagnostic(`recovery structuredClone calls: raw=${cold.calls}, checked=${warm.calls}`);assert.ok(warm.calls<cold.calls,`recovery clones: raw=${cold.calls}, checked=${warm.calls}`);
 assert.equal(warm.result.data.json,cold.result.data.json);
 root.nodes.n0.operation='does-not-exist';assert.equal(serializeWorkflowDocument(root,null,{checkedArtifacts}).ok,false);
});

test('checked document cloning avoids a repeated expansion and preserves optional-container normalization', async(t)=>{
 const {prepareGraphArtifacts}=await import('../src/workflow/graph-artifacts.js?v=0.27.1');
 const {cloneWorkflowDocument}=await import('../src/workflow/document.js?v=0.27.1');
 const root=graph();for(const key of ['groups','roles','portals','definitions'])delete root[key];
 const checkedArtifacts=prepareGraphArtifacts(root).data;
 const cold=countClones(()=>cloneWorkflowDocument(root));
 const warm=countClones(()=>cloneWorkflowDocument(root,{checkedArtifacts}));
 assert.equal(cold.result.ok,true);assert.equal(warm.result.ok,true);assert.deepEqual(warm.result.data,cold.result.data);
 for(const key of ['groups','roles','portals','definitions'])assert.deepEqual(warm.result.data[key],{});
 warm.result.data.nodes.n0.text='detached';assert.equal(root.nodes.n0.text,'short text');
 t.diagnostic(`document clone calls: raw=${cold.calls}, checked=${warm.calls}`);assert.ok(warm.calls<cold.calls);
});

test('captured qualified edit expands only its changed candidate',(t)=>{
 const root=graph();assert.equal(captureGraphEditContext(root,()=>({sessionId:'work',viewPath:[],readOnly:false})).ok,true);
 const measured=countClones(()=>prepareNativeNodeEdit(root,{kind:'enabled',viewPath:[],nodeId:'n0',value:false}));
 assert.equal(measured.result.ok,true);t.diagnostic(`qualified edit clone calls: ${measured.calls}`);
 assert.ok(measured.calls<=6,`qualified edit cloned ${measured.calls} times instead of reusing the admitted base`);
});

test('captured create and connect reuse the historical base expansion',async(t)=>{
 const {prepareNativeConnectionEdit}=await import('../src/workflow/connection-edits.js?v=0.27.1');
 for(const kind of ['create','connect'])await t.test(kind,()=>{
  const root=graph();root.nodes.sink={id:'sink',type:'workflow',operation:'reroute',artifactKind:'text'};
  assert.equal(captureGraphEditContext(root,()=>({sessionId:'work',viewPath:[],readOnly:false})).ok,true);
  const command=kind==='create'?{kind,operation:'text',graphPoint:{x:2,y:3}}:{kind,origin:{nodeId:'n0',portId:'out'},target:{nodeId:'sink',portId:'in'}};
  const measured=countClones(()=>prepareNativeConnectionEdit(root,command));
  assert.equal(measured.result.ok,true,JSON.stringify(measured.result));t.diagnostic(`${kind} clone calls: ${measured.calls}`);
  assert.ok(measured.calls<=(kind==='create'?9:6),`${kind} cloned ${measured.calls} times instead of reusing the admitted base`);
 });
});
