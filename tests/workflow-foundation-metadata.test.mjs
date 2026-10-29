import test from 'node:test';
import {installMock} from './mock.js';
import * as S from '../src/state.js?v=0.30.3';
import assert from 'node:assert/strict';
import {exportWorkflow} from '../src/workflow/packages.js';
import {serializeWorkflowDocument,parseWorkflowDocument} from '../src/workflow/document-file.js';
import {createWorkflowDocumentSession} from '../src/ui/document-session.js';
import {createWorkflowDocumentController} from '../src/ui/document-controller.js';
const graph=()=>({id:'metadata-foundation',schema:4,runtime:3,mode:'native-unified',nodes:{scene:{id:'scene',type:'workflow',operation:'scene-context',selection:'before-window',keepRecentAssistantTurns:10,includeCharacter:false,visibilityMode:'public'},chunk:{id:'chunk',type:'workflow',operation:'chunk',inputMode:'context',strategy:'assistant-turns',turnsPerChunk:3}},wires:{context:{id:'context',route:'wire',from:'scene',fromPort:'out',to:'chunk',toPort:'in'}}});
const metadata=()=>({schema:1,id:'lesson-35',title:'Group replies into three-turn passages',rootKey:'generation',role:'generation',resourceRequirements:[],checkpoints:[{node:'Older verified turns',port:'out',expect:'Only eligible older pairs.',target:{rootKey:'generation',hops:[],nodeId:'scene'}}]});
test('foundation portable and editable files retain bounded singleton metadata',()=>{
 const g=graph(),m=metadata(),portable=exportWorkflow(g,{exampleMetadata:m});assert.deepEqual(portable.exampleMetadata,m);
 for(const input of [JSON.stringify(portable),serializeWorkflowDocument(g,null,{exampleMetadata:m}).data.json]){const parsed=parseWorkflowDocument(input);assert.equal(parsed.ok,true,JSON.stringify(parsed.error));assert.deepEqual(parsed.data.exampleMetadata,m);}
});
test('foundation documents reject unavailable roles and resource provisioning declarations',()=>{
 for(const m of [{...metadata(),role:'repair-maintenance'},{...metadata(),resourceRequirements:[{key:'derived',capability:'derived-document'}]}]){const saved=serializeWorkflowDocument(graph(),null,{exampleMetadata:m});assert.equal(saved.ok,false);assert.equal(parseWorkflowDocument(JSON.stringify({...exportWorkflow(graph()),exampleMetadata:m})).ok,false);}
});
test('foundation portable metadata cannot point a checkpoint at an absent node',()=>{const m=metadata();m.checkpoints[0].target.nodeId='absent';assert.equal(parseWorkflowDocument(JSON.stringify({...exportWorkflow(graph()),exampleMetadata:m})).ok,false);});
test('foundation local saves retire obsolete descriptive checkpoints without blocking ordinary graph edits',()=>{const g=graph(),m=metadata();delete g.nodes.scene;g.wires={};g.nodes.chunk.inputMode='text';g.nodes.chunk.strategy='paragraph';const saved=serializeWorkflowDocument(g,null,{exampleMetadata:m});assert.equal(saved.ok,true,JSON.stringify(saved.error));const parsed=parseWorkflowDocument(saved.data.json);assert.equal(parsed.ok,true);assert.equal(parsed.data.exampleMetadata.id,m.id);assert.deepEqual(parsed.data.exampleMetadata.checkpoints,[]);});
test('foundation document commands carry metadata through example activation and file save without running work',async()=>{
 const session=createWorkflowDocumentSession();session.activate({...graph(),id:'initial'},{clean:true});let saved,writes=0;
 const controller=createWorkflowDocumentController({session,files:{native:true,recents:()=>[],save:async json=>{writes++;saved=json;return {ok:true,data:{source:{name:'saved.json'},downloaded:false}};}},examples:()=>({ok:true,data:{graph:graph(),companions:[],exampleMetadata:metadata()}}),recovery:()=>[],views:()=>null,prompt:async()=> 'discard',activate:(g,o)=>session.activate(g,o)});
 const opened=await controller.example('lesson-35');assert.equal(opened.ok,true);assert.equal(writes,0);assert.equal(typeof session.exampleMetadata,'function');assert.deepEqual(session.exampleMetadata(),metadata());assert.equal((await controller.save()).ok,true);assert.equal(writes,1);assert.deepEqual(JSON.parse(saved).exampleMetadata,metadata());
});

test('foundation recovery persists singleton metadata and restores it under the next settings owner',()=>{
 installMock();S.settings();assert.ok(S.activateWorkflow(graph(),{exampleMetadata:metadata()}));assert.equal(S.flushRecovery().ok,true);assert.deepEqual(S.settings().recoveryDraft.exampleMetadata,metadata());
 const context=S.ctx(),value=structuredClone(S.settings());globalThis.SillyTavern.getContext=()=>({...context,extensionSettings:{lattice:value}});assert.equal(S.activeWorkflow().id,'metadata-foundation');assert.deepEqual(S.documentSession.exampleMetadata(),metadata());
});
test('foundation invalid metadata activation preserves the existing document and its authority',()=>{
 installMock();S.settings();const before=S.activeWorkflow(),token=S.documentSession.capture();let result;assert.doesNotThrow(()=>{result=S.activateWorkflow(graph(),{exampleMetadata:{...metadata(),role:'repair-maintenance'}});});assert.equal(result.ok,false);assert.equal(S.activeWorkflow(),before);assert.equal(S.documentSession.stillCurrent(token),true);
});

test('foundation metadata refuses accessors without invoking them and unsupported helper addresses',()=>{
 let reads=0;const m=metadata();Object.defineProperty(m,'title',{enumerable:true,get(){reads++;return 'unsafe';}});
 assert.equal(serializeWorkflowDocument(graph(),null,{exampleMetadata:m}).ok,false);assert.equal(reads,0);
 const nested=metadata();nested.checkpoints[0].target.hops=[{kind:'job-body',nodeId:'job',expectedRef:{id:'body',version:1,semanticHash:'sha256:'+'a'.repeat(64)}}];
 assert.equal(parseWorkflowDocument(JSON.stringify({...exportWorkflow(graph()),exampleMetadata:nested})).ok,false);
});
test('foundation invalid recovery metadata is retained for recovery and cannot become active',()=>{
 installMock();const context=S.ctx(),value=structuredClone(S.settings());value.enabled=true;value.recoveryDraft={graph:graph(),workspaceViews:null,exampleMetadata:{...metadata(),role:'repair-maintenance'}};
 globalThis.SillyTavern.getContext=()=>({...context,extensionSettings:{lattice:value}});
 assert.notEqual(S.activeWorkflow().id,'metadata-foundation');assert.equal(S.settings().enabled,false);assert.ok(S.settings().migrationRecovery.some(row=>row.original?.exampleMetadata?.role==='repair-maintenance'));
});
