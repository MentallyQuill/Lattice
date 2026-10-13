import assert from 'node:assert/strict';
import test from 'node:test';
import * as planning from '../src/workflow/resolve.js?v=0.27.3';
import * as validation from '../src/workflow/graph-validation.js?v=0.27.3';
import * as transactions from '../src/workflow/transactions.js?v=0.27.3';
import { prepareGraphCandidate } from '../src/workflow/prepared-graph-edit.js?v=0.27.3';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import * as history from '../src/history.js?v=0.27.3';
const context = root => transactions.captureGraphEditContext(root, () => ({sessionId:'owned',viewPath:[],readOnly:false})).data;
test('planner memoizes only actual inventory targets, including completeness failures, without getters', () => {
 const root=siblingWorkflow(), planner=planning.prepareWorkflowPlanner(root).data;
 assert.equal(planner.summarize(),planner.summarize());
 const target={workflowId:root.id,instancePath:['first/path'],nodeId:'work',portId:'out'};
 assert.equal(planner.summarize(target),planner.summarize(structuredClone(target)));
 root.nodes['first/path'].enabled=false;
 assert.equal(planner.summarize(target).ok,true);
 const incomplete=planning.prepareWorkflowPlanner(root).data;
 assert.equal(incomplete.summarize(target),incomplete.summarize(target));
 let reads=0; const unsafe={get kind(){reads++;throw Error('getter');}};
 assert.equal(planner.summarize(unsafe).error.code,'INVALID_TARGET'); assert.equal(reads,0);
 const invalid={...target,nodeId:'not in inventory'};
 assert.notEqual(planner.summarize(invalid),planner.summarize(invalid));
});
test('prepared registry owns immutable snapshots and memoizes full definition inspections', () => {
 assert.equal(typeof validation.prepareDefinitionRegistry,'function');
 const root=structuredClone(siblingWorkflow()),key=Object.keys(root.definitions)[0];
 const registry=validation.prepareDefinitionRegistry(root.definitions).data;
 const a=validation.inspectPreparedDefinition(registry,root.definitions[key]);
 assert.equal(a.ok,true); assert.equal(a,validation.inspectPreparedDefinition(registry,root.definitions[key]));
 assert.ok(Object.isFrozen(a.data.expansion)); assert.ok(Object.isFrozen(registry.snapshots[key].body.nodes));
 root.definitions[key].body.nodes.work.title='later';
 assert.notEqual(a.data.definition.body.nodes.work.title,'later');
 assert.equal(validation.inspectPreparedDefinition(structuredClone(registry),a.data.ref).error.code,'INVALID_PREPARED_REGISTRY');
 assert.equal(validation.prepareDefinitionRegistry(registry.snapshots).data,registry);
 const altered=structuredClone(registry.snapshots); altered[key].body.nodes.work.title='other presentation'; altered[key].body.roles.Analysis.profileId='other binding';
 const other=validation.prepareDefinitionRegistry(altered).data;
 assert.notEqual(other,registry); assert.equal(other.snapshots[key].body.nodes.work.title,'other presentation');
 const recombined=validation.prepareDefinitionRegistry({...registry.snapshots}).data;
 assert.equal(recombined.snapshots[key],registry.snapshots[key]);
 assert.equal(validation.inspectPreparedDefinition(recombined,a.data.ref).data.expansion,a.data.expansion);
 const bad={...registry.snapshots,unused:{bad:true}};
 assert.equal(validation.prepareDefinitionRegistry(bad).ok,false,'unused members must be admitted');
});
test('trusted receipts classify full coordinate transitions and reject clones, foreign roots and stale content', () => {
 assert.equal(typeof transactions.committedGraphChange,'function');
 const root=siblingWorkflow(),candidate=structuredClone(root);candidate.nodes.source.x=42;
 const prepared=prepareGraphCandidate(root,candidate).data;
 const summary=transactions.commitPreparedGraph(root,{...prepared,context:context(root)}).data;
 const change=transactions.committedGraphChange(root,summary);
 assert.equal(change.kind,'coordinates'); assert.deepEqual(change.nodeIds,['source']);assert.deepEqual(change.groupIds,[]);
 assert.ok(Object.isFrozen(change.candidate.nodes.source));
 assert.equal(transactions.committedGraphChange(root,structuredClone(summary)),null);
 assert.equal(transactions.committedGraphChange(structuredClone(root),summary),null);
 root.view={x:9,y:2,zoom:1};root.updatedAt=42;
 assert.equal(transactions.committedGraphChange(root,summary),change);
 root.nodes.source.title='unrelated';assert.equal(transactions.committedGraphChange(root,summary),null);
});
test('comments and ownership cannot impersonate coordinate receipts; replay after undo/redo fails', () => {
 assert.equal(typeof transactions.committedGraphChange,'function');
 const root=siblingWorkflow(),candidate=structuredClone(root);candidate.description='comment';
 const summary=transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,candidate).data,context:context(root)}).data;
 assert.equal(transactions.committedGraphChange(root,summary).kind,'unknown');
 history.undo(root);history.redo(root);assert.equal(transactions.committedGraphChange(root,summary),null);
});
test('checked candidate tokens cannot survive cloning, tampering or an intervening undo/redo', () => {
 const root=siblingWorkflow(),candidate=structuredClone(root);candidate.nodes.source.x=42;
 const prepared=prepareGraphCandidate(root,candidate).data;
 assert.ok(prepared.checkedCandidate,'preparation supplies a private capability');
 const token=context(root);prepared.candidate.nodes.source.x=43;
 assert.equal(transactions.commitPreparedGraph(root,{...prepared,context:token}).ok,false);
 const fresh=prepareGraphCandidate(root,candidate).data;
 assert.equal(transactions.commitPreparedGraph(root,{...fresh,checkedCandidate:structuredClone(fresh.checkedCandidate),context:token}).ok,false);
});

