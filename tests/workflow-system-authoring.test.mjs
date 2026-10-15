import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operationDefaults } from '../src/workflow/catalog.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { graphDocumentSignature } from '../src/workflow/ports.js';
import { ownsDefinitionPath } from '../src/workflow/composition-edit.js';
const api = await import('../src/workflow/system-authoring.js').catch(() => ({}));
const wire = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
const node = (id, operation, settings = {}) => ({ id, type: 'workflow', ...operationDefaults(operation), ...settings });
function root() { return { id: 'main', schema: 3, runtime: 2, mode: 'native-unified', nodes: { send: node('send', 'on-send'), generate: node('generate', 'generate-reply'), review: node('review', 'review-publish') }, wires: { send: wire('send', 'send', 'activation', 'generate', 'activation'), review: wire('review', 'generate', 'draft', 'review', 'draft') }, definitions: {}, portals: {} }; }
function helper() { const identity = computeDefinitionIdentity({ id: 'weather', version: 1, name: 'Weather', parameters: [], interface: [{ id: 'guidance', label: 'Guidance', kind: 'guidance', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'output' }], body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { compose: node('compose', 'compose', { outputKind: 'guidance', sections: [{ name: 'weather', text: 'Rain.' }] }), output: { id: 'output', type: 'subgraph-output', interfacePortId: 'guidance' } }, wires: { result: wire('result', 'compose', 'out', 'output', 'in') } } }); assert.equal(identity.ok, true, JSON.stringify(identity)); return { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash }; }
function command(definition, extra = {}) { const result = { definition, snapshots: {}, graphPoint: { x: 100, y: 100 }, inputs: {}, outputs: [], parameterOverrides: {}, guidance: { outputPortId: 'guidance', destination: { kind: 'new-compose' } }, ...extra }; if (result.guidance === undefined)
    delete result.guidance; return result; }
