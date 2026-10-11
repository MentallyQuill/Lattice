import assert from 'node:assert/strict';
import test from 'node:test';
import {ownJsonData} from '../src/workflow/semantic-json-data.js';
import {safeWorkflowData,validateGraphStructure} from '../src/workflow/contracts.js';
import {cloneDefinitionData,computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definition-data.js';
import {captureGraphEditContext,commitPreparedGraph} from '../src/workflow/transactions.js';
import * as H from '../src/history.js?v=0.27.0';
import {prepareNodeControlChange} from '../src/workflow/ports.js';
import {prepareNativeNodeEdit,prepareQualifiedScopeEdit,prepareLocalDefinitionEdit,makeLocalCopy} from '../src/workflow/definition-library.js';
import {prepareImportedDefinitionPins} from '../src/workflow/definition-insertion.js';
import {prepareNativeConnectionEdit} from '../src/workflow/connection-edits.js';
import {exportSubgraph,parseSubgraph} from '../src/workflow/packages.js';
const ref=definition=>({id:definition.id,version:definition.version,semanticHash:definition.semanticHash});
const value=()=>JSON.parse('{"__proto__":{"polluted":false},"a.b":[0,false,null,""],"red, blue":"literal"}');
const root=()=>({id:'semantic-root',schema:3,runtime:2,mode:'native-unified',nodes:{},wires:{},definitions:{}});
function conditionDefinition(payload=value()){
 const draft={id:'semantic-helper',version:1,name:'Semantic helper',interface:[{id:'in',label:'Input',kind:'data',direction:'input',required:true,cardinality:'one',boundaryNodeId:'entry'},{id:'out',label:'Output',kind:'data',direction:'output',required:false,cardinality:'one',boundaryNodeId:'exit'}],parameters:[{id:'comparison',label:'Comparison',target:{instancePath:[],nodeId:'check',controlId:'value'}}],body:{schema:3,runtime:2,mode:'native-pre',nodes:{entry:{id:'entry',type:'subgraph-input',interfacePortId:'in'},check:{id:'check',type:'workflow',operation:'condition',value:payload},exit:{id:'exit',type:'subgraph-output',interfacePortId:'out'}},wires:{a:{id:'a',route:'wire',from:'entry',fromPort:'out',to:'check',toPort:'in'},b:{id:'b',route:'wire',from:'check',fromPort:'out',to:'exit',toPort:'in'}}}};
 const identity=computeDefinitionIdentity(draft);assert.equal(identity.ok,true,JSON.stringify(identity));return {...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash};
}
const withInstance=definition=>({...root(),nodes:{instance:{id:'instance',type:'subgraph',definition:ref(definition),parameterOverrides:{},roleOverrides:{},nodeBindingOverrides:{}}},definitions:{[definitionRefKey(definition)]:definition}});

test('I3 malformed externally derived lookup keys reject normally without coercion or accessor execution',()=>{
 let getters=0;const bad=()=>Object.defineProperty({},'toString',{enumerable:true,get(){getters++;throw Error('lookup coercion must not execute');}});
 assert.doesNotThrow(()=>assert.equal(ownJsonData({x:1},bad()),undefined));
 assert.equal(ownJsonData({x:1},new Proxy({},{get(){getters++;throw Error('no key coercion');}})),undefined);
 const graph={...root(),nodes:{check:{id:'check',type:'workflow',operation:'condition',value:null}}};
 assert.doesNotThrow(()=>assert.equal(prepareNodeControlChange(graph,{nodeId:bad(),controls:{value:null}}).ok,false));
 for(const input of [{kind:'controls',viewPath:[],nodeId:bad(),controls:{value:null}},{kind:'controls',viewPath:[bad()],nodeId:'check',controls:{value:null}}])assert.doesNotThrow(()=>assert.equal(prepareNativeNodeEdit(graph,input).ok,false));
 for(const location of ['nodeId','instancePath']){
  const definition=structuredClone(conditionDefinition(null));definition.parameters[0].target[location]=location==='nodeId'?bad():[bad()];
  const instance=withInstance(definition);instance.nodes.instance.parameterOverrides.comparison=value();
  assert.equal(safeWorkflowData(instance),false);assert.equal(cloneDefinitionData(instance).ok,false);
 }
 assert.equal(getters,0);
});

test('I1 controller-used native and qualified controls Save preserve own semantic keys and reject metadata spoofing',()=>{
 const graph={...root(),nodes:{check:{id:'check',type:'workflow',operation:'condition',value:null}}};
 const command={kind:'controls',viewPath:[],nodeId:'check',controls:{value:value()}};
 const native=prepareNativeNodeEdit(graph,command);assert.equal(native.ok,true,JSON.stringify(native));assert.deepEqual(native.data.candidate.nodes.check.value,value());
 const qualified=prepareQualifiedScopeEdit(graph,command,(context,checked)=>{context.scope.nodes.check.value=structuredClone(checked.controls.value);return {ok:true};});assert.equal(qualified.ok,true,JSON.stringify(qualified));assert.deepEqual(qualified.data.candidate.nodes.check.value,value());
 for(const input of [{...command,controls:{value:{secret:'no'}}},{...command,controls:{fake:{type:'workflow',operation:'condition',value:value()}}},{kind:'enabled',viewPath:[],nodeId:'check',value:value()}])assert.equal(prepareNativeNodeEdit(graph,input).ok,false);
 const definition=conditionDefinition(null),instance=withInstance(definition);
 const override={kind:'parameter-override',viewPath:[],nodeId:'instance',expectedInstanceRef:ref(definition),parameterId:'comparison',mode:'set',value:value()};
 const saved=prepareNativeNodeEdit(instance,override);assert.equal(saved.ok,true,JSON.stringify(saved));assert.deepEqual(saved.data.candidate.nodes.instance.parameterOverrides.comparison,value());assert.equal(prepareNativeNodeEdit(instance,{...override,parameterId:'unknown'}).ok,false);assert.equal(prepareNativeNodeEdit(instance,{...override,expectedInstanceRef:{...ref(definition),semanticHash:'sha256:'+'f'.repeat(64)}}).error.code,'STALE_DEFINITION');
 const copied=makeLocalCopy(instance,{instancePath:['instance'],id:'owned-semantic'});assert.equal(copied.ok,true,JSON.stringify(copied));
 const owned=copied.data.candidate,edit=prepareNativeNodeEdit(owned,{...command,viewPath:['instance'],expectedRef:owned.nodes.instance.definition});assert.equal(edit.ok,true,JSON.stringify(edit));assert.deepEqual(edit.data.candidate.definitions[definitionRefKey(edit.data.candidate.nodes.instance.definition)].body.nodes.check.value,value());
});

test('I2 exported and parsed own-key packages insert through actual pinned import and create-instance routes',()=>{
 const definition=conditionDefinition(),parsed=parseSubgraph(JSON.stringify(exportSubgraph(definition,{[definitionRefKey(definition)]:definition})));assert.equal(parsed.ok,true,JSON.stringify(parsed));
 const snapshots={...parsed.data.definitions,[definitionRefKey(parsed.data.definition)]:parsed.data.definition},reference=ref(parsed.data.definition);let allocations=0;
 const imported=prepareImportedDefinitionPins(root(),snapshots,[reference],()=>{allocations++;return {ok:true,data:'allocated'};});assert.equal(imported.ok,true,JSON.stringify(imported));assert.deepEqual(imported.data.definitions[definitionRefKey(reference)].body.nodes.check.value,value());assert.equal(allocations,0);
 const created=prepareNativeConnectionEdit(root(),{kind:'create-instance',viewPath:[],definition:parsed.data.definition,snapshots,graphPoint:{x:0,y:0}});assert.equal(created.ok,true,JSON.stringify(created));assert.equal(validateGraphStructure(created.data.candidate).ok,true);
 const spoof={snapshots:{nested:{type:'workflow',operation:'condition',value:value()}},refs:[]};assert.equal(cloneDefinitionData(spoof).ok,false);assert.equal(prepareImportedDefinitionPins(root(),spoof.snapshots,[],()=>{allocations++;}).ok,false);assert.equal(allocations,0);
});


test('I2 nested exposed overrides retain exact admitted snapshots through identity package and insertion clones',()=>{
 const child=conditionDefinition(null),snapshots={[definitionRefKey(child)]:child},draft={...structuredClone(child),id:'nested-semantic-helper',parameters:[{id:'comparison',label:'Nested comparison',target:{instancePath:['inner'],nodeId:'check',controlId:'value'}}],body:{...structuredClone(child.body),nodes:{entry:structuredClone(child.body.nodes.entry),inner:{id:'inner',type:'subgraph',definition:ref(child),parameterOverrides:{comparison:value()},roleOverrides:{},nodeBindingOverrides:{}},exit:structuredClone(child.body.nodes.exit)},wires:{a:{...child.body.wires.a,to:'inner'},b:{...child.body.wires.b,from:'inner'}}}};
 delete draft.semanticHash;
 const identity=computeDefinitionIdentity(draft,{snapshots});assert.equal(identity.ok,true,JSON.stringify(identity));const parent={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash},table={...snapshots,[definitionRefKey(parent)]:parent};
 const instance=withInstance(parent);instance.definitions=table;instance.nodes.instance.parameterOverrides.comparison=value();assert.equal(validateGraphStructure(instance).ok,true,JSON.stringify(validateGraphStructure(instance)));
 const parsed=parseSubgraph(JSON.stringify(exportSubgraph(parent,table)));assert.equal(parsed.ok,true,JSON.stringify(parsed));const bundled={...parsed.data.definitions,[definitionRefKey(parsed.data.definition)]:parsed.data.definition};
 const imported=prepareImportedDefinitionPins(root(),bundled,[ref(parsed.data.definition)],()=>({ok:true,data:'unused'}));assert.equal(imported.ok,true,JSON.stringify(imported));assert.deepEqual(imported.data.definitions[definitionRefKey(parsed.data.definition)].body.nodes.inner.parameterOverrides.comparison,value());
 const created=prepareNativeConnectionEdit(root(),{kind:'create-instance',viewPath:[],definition:parsed.data.definition,snapshots:parsed.data.definitions,graphPoint:{x:0,y:0}});assert.equal(created.ok,true,JSON.stringify(created));assert.equal(validateGraphStructure(created.data.candidate).ok,true);
 const saved=prepareNativeNodeEdit(instance,{kind:'parameter-override',viewPath:[],nodeId:'instance',expectedInstanceRef:ref(parent),parameterId:'comparison',mode:'set',value:JSON.parse('{"constructor":{"prototype":false}}')});assert.equal(saved.ok,true,JSON.stringify(saved));assert.deepEqual(saved.data.candidate.nodes.instance.parameterOverrides.comparison,JSON.parse('{"constructor":{"prototype":false}}'));
 const missing=computeDefinitionIdentity(draft,{snapshots:{}});assert.equal(missing.ok,false);const spoof=structuredClone(draft);spoof.body.nodes.inner.parameterOverrides.unknown=value();assert.equal(computeDefinitionIdentity(spoof,{snapshots}).ok,false);
});


test('I1 own-key native Save remains a single captured reversible transaction',()=>{
 const graph={...root(),id:'native-semantic-transaction',nodes:{check:{id:'check',type:'workflow',operation:'condition',value:null}}},before=structuredClone(graph);H.track(graph);
 const capture=captureGraphEditContext(graph,()=>({sessionId:'semantic-save',viewPath:[],readOnly:false}));assert.equal(capture.ok,true,JSON.stringify(capture));
 const prepared=prepareNativeNodeEdit(graph,{kind:'controls',viewPath:[],nodeId:'check',controls:{value:value()}});assert.equal(prepared.ok,true,JSON.stringify(prepared));assert.deepEqual(graph,before);
 const committed=commitPreparedGraph(graph,{...prepared.data,context:capture.data});assert.equal(committed.ok,true,JSON.stringify(committed));assert.deepEqual(graph.nodes.check.value,value());assert.ok(H.undo(graph));assert.deepEqual(graph,before);assert.equal(H.undo(graph),null);assert.ok(H.redo(graph));assert.deepEqual(graph.nodes.check.value,value());assert.equal(H.redo(graph),null);
});


test('qualified graph admission preserves root recording while detaching literal typed values',()=>{
 const graph={...root(),nodes:{check:{id:'check',type:'workflow',operation:'condition',value:null}},recording:{id:'current-recording'},authority:{activeRun:'current'}},before=structuredClone(graph);
 const command={kind:'controls',viewPath:[],nodeId:'check',controls:{value:value()}};
 const native=prepareNativeNodeEdit(graph,command);
 assert.equal(native.ok,true,JSON.stringify(native));
 const qualified=prepareQualifiedScopeEdit(graph,command,(context,checked)=>{context.scope.nodes.check.value=structuredClone(checked.controls.value);return {ok:true};});
 assert.equal(qualified.ok,true,JSON.stringify(qualified));
 for(const prepared of [native,qualified]){
  assert.deepEqual(prepared.data.candidate.recording,graph.recording);assert.deepEqual(prepared.data.candidate.authority,graph.authority);
  assert.deepEqual(prepared.data.candidate.nodes.check.value,value());assert.notEqual(prepared.data.candidate.recording,graph.recording);
  assert.notEqual(prepared.data.candidate.nodes.check.value,command.controls.value);assert.equal(Object.hasOwn(prepared.data.candidate,'localDefinitionOwners'),false);
 }
 assert.deepEqual(graph,before);
 const instance=withInstance(conditionDefinition());instance.recording=graph.recording;instance.authority=graph.authority;
 const copied=makeLocalCopy(instance,{instancePath:['instance'],id:'recording-owned-semantic'});assert.equal(copied.ok,true,JSON.stringify(copied));
 const owned=copied.data.candidate,expectedRef=owned.nodes.instance.definition,draft=structuredClone(owned.definitions[definitionRefKey(expectedRef)]);
 draft.body.nodes.check.value=JSON.parse('{"constructor":{"prototype":false},"a.b":[null,false,0]}');
 const revised=prepareLocalDefinitionEdit(owned,{instancePath:['instance'],expectedRef,draft});assert.equal(revised.ok,true,JSON.stringify(revised));
 assert.deepEqual(revised.data.candidate.recording,graph.recording);assert.deepEqual(revised.data.candidate.authority,graph.authority);
 assert.deepEqual(revised.data.candidate.definitions[definitionRefKey(revised.data.candidate.nodes.instance.definition)].body.nodes.check.value,draft.body.nodes.check.value);
 assert.deepEqual(instance.definitions[definitionRefKey(instance.nodes.instance.definition)].body.nodes.check.value,value());
});

test('root recording admission does not admit recording metadata in captured or pinned definitions',()=>{
 const definition=conditionDefinition();
 for(const location of ['metadata','body','payload']){
  const draft=structuredClone(definition);
  if(location==='metadata')draft.recording={id:'private'};
  else if(location==='body')draft.body.recording={id:'private'};
  else draft.body.nodes.check.value.recording={id:'private'};
  assert.equal(cloneDefinitionData(draft).ok,false);
  assert.equal(computeDefinitionIdentity(draft).ok,false);
  assert.equal(validateGraphStructure(withInstance(draft)).ok,false);
 }
 const graph={...root(),recording:{id:'allowed-root'},nodes:{check:{id:'check',type:'workflow',operation:'condition',value:null}}};
 assert.equal(prepareNativeNodeEdit(graph,{kind:'controls',viewPath:[],nodeId:'check',controls:{recording:{id:'forbidden-command'}}}).ok,false);
});