test('historical composition reads the captured authored source even before its first projection', async () => {
 const {prepareCompositionViews}=await import('../src/workflow/composition-views.js?v=0.27.3');
 const root=structuredClone(siblingWorkflow()), planner=planning.prepareWorkflowPlanner(root).data;
 root.nodes.source.title='new title';
 const views=prepareCompositionViews(root,planner);
 assert.equal(views.ok,true);assert.notEqual(views.data.views[0].savedGraph.nodes.source.title,'new title');
});
test('committed candidate artifacts are reusable only with matching admitted content', () => {
 const root=siblingWorkflow(),candidate=structuredClone(root);candidate.nodes.source.x=42;
 const summary=transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,candidate).data,context:context(root)}).data;
 const change=transactions.committedGraphChange(root,summary);
 assert.ok(change.artifacts);
 const planner=planning.prepareWorkflowPlanner(root,change.artifacts);
 assert.equal(planner.ok,true);
 assert.equal(planning.prepareWorkflowPlanner(root,structuredClone(change.artifacts)).ok,false);
 root.nodes.source.title='changed';assert.equal(planning.prepareWorkflowPlanner(root,change.artifacts).ok,false);
});

test('checked graph artifact payload cannot be rewritten and nonenumerable mutations cannot hit its cache', async () => {
 const {prepareGraphArtifacts,inspectGraphArtifacts}=await import('../src/workflow/graph-artifacts.js?v=0.27.3');
 const root=structuredClone(siblingWorkflow()),prepared=prepareGraphArtifacts(root);
 assert.equal(prepared.ok,true);assert.equal(prepareGraphArtifacts(root).data,prepared.data);
 assert.ok(Object.isFrozen(inspectGraphArtifacts(prepared.data)));
 Object.defineProperty(root.nodes.source,'enabled',{value:false,enumerable:false});
 assert.equal(prepareGraphArtifacts(root).ok,false);
});