test('Add system prepares local editable body, optional Guidance merge and wires as one original-precondition edit', () => {
    const graph = root(), definition = helper(), before = structuredClone(graph);
    assert.equal(typeof api.prepareAddSystem, 'function', 'atomic authoring producer exists');
    const result = api.prepareAddSystem(graph, command(definition));
    assert.equal(result.ok, true, JSON.stringify(result));
    const edit = result.data, wrapper = edit.candidate.nodes[edit.instanceId];
    assert.deepEqual(graph, before);
    assert.deepEqual(edit.viewPath, []);
    assert.equal(edit.baseDocumentSignature, graphDocumentSignature(graph));
    assert.equal(wrapper.type, 'subgraph');
    assert.notDeepEqual(wrapper.definition, { id: definition.id, version: definition.version, semanticHash: definition.semanticHash });
    assert.equal(ownsDefinitionPath(edit.candidate, [edit.instanceId]), true);
    assert.ok(edit.candidate.definitions[definitionRefKey(definition)]);
    const compose = Object.values(edit.candidate.nodes).find(n => n.operation === 'compose');
    assert.deepEqual(compose.sections, [{ name: 'Weather', text: '', kind: 'guidance', required: false, onSkipped: 'omit' }]);
    assert.ok(Object.values(edit.candidate.wires).some(w => w.from === edit.instanceId && w.to === compose.id && w.toPort === 'section.Weather'));
    assert.ok(Object.values(edit.candidate.wires).some(w => w.from === compose.id && w.to === 'generate' && w.toPort === 'guidance'));
});
export { root, helper, command, node, wire };
test('template merges append a rendered optional section and preserve existing sections', () => {
    const graph = root();
    graph.nodes.merge = node('merge', 'compose', { outputKind: 'guidance', mode: 'template', template: 'Before {{section:old}}', separator: ' | ', sections: [{ name: 'old', text: 'Original' }] });
    graph.wires.guidance = wire('guidance', 'merge', 'out', 'generate', 'guidance');
    const result = api.prepareAddSystem(graph, command(helper(), { guidance: { outputPortId: 'guidance', destination: { kind: 'existing-compose', nodeId: 'merge' } } }));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.candidate.nodes.merge.template, 'Before {{section:old}} | {{section:Weather}}');
    assert.equal(result.data.preview[0].kind, 'template');
});
test('merge projection follows direct, portal and rendered Compose chains but excludes orphan and unused sections', () => {
    const graph = root();
    for (const id of ['inner', 'outer', 'orphan'])
        graph.nodes[id] = node(id, 'compose', { outputKind: 'guidance', sections: [{ name: 'inner', text: '', kind: 'guidance' }] });
    graph.wires.guidance = wire('guidance', 'outer', 'out', 'generate', 'guidance');
    graph.wires.inner = wire('inner', 'inner', 'out', 'outer', 'section.inner');
    assert.deepEqual(api.projectGuidanceMerges(graph).data.destinations.map(d => d.nodeId), ['outer', 'inner']);
    graph.nodes.outer.mode = 'template';
    graph.nodes.outer.template = '{{{{section:inner}}';
    assert.deepEqual(api.projectGuidanceMerges(graph).data.destinations.map(d => d.nodeId), ['outer']);
    graph.nodes.outer.template = '{{section:inner}}';
    graph.portals.portal = { id: 'portal', label: 'Inner', kind: 'guidance', source: { nodeId: 'inner', portId: 'out' } };
    graph.wires.inner = { id: 'inner', route: 'portal', portalId: 'portal', to: 'outer', toPort: 'section.inner' };
    assert.deepEqual(api.projectGuidanceMerges(graph).data.destinations.map(d => d.nodeId), ['outer', 'inner']);
});
test('occupied generator and occupied destination never replace bindings or mutate Main', () => {
    const graph = root();
    graph.nodes.existing = node('existing', 'compose', { outputKind: 'guidance' });
    graph.wires.guidance = wire('guidance', 'existing', 'out', 'generate', 'guidance');
    const before = structuredClone(graph);
    assert.equal(api.prepareAddSystem(graph, command(helper())).error.code, 'OCCUPIED_GUIDANCE');
    assert.equal(api.prepareAddSystem(graph, command(helper(), { guidance: undefined, outputs: [{ outputPortId: 'guidance', destination: { nodeId: 'generate', portId: 'guidance' } }] })).error.code, 'AMBIGUOUS_INPUT');
    assert.deepEqual(graph, before);
});
test('required typed system inputs can remain unbound at placement and invalid commands leave the source untouched', () => {
    const original = helper(), draft = structuredClone(original);
    delete draft.semanticHash;
    draft.interface.push({ id: 'data', label: 'Data', direction: 'input', kind: 'data', required: true, cardinality: 'one', boundaryNodeId: 'input' });
    draft.body.nodes.input = { id: 'input', type: 'subgraph-input', interfacePortId: 'data' };
    const identity = computeDefinitionIdentity(draft);
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    const graph = root(), before = structuredClone(graph);
    const placed = api.prepareAddSystem(graph, command(definition, { guidance: undefined }));
    assert.equal(placed.ok, true, JSON.stringify(placed));
    assert.equal(Object.values(placed.data.candidate.wires).some(w => w.to === placed.data.instanceId), false);
    assert.equal(api.prepareAddSystem(graph, command(definition, { inputs: { data: { nodeId: 'send', portId: 'draft' } } })).ok, false);
    assert.deepEqual(graph, before);
});
test('state-only definitions add without forcing an output injection and sibling copies stay independent', () => {
    const draft = { id: 'state', version: 1, name: 'State', parameters: [], interface: [], body: { schema: 3, runtime: 2, mode: 'native-post', nodes: { text: node('text', 'text', { text: 'Notes', phase: 'post' }), read: node('read', 'read-file'), write: node('write', 'write-file') }, wires: { write: wire('write', 'text', 'out', 'write', 'text'), reference: wire('reference', 'read', 'reference', 'write', 'reference') } } };
    const identity = computeDefinitionIdentity(draft);
    assert.equal(identity.ok, true, JSON.stringify(identity));
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    const first = api.prepareAddSystem(root(), command(definition, { guidance: undefined }));
    assert.equal(first.ok, true, JSON.stringify(first));
    const second = api.prepareAddSystem(first.data.candidate, command(definition, { guidance: undefined }));
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.notEqual(second.data.candidate.nodes[first.data.instanceId].definition.id, second.data.candidate.nodes[second.data.instanceId].definition.id);
    assert.equal(Object.values(second.data.candidate.nodes).some(n => n.operation === 'compose'), false);
});
test('wrapper enabled edit bypasses primitive description and preserves its saved pin', async () => {
    const { prepareNativeNodeEdit } = await import('../src/workflow/definition-library.js');
    const inserted = api.prepareAddSystem(root(), command(helper()));
    const g = inserted.data.candidate, ref = structuredClone(g.nodes[inserted.data.instanceId].definition);
    const result = prepareNativeNodeEdit(g, { kind: 'enabled', viewPath: [], nodeId: inserted.data.instanceId, value: false });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.data.candidate.nodes[inserted.data.instanceId].enabled, false);
    assert.deepEqual(result.data.candidate.nodes[inserted.data.instanceId].definition, ref);
});
test('typed binding checks the declared boundary even when the body does not consume that input', () => {
    const draft = structuredClone(helper());
    delete draft.semanticHash;
    draft.interface.push({ id: 'data', label: 'Data', direction: 'input', kind: 'data', required: true, cardinality: 'one', boundaryNodeId: 'input' });
    draft.body.nodes.input = { id: 'input', type: 'subgraph-input', interfacePortId: 'data' };
    const identity = computeDefinitionIdentity(draft), definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    const graph = root();
    graph.nodes.text = node('text', 'text', { text: 'Wrong kind' });
    const result = api.prepareAddSystem(graph, command(definition, { inputs: { data: { nodeId: 'text', portId: 'out' } } }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'ARTIFACT_KIND');
});
test('ordinary Guidance forwards a real merge route, while an orphan native generator is not a Main destination', () => {
    const graph = root();
    graph.nodes.merge = node('merge', 'compose', { outputKind: 'guidance' });
    graph.nodes.forward = node('forward', 'guidance');
    graph.wires.merge = wire('merge', 'merge', 'out', 'forward', 'in');
    graph.wires.guidance = wire('guidance', 'forward', 'out', 'generate', 'guidance');
    assert.deepEqual(api.projectGuidanceMerges(graph).data.destinations.map(d => d.nodeId), ['merge']);
    delete graph.wires.review;
    assert.equal(api.projectGuidanceMerges(graph).ok, false);
});

test('atomic Add system transaction undoes the complete closure, rejects stale documents and section-limit failures',async()=>{
 const {captureGraphEditContext,commitPreparedGraph}=await import('../src/workflow/transactions.js');const H=await import('../src/history.js?v=0.27.3');const graph=root(),before=structuredClone(graph);H.track(graph);const context=captureGraphEditContext(graph,()=>({sessionId:'root',viewPath:[],readOnly:false}));const prepared=api.prepareAddSystem(graph,command(helper()));assert.equal(commitPreparedGraph(graph,{...prepared.data,context:context.data}).ok,true);assert.ok(H.undo(graph));assert.deepEqual(graph,before);assert.ok(H.redo(graph));assert.deepEqual(graph,prepared.data.candidate);
 const staleRoot=root(),staleContext=captureGraphEditContext(staleRoot,()=>({sessionId:'root',viewPath:[],readOnly:false})),stale=api.prepareAddSystem(staleRoot,command(helper()));staleRoot.description='Changed while preview open';const changed=structuredClone(staleRoot);assert.equal(commitPreparedGraph(staleRoot,{...stale.data,context:staleContext.data}).error.code,'STALE_DOCUMENT');assert.deepEqual(staleRoot,changed);
 const full=root();full.nodes.merge=node('merge','compose',{outputKind:'guidance',sections:Array.from({length:64},(_,i)=>({name:'section'+i,text:''}))});full.wires.guidance=wire('guidance','merge','out','generate','guidance');const fullBefore=structuredClone(full);assert.equal(api.prepareAddSystem(full,command(helper(),{guidance:{outputPortId:'guidance',destination:{kind:'existing-compose',nodeId:'merge'}}})).ok,false);assert.deepEqual(full,fullBefore);
});


test('ambiguous compatible source and merge choices carry distinct visible labels',()=>{
 const graph=root();graph.nodes.first=node('first','text',{text:'First'});graph.nodes.second=node('second','text',{text:'Second'});graph.nodes.inner=node('inner','compose',{outputKind:'guidance'});graph.nodes.outer=node('outer','compose',{outputKind:'guidance',sections:[{name:'inner',text:'',kind:'guidance'}]});graph.wires.inner=wire('inner','inner','out','outer','section.inner');graph.wires.guidance=wire('guidance','outer','out','generate','guidance');const projected=api.projectSystemAuthoring(graph,[{definition:helper(),snapshots:{}}]);assert.equal(projected.ok,true);const pins=projected.data.pins.filter(p=>['first','second'].includes(p.nodeId)&&p.direction==='output');assert.equal(new Set(pins.map(p=>p.label)).size,2);assert.equal(new Set(projected.data.destinations.map(d=>d.label)).size,2);
});

test('explicit system bindings reject reversed, unknown, wrong-direction and wrong-kind endpoints without changing Main', () => {
    const draft = structuredClone(helper());
    delete draft.semanticHash;
    draft.interface.push({ id: 'incoming', label: 'Incoming Guidance', direction: 'input', kind: 'guidance', required: false, cardinality: 'one', boundaryNodeId: 'input' });
    draft.body.nodes.input = { id: 'input', type: 'subgraph-input', interfacePortId: 'incoming' };
    const checked = computeDefinitionIdentity(draft);
    assert.equal(checked.ok, true, JSON.stringify(checked));
    const definition = { ...checked.data.materializedDefinition, semanticHash: checked.data.semanticHash };
    const graph = root();
    graph.nodes.source = node('source', 'compose', { outputKind: 'guidance' });
    graph.nodes.text = node('text', 'text', { text: 'Different kind' });
    graph.nodes.target = node('target', 'compose', { sections: [{ name: 'text', text: '' }] });
    const before = structuredClone(graph);
    const input = (port, source) => command(definition, { guidance: undefined, inputs: { [port]: source } });
    const output = (port, destination) => command(definition, { guidance: undefined, outputs: [{ outputPortId: port, destination }] });
    const cases = [
        ['input cannot name an output boundary', input('guidance', { nodeId: 'generate', portId: 'guidance' })],
        ['output cannot name an input boundary', output('incoming', { nodeId: 'source', portId: 'out' })],
        ['unknown input boundary', input('absent', { nodeId: 'source', portId: 'out' })],
        ['unknown output boundary', output('absent', { nodeId: 'generate', portId: 'guidance' })],
        ['unknown input source node', input('incoming', { nodeId: 'absent', portId: 'out' })],
        ['unknown output destination node', output('guidance', { nodeId: 'absent', portId: 'guidance' })],
        ['unknown input source port', input('incoming', { nodeId: 'source', portId: 'absent' })],
        ['unknown output destination port', output('guidance', { nodeId: 'generate', portId: 'absent' })],
        ['input source must be a Main output', input('incoming', { nodeId: 'generate', portId: 'guidance' })],
        ['output destination must be a Main input', output('guidance', { nodeId: 'source', portId: 'out' })],
        ['input kind must match declared boundary', input('incoming', { nodeId: 'text', portId: 'out' })],
        ['output kind must match declared boundary', output('guidance', { nodeId: 'target', portId: 'section.text' })],
    ];
    const accepted = [];
    for (const [label, malformed] of cases) {
        if (api.prepareAddSystem(graph, malformed).ok) accepted.push(label);
        assert.deepEqual(graph, before, label + ' must leave Main unchanged');
    }
    assert.deepEqual(accepted, [], 'every malformed binding must be rejected');
    const valid = api.prepareAddSystem(graph, command(definition, { guidance: undefined, inputs: { incoming: { nodeId: 'source', portId: 'out' } }, outputs: [{ outputPortId: 'guidance', destination: { nodeId: 'generate', portId: 'guidance' } }] }));
    assert.equal(valid.ok, true, JSON.stringify(valid));
    assert.deepEqual(graph, before, 'valid preparation also leaves Main unchanged');
});

test('Add system rejects root metadata and bound-node getters before evaluating them',async(t)=>{
 const definition=helper();
 for(const field of ['schema','runtime','mode','nodes','boundNode'])await t.test(field,()=>{
  const graph=root(),holder=field==='boundNode'?graph.nodes:graph,key=field==='boundNode'?'generate':field,value=holder[key];let reads=0;
  Object.defineProperty(holder,key,{enumerable:true,configurable:true,get(){reads++;return value;}});
  const result=api.prepareAddSystem(graph,command(definition,{guidance:undefined,outputs:[{outputPortId:'guidance',destination:{nodeId:'generate',portId:'guidance'}}]}));
  assert.equal(reads,0,field+' getter must not run during admission or binding checks');assert.equal(result.ok,false);
 });
});

test('admitted Add system inspection preserves immutable artifacts and exact live-root commit ownership',async()=>{
 const {prepareGraphArtifacts,inspectGraphArtifacts}=await import('../src/workflow/graph-artifacts.js?v=0.27.3');
 const {captureGraphEditContext,commitPreparedGraph}=await import('../src/workflow/transactions.js?v=0.27.3');
 const graph=root(),token=prepareGraphArtifacts(graph).data,owned=inspectGraphArtifacts(token),before=JSON.stringify(owned.snapshot);
 const current=()=>({sessionId:'add-system-admission',viewPath:[],readOnly:false});
 const captured=captureGraphEditContext(graph,current).data,edit=api.prepareAddSystem(graph,command(helper()));assert.equal(edit.ok,true,JSON.stringify(edit));
 assert.equal(prepareGraphArtifacts(graph).data,token);assert.equal(JSON.stringify(owned.snapshot),before);assert.ok(Object.isFrozen(owned.snapshot));
 const foreign=structuredClone(graph),foreignContext=captureGraphEditContext(foreign,current).data;
 assert.equal(commitPreparedGraph(foreign,{...edit.data,context:foreignContext}).ok,false,'checked insertion belongs to the original live root');
 assert.equal(commitPreparedGraph(graph,{...edit.data,context:captured}).ok,true,'inspecting a frozen snapshot must not rebind commit ownership');
});


test('bare saved-system placement retains exact closure and defaults in an editable local instance without connecting guidance', () => {
    const graph = root(), definition = helper();
    const result = api.prepareAddSystem(graph, { definition, snapshots: {}, graphPoint: { x: 100, y: 100 } });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(ownsDefinitionPath(result.data.candidate, [result.data.instanceId]), true);
    assert.deepEqual(result.data.candidate.definitions[definitionRefKey(definition)], definition);
    assert.deepEqual(result.data.candidate.wires, graph.wires);
    assert.equal(Object.values(result.data.candidate.nodes).filter(n => n.type === 'subgraph').length, 1);
});

test('later assistance targets the placed instance and has separate Undo, cancellation and stale-preview boundaries', async () => {
    const { captureGraphEditContext, commitPreparedGraph } = await import('../src/workflow/transactions.js');
    const H = await import('../src/history.js?v=0.27.3');
    const graph = root(), initial = structuredClone(graph), current = () => ({ sessionId: 'assist', viewPath: [], readOnly: false });
    H.track(graph);
    const placement = api.prepareAddSystem(graph, command(helper(), { guidance: undefined }));
    assert.equal(placement.ok, true, JSON.stringify(placement));
    assert.equal(commitPreparedGraph(graph, { ...placement.data, context: captureGraphEditContext(graph, current).data }).ok, true);
    const placed = structuredClone(graph), instanceId = placement.data.instanceId;
    assert.equal(typeof api.prepareSystemAssistance, 'function', 'existing-instance assistance exists');
    const context = captureGraphEditContext(graph, current).data;
    const assisted = api.prepareSystemAssistance(graph, { instanceId, expectedInstanceRef: graph.nodes[instanceId].definition, graphPoint: { x: 100, y: 100 }, inputs: {}, outputs: [], parameterOverrides: {}, guidance: { outputPortId: 'guidance', destination: { kind: 'new-compose' } } });
    assert.equal(assisted.ok, true, JSON.stringify(assisted));
    assert.deepEqual(graph, placed, 'preview or cancellation leaves the placed instance intact');
    assert.equal(Object.values(assisted.data.candidate.nodes).filter(n => n.type === 'subgraph').length, 1);
    assert.deepEqual(assisted.data.candidate.nodes[instanceId].definition, graph.nodes[instanceId].definition);
    assert.equal(commitPreparedGraph(graph, { ...assisted.data, context }).ok, true);
    assert.ok(H.undo(graph)); assert.deepEqual(graph, placed, 'first Undo removes assistance only');
    assert.ok(H.undo(graph)); assert.deepEqual(graph, initial, 'second Undo removes placement');
    assert.ok(H.redo(graph));
    const staleContext = captureGraphEditContext(graph, current).data;
    const stale = api.prepareSystemAssistance(graph, { instanceId, expectedInstanceRef: graph.nodes[instanceId].definition, graphPoint: { x: 100, y: 100 }, inputs: {}, outputs: [], parameterOverrides: {}, guidance: { outputPortId: 'guidance', destination: { kind: 'new-compose' } } });
    assert.equal(stale.ok, true, JSON.stringify(stale));
    graph.description = 'Changed after preview'; const changed = structuredClone(graph);
    assert.equal(commitPreparedGraph(graph, { ...stale.data, context: staleContext }).error.code, 'STALE_DOCUMENT');
    assert.deepEqual(graph, changed);
});


test('assistance rejects malformed exact pins and occupied destinations without changing the placed system', () => {
    const placement = api.prepareAddSystem(root(), command(helper(), { guidance: undefined }));
    const graph = placement.data.candidate, instanceId = placement.data.instanceId;
    graph.nodes.existing = node('existing', 'compose', { outputKind: 'guidance' });
    graph.wires.guidance = wire('guidance', 'existing', 'out', 'generate', 'guidance');
    const before = structuredClone(graph);
    const base = { instanceId, expectedInstanceRef: graph.nodes[instanceId].definition, graphPoint: { x: 0, y: 0 } };
    assert.equal(api.prepareSystemAssistance(graph, { ...base, expectedInstanceRef: { ...base.expectedInstanceRef, extra: true } }).ok, false, 'only an exact reference shape is accepted');
    assert.equal(api.prepareSystemAssistance(graph, { ...base, outputs: [{ outputPortId: 'guidance', destination: { nodeId: 'generate', portId: 'guidance' } }] }).error.code, 'AMBIGUOUS_INPUT');
    assert.equal(api.prepareSystemAssistance(graph, { ...base, guidance: { outputPortId: 'guidance', destination: { kind: 'new-compose' } } }).error.code, 'OCCUPIED_GUIDANCE');
    assert.deepEqual(graph, before);
});

test('default exposed settings survive placement and later overrides configure the existing wrapper', () => {
    const draft = structuredClone(helper()); delete draft.semanticHash;
    draft.parameters = [{ id: 'separator', label: 'Separator', target: { instancePath: [], nodeId: 'compose', controlId: 'separator' } }];
    draft.body.nodes.compose.separator = ' | ';
    const checked = computeDefinitionIdentity(draft); assert.equal(checked.ok, true, JSON.stringify(checked));
    const definition = { ...checked.data.materializedDefinition, semanticHash: checked.data.semanticHash };
    const placed = api.prepareAddSystem(root(), { definition, snapshots: {}, graphPoint: { x: 0, y: 0 } }); assert.equal(placed.ok, true, JSON.stringify(placed));
    const graph = placed.data.candidate, instanceId = placed.data.instanceId, ref = graph.nodes[instanceId].definition;
    assert.equal(graph.definitions[definitionRefKey(ref)].body.nodes.compose.separator, ' | ');
    assert.deepEqual(graph.nodes[instanceId].parameterOverrides, {});
    const assisted = api.prepareSystemAssistance(graph, { instanceId, expectedInstanceRef: ref, graphPoint: { x: 0, y: 0 }, parameterOverrides: { separator: ' / ' } });
    assert.equal(assisted.ok, true, JSON.stringify(assisted));
    assert.deepEqual(assisted.data.candidate.nodes[instanceId].parameterOverrides, { separator: ' / ' });
    assert.deepEqual(assisted.data.candidate.nodes[instanceId].definition, ref);
    assert.deepEqual(assisted.data.addedNodeIds, []);
    assert.deepEqual(assisted.data.addedEdgeIds, []);
});


test('system chooser and explicit guidance routes remain available beside included incomplete settings', async () => {
    const { resolveWorkflow } = await import('../src/workflow/resolve.js');
    const graph = root(); graph.nodes.shortcut = node('shortcut', 'hotkey-arm');
    graph.wires.send = wire('send', 'shortcut', 'proposal', 'generate', 'activation');
    assert.equal(resolveWorkflow(graph).ok, false, 'incomplete shortcut blocks execution');
    const projected = api.projectSystemAuthoring(graph, [{ definition: helper(), snapshots: {} }]);
    assert.equal(projected.ok, true, JSON.stringify(projected));
    assert.equal(projected.data.choices[0].name, 'Weather');
    assert.equal(projected.data.canCreate, true);
    const placed = api.prepareAddSystem(graph, { definition: helper(), snapshots: {}, graphPoint: { x: 0, y: 0 } });
    assert.equal(placed.ok, true, JSON.stringify(placed));
});
