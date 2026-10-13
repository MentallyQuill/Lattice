import assert from 'node:assert/strict';
import test from 'node:test';
import {computeDefinitionIdentity,definitionRefKey} from '../src/workflow/definition-data.js?v=0.27.3';
import {prepareGraphArtifacts,graphArtifactsFor,inspectGraphArtifacts} from '../src/workflow/graph-artifacts.js?v=0.27.3';
import {prepareWorkflowPlanner,preparedWorkflowExpansion,resolveWorkflow} from '../src/workflow/resolve.js?v=0.27.3';
import {prepareNativeNodeEdit} from '../src/workflow/definition-library.js?v=0.27.3';
import {captureGraphEditContext,commitPreparedGraph,committedGraphChange} from '../src/workflow/transactions.js?v=0.27.3';
import {describeOperation} from '../src/workflow/catalog.js?v=0.27.3';

function fixture(){
 const identity=computeDefinitionIdentity({id:'unfinished-system',version:1,name:'System',parameters:[],interface:[{id:'result',label:'Result',kind:'guidance',direction:'output',required:false,cardinality:'one',boundaryNodeId:'exit'}],body:{schema:3,runtime:2,mode:'native-unified',nodes:{exit:{id:'exit',type:'subgraph-output',interfacePortId:'result'}},wires:{}}});
 assert.equal(identity.ok,true);const definition={...identity.data.materializedDefinition,semanticHash:identity.data.semanticHash};
 return {id:'prepared-system',schema:3,runtime:2,mode:'native-unified',nodes:{system:{id:'system',type:'subgraph',enabled:false,definition:{id:definition.id,version:definition.version,semanticHash:definition.semanticHash}},merge:{id:'merge',type:'workflow',operation:'compose',outputKind:'guidance',budgetTokens:64,sections:[{name:'system',text:'',kind:'guidance',required:false,onSkipped:'omit'}]}},wires:{result:{id:'result',route:'wire',from:'system',fromPort:'result',to:'merge',toPort:'section.system'}},definitions:{[definitionRefKey(definition)]:definition}};
}
const target=root=>({workflowId:root.id,instancePath:[],nodeId:'merge',portId:'out'});

test('checked system planners preserve skipped boundaries and historical completeness across committed enable edits',()=>{
 const root=fixture(),artifacts=prepareGraphArtifacts(root);assert.equal(artifacts.ok,true);
 const planner=prepareWorkflowPlanner(root,artifacts.data).data,at=target(root),initial=planner.summarize(at);
 assert.equal(initial.ok,true);assert.equal(initial.data.callBound,0);assert.equal(planner.summarize(at),initial);
 const owned=preparedWorkflowExpansion(root,planner).data;
 assert.ok(Object.isFrozen(owned));assert.ok(owned.primitives.some(unit=>unit.systemDisabled&&unit.node.type==='subgraph-output'));
 const context=captureGraphEditContext(root,()=>({sessionId:'systems',viewPath:[],readOnly:false}));assert.equal(context.ok,true);
 const edit=prepareNativeNodeEdit(root,{kind:'enabled',viewPath:[],nodeId:'system',value:true});assert.equal(edit.ok,true);
 const committed=commitPreparedGraph(root,{...edit.data,context:context.data});assert.equal(committed.ok,true);
 const change=committedGraphChange(root,committed.data);assert.equal(change.kind,'unknown');
 assert.equal(graphArtifactsFor(root,artifacts.data).ok,false,'old checked content does not authorize the enabled root');
 assert.equal(planner.summarize(at),initial,'historical planner remains paired with its disabled snapshot');
 const current=prepareWorkflowPlanner(root,change.artifacts);assert.equal(current.ok,true);
 const summary=current.data.summarize(at);assert.equal(summary.error.code,'MISSING_INPUT');assert.equal(summary.error.address.nodeId,'system');
 assert.equal(current.data.summarize(at),summary,'addressed completeness failure is memoized');
 assert.deepEqual(summary.error,resolveWorkflow(root,{target:at}).error);
});

test('typed Compose budget edits retain integer controls and reject stale checked expansion without mutating snapshots',()=>{
 const root=fixture(),artifacts=prepareGraphArtifacts(root).data,before=JSON.stringify(inspectGraphArtifacts(artifacts).snapshot);
 const descriptor=describeOperation(root,root.nodes.merge).data.descriptor;
 assert.equal(descriptor.controlDescriptors.budgetTokens.type,'integer');assert.equal(descriptor.controlDescriptors.budgetTokens.max,8192);
 const edit=prepareNativeNodeEdit(root,{kind:'controls',viewPath:[],nodeId:'merge',controls:{budgetTokens:128}});assert.equal(edit.ok,true);
 assert.equal(edit.data.candidate.nodes.merge.budgetTokens,128);assert.equal(root.nodes.merge.budgetTokens,64);
 assert.equal(graphArtifactsFor(edit.data.candidate,artifacts).ok,false);
 assert.equal(JSON.stringify(inspectGraphArtifacts(artifacts).snapshot),before);
 assert.equal(prepareNativeNodeEdit(root,{kind:'controls',viewPath:[],nodeId:'merge',controls:{budgetTokens:8193}}).ok,false);
 assert.equal(prepareNativeNodeEdit(root,{kind:'controls',viewPath:[],nodeId:'merge',controls:{sections:[{name:'system',text:'',kind:'text'}]}}).ok,false,'a typed Guidance wire cannot survive an incompatible section edit');
});

test('memoized native generation eligibility is target-local and historical',async()=>{
 const {starterGraph}=await import('../src/workflow/starters.js?v=0.27.3');
 const root=starterGraph('unified-basic');root.nodes.independent={id:'independent',type:'workflow',operation:'text',text:'Independent'};
 const planner=prepareWorkflowPlanner(root).data;
 const native={workflowId:root.id,instancePath:[],nodeId:'generate-reply',portId:'draft'},local={workflowId:root.id,instancePath:[],nodeId:'independent',portId:'out'};
 const nativeSummary=planner.summarize(native),localSummary=planner.summarize(local);
 assert.equal(nativeSummary.data.requiresNativeGeneration,true);assert.equal(localSummary.data.requiresNativeGeneration,false);
 assert.equal(planner.summarize(native),nativeSummary);assert.equal(planner.summarize(local),localSummary);assert.ok(Object.isFrozen(nativeSummary.data));
 delete root.nodes['generate-reply'];assert.equal(planner.summarize(native),nativeSummary);
 assert.equal(prepareWorkflowPlanner(root).ok,false,'mutable roots still cross current structural validation');
});