test('individually checked definitions still require aggregate conflict checks', async () => {
 const {computeDefinitionIdentity,definitionRefKey}=await import('../src/workflow/definitions.js?v=0.27.3');
 const first=validation.prepareDefinitionRegistry(siblingWorkflow().definitions).data;
 const original=Object.values(first.snapshots)[0],draft=structuredClone(original);
 draft.body.nodes.work.instructions='different content';delete draft.semanticHash;
 const identity=computeDefinitionIdentity(draft).data,changed={...identity.materializedDefinition,semanticHash:identity.semanticHash};
 const second=validation.prepareDefinitionRegistry({[definitionRefKey(changed)]:changed}).data;
 assert.equal(validation.prepareDefinitionRegistry({...first.snapshots,...second.snapshots}).error.code,'DEFINITION_CONFLICT');
});
test('history returning to identical content invalidates captured contexts; no-op capability is one shot', () => {
 const root=structuredClone(siblingWorkflow()),captured=context(root),candidate=structuredClone(root);candidate.description='other';
 transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,candidate).data,context:context(root)});
 history.undo(root);
 assert.equal(transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,candidate).data,context:captured}).error.code,'STALE_DOCUMENT');
 const fresh=context(root),noop=prepareGraphCandidate(root,root).data;
 assert.equal(transactions.commitPreparedGraph(root,{...noop,context:fresh}).data.changed,false);
 assert.equal(transactions.commitPreparedGraph(root,{...noop,context:fresh}).ok,false);
 assert.equal(transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,candidate).data,context:fresh}).ok,true,'a no-op does not consume the captured raw context');
});
test('ownership and group dimensions never become coordinate-only; affected group IDs include real translations', () => {
 const root=structuredClone(siblingWorkflow());root.groups={g:{id:'g',x:0,y:0,frame:{x:0,y:0,w:10,h:10}}};
 const commit=change=>{const candidate=structuredClone(root);change(candidate);const result=transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,candidate).data,context:context(root)});assert.equal(result.ok,true);return transactions.committedGraphChange(root,result.data);};
 assert.equal(commit(candidate=>candidate.localDefinitionOwners=[]).kind,'unknown');
 assert.deepEqual(commit(candidate=>candidate.groups.g.frame.x=5).groupIds,['g']);
 assert.equal(commit(candidate=>candidate.groups.g.frame.w=20).kind,'unknown');
});
test('nonenumerable candidate tampering is rejected before checked commit reuse', () => {
 const root=siblingWorkflow(),candidate=structuredClone(root);candidate.nodes.source.x=42;
 const prepared=prepareGraphCandidate(root,candidate).data;
 Object.defineProperty(prepared.candidate.nodes.source,'title',{value:'hidden edit',enumerable:false});
 assert.equal(transactions.commitPreparedGraph(root,{...prepared,context:context(root)}).ok,false);
});

test('checked candidate itself rejects history ABA even with a fresh context',()=>{
 for(const reset of [false,true]){const root=siblingWorkflow();history.reset(root);const old=structuredClone(root);old.nodes.source.x=42;const prepared=prepareGraphCandidate(root,old).data;
 const intervening=structuredClone(root);intervening.nodes.source.x=99;assert.equal(transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,intervening).data,context:context(root)}).ok,true);assert.ok(history.undo(root));if(reset)history.reset(root);
 const result=transactions.commitPreparedGraph(root,{...prepared,context:context(root)});assert.equal(result.ok,false);assert.equal(result.error.code,'INVALID_PREPARATION');}
});

test('history observers cannot authorize the original candidate after mutating its committed root',()=>{
 for(const nested of [false,true]){const root=siblingWorkflow();history.reset(root);const candidate=structuredClone(root);candidate.nodes.source.x=444;let fired=false;
 const stop=history.onHistoryChange(graph=>{if(graph!==root||fired)return;fired=true;if(nested){const another=structuredClone(root);another.nodes.source.x=555;assert.equal(transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,another).data,context:context(root)}).ok,true);}else graph.nodes.source.title='Changed during notification';});
 try{const result=transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,candidate).data,context:context(root)});assert.equal(result.ok,true);assert.equal(transactions.committedGraphChange(root,result.data),null);}finally{stop();}}
});

test('verified committed artifacts become the next raw preparation cache entry without expansion clones', async () => {
 const {prepareGraphArtifacts,graphArtifactsFor}=await import('../src/workflow/graph-artifacts.js?v=0.27.3');
 const root=siblingWorkflow(),before=prepareGraphArtifacts(root).data,candidate=structuredClone(root);candidate.nodes.source.x=42;
 const summary=transactions.commitPreparedGraph(root,{...prepareGraphCandidate(root,candidate).data,context:context(root)}).data;
 const change=transactions.committedGraphChange(root,summary);assert.notEqual(change.artifacts,before);
 assert.equal(graphArtifactsFor(root,change.artifacts).ok,true);
 const clone=globalThis.structuredClone;let clones=0;
 globalThis.structuredClone=(...args)=>{clones++;return clone(...args);};
 try{assert.equal(prepareGraphArtifacts(root).data,change.artifacts);assert.equal(clones,0,'adopted expansion is reused');}finally{globalThis.structuredClone=clone;}
});

test('artifact adoption rejects changed content, raw getters and forged tokens without poisoning cache', async () => {
 const {prepareGraphArtifacts,graphArtifactsFor}=await import('../src/workflow/graph-artifacts.js?v=0.27.3');
 const root=siblingWorkflow(),token=prepareGraphArtifacts(root).data,other=structuredClone(root);other.nodes.source.x=52;
 const foreign=prepareGraphArtifacts(other).data;
 assert.equal(graphArtifactsFor(root,foreign).ok,false);
 assert.equal(graphArtifactsFor(root,structuredClone(token)).ok,false);
 assert.equal(prepareGraphArtifacts(root).data,token);
 let reads=0;Object.defineProperty(root.nodes.source,'unsafe',{enumerable:true,configurable:true,get(){reads++;return 'unsafe';}});
 assert.equal(graphArtifactsFor(root,token).ok,false);assert.equal(prepareGraphArtifacts(root).ok,false);assert.equal(reads,0);
 delete root.nodes.source.unsafe;assert.equal(prepareGraphArtifacts(root).data,token);
 root.nodes.source.x=52;assert.equal(graphArtifactsFor(root,token).ok,false);
 assert.notEqual(prepareGraphArtifacts(root).data,token);
});

test('checked document clones still reject forged, stale, unbounded and accessor-bearing raw roots', async()=>{
 const {prepareGraphArtifacts}=await import('../src/workflow/graph-artifacts.js?v=0.27.3');
 const {cloneWorkflowDocument}=await import('../src/workflow/document.js?v=0.27.3');
 const root=siblingWorkflow(),checkedArtifacts=prepareGraphArtifacts(root).data;
 assert.equal(cloneWorkflowDocument(root,{checkedArtifacts:structuredClone(checkedArtifacts)}).ok,false);
 root.nodes.source.x=51;assert.equal(cloneWorkflowDocument(root,{checkedArtifacts}).ok,false);
 assert.equal(cloneWorkflowDocument(root).ok,true,'raw callers still validate changed valid data');
 let reads=0;Object.defineProperty(root.nodes.source,'unsafe',{enumerable:true,configurable:true,get(){reads++;return true;}});
 assert.equal(cloneWorkflowDocument(root,{checkedArtifacts}).ok,false);assert.equal(cloneWorkflowDocument(root).ok,false);assert.equal(reads,0);
 delete root.nodes.source.unsafe;root.description='x'.repeat(2000001);
 assert.equal(cloneWorkflowDocument(root,{checkedArtifacts}).ok,false);assert.equal(cloneWorkflowDocument(root).ok,false);
});

test('warm source artifacts preserve factory mutation preconditions and raw clone compatibility', async()=>{
 const {prepareGraphArtifacts}=await import('../src/workflow/graph-artifacts.js?v=0.27.3');
 const {prepareNativeConnectionEdit}=await import('../src/workflow/connection-edits.js?v=0.27.3');
 const root=siblingWorkflow(),captured=context(root),before=structuredClone(root);
 assert.equal(prepareGraphArtifacts(root).ok,true);let calls=0;
 const prepared=prepareNativeConnectionEdit(root,{kind:'create',operation:'text',graphPoint:{x:2,y:3}},{idFactory(){calls++;root.nodes.source.title='factory mutation';return 'factory-created';}});
 assert.equal(prepared.ok,true);assert.equal(calls,1);
 assert.equal(prepared.data.candidate.nodes.source.title,before.nodes.source.title);
 assert.equal(transactions.commitPreparedGraph(root,{...prepared.data,context:captured}).ok,false);
 const raw=siblingWorkflow();Object.defineProperty(raw.nodes.source,'hiddenMetadata',{value:true,enumerable:false});
 assert.equal(prepareGraphArtifacts(raw).ok,false);
 assert.equal(prepareNativeConnectionEdit(raw,{kind:'create',operation:'text',graphPoint:{x:0,y:0}}).ok,true,'raw validation/clone fallback remains compatible');
});
