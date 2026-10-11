import assert from 'node:assert/strict';
import { withNativeBoundary } from './helpers/workflow-fixtures.mjs';
const { validateWorkflow } = await import('../src/workflow/contracts.js');
function fixturePreGraph() {
    const graph = { id: 'contracts', name: 'Contracts', schema: 3, runtime: 2, mode: 'native-unified', roles: { Analysis: { profileId: null, model: null } }, nodes: {
        source: { id: 'source', type: 'workflow', operation: 'scene-context', enabled: true, x: 0, y: 0 },
        compact: { id: 'compact', type: 'workflow', operation: 'smart-compactor', enabled: true, x: 0, y: 100, targetTokens: 1200, keepRecent: 2, method: 'select', pins: [] },
        plan: { id: 'plan', type: 'workflow', operation: 'response-plan', enabled: true, modelRole: 'Analysis', x: 0, y: 200, maxTokens: 768 },
        output: { id: 'output', type: 'workflow', operation: 'guidance', enabled: true, x: 0, y: 300, budgetTokens: 768 },
    }, wires: { a: { id: 'a', route: 'wire', from: 'source', fromPort: 'out', to: 'compact', toPort: 'in' }, b: { id: 'b', route: 'wire', from: 'compact', fromPort: 'out', to: 'plan', toPort: 'in' }, c: { id: 'c', route: 'wire', from: 'plan', fromPort: 'out', to: 'output', toPort: 'in' } }, groups: {} };
    for (const node of Object.values(graph.nodes)) node.phase = 'pre';
    return withNativeBoundary(graph, 'output');
}
const graph = fixturePreGraph();
graph.nodes.plan.y = -500;
assert.deepEqual(validateWorkflow(graph).data.primitives.filter(unit => unit.included).map(unit => unit.node).map(n => n.id), ['source', 'compact', 'plan', 'output', 'on-send', 'generate-reply', 'review-publish']);

// A wire cycle must fail before execution, even when positions suggest an order.
const cycle = fixturePreGraph();
cycle.wires.a.from = 'compact';
assert.equal(validateWorkflow(cycle).error?.code, 'CYCLE');
const dangling = fixturePreGraph();
dangling.wires.a.from = 'missing';
assert.equal(validateWorkflow(dangling).error?.code, 'DANGLING_WIRE');
const wrongPhase = fixturePreGraph();
assert.equal(validateWorkflow(wrongPhase, { phase: 'post' }).error?.code, 'WRONG_PHASE');
const wrongKind = fixturePreGraph();
wrongKind.wires.c.from = 'source';
assert.equal(validateWorkflow(wrongKind).error?.code, 'ARTIFACT_KIND');
const unknown = fixturePreGraph();
unknown.nodes.plan.operation = 'future-plan';
assert.equal(validateWorkflow(unknown).error?.code, 'UNKNOWN_OPERATION');
const future = fixturePreGraph();
future.runtime = 3;
assert.equal(validateWorkflow(future).error?.code, 'UNSUPPORTED_VERSION');
const ambiguous = fixturePreGraph();
ambiguous.wires.extra = { id: 'extra', route: 'wire', from: 'source', fromPort: 'out', to: 'plan', toPort: 'in' };
assert.equal(validateWorkflow(ambiguous).error?.code, 'AMBIGUOUS_INPUT');
const disabled = fixturePreGraph();
disabled.nodes.compact.enabled = false;
assert.equal(validateWorkflow(disabled).error?.code, 'DISABLED_OPERATION');
const invalidNumber = fixturePreGraph();
invalidNumber.nodes.compact.targetTokens = 0;
assert.equal(validateWorkflow(invalidNumber).error?.code, 'INVALID_SETTINGS');
const noTerminal = fixturePreGraph();
delete noTerminal.nodes['review-publish']; delete noTerminal.wires.draft;
assert.equal(validateWorkflow(noTerminal).error?.code, 'MISSING_TERMINAL');
assert.match(validateWorkflow(noTerminal).error?.message, /Review.*Publish/i);
const reachable = fixturePreGraph();
reachable.nodes.compact.method = 'compress';
reachable.nodes.unused = { id: 'unused', type: 'workflow', operation: 'response-plan', maxTokens: 768 };
assert.deepEqual({ ids: validateWorkflow(reachable).data.primitives.filter(unit => unit.included).map(unit => unit.node).map(n => n.id), bound: validateWorkflow(reachable).data.callBound }, { ids: ['source', 'compact', 'plan', 'output', 'on-send', 'generate-reply', 'review-publish'], bound: 2 });
// Malformed external objects fail safely rather than throwing or trusting prototypes.
const malformed = [null, [], { ...fixturePreGraph(), nodes: null }, Object.assign(Object.create({ injected: true }), fixturePreGraph()), { ...fixturePreGraph(), name: 'x'.repeat(2000001) }];
for (const item of malformed) assert.equal(validateWorkflow(item).error?.code, 'MALFORMED_WORKFLOW');
// All stored operation settings are checked, including unreachable blocks.
const badSettings = fixturePreGraph();
badSettings.nodes.unused = { id: 'unused', type: 'workflow', operation: 'smart-compactor', method: 'recursive', pins: [], targetTokens: 1200 };
assert.equal(validateWorkflow(badSettings).error?.code, 'INVALID_SETTINGS');
const missingInput = fixturePreGraph();
delete missingInput.wires.a;
assert.equal(validateWorkflow(missingInput).error?.code, 'MISSING_INPUT');
// Graph-level settings are validated before any host bindings are resolved.
const invalidBindings = fixturePreGraph();
invalidBindings.roles.Analysis.profileId = 42;
assert.equal(validateWorkflow(invalidBindings).error?.code, 'INVALID_SETTINGS');
const { exportWorkflow, parseWorkflow } = await import('../src/workflow/packages.js');
const portable = fixturePreGraph();
portable.template = { id: 'scene-guidance', version: 1 };
portable.roles.Analysis = { profileId: 'local-profile', model: 'preferred-model' };
portable.nodes.plan.profileId = 'override-profile';
portable.nodes.plan.model = 'node-model';
portable.groups.compound = { id: 'compound', title: 'Formation', members: ['compact', 'plan'], collapsed: true };
portable.nodes.compact.inGroup = 'compound'; portable.nodes.plan.inGroup = 'compound';
const envelope = exportWorkflow(portable);
assert.deepEqual([envelope.kind, envelope.schema, envelope.minRuntime], ['lattice-workflow', 2, 2]);
const roundtrip = parseWorkflow(JSON.stringify(envelope));
assert.equal(roundtrip.ok, true);
const expectedPortable = structuredClone(portable);
expectedPortable.roles.Analysis.profileId = null; expectedPortable.nodes.plan.profileId = null;
assert.deepEqual(roundtrip.data, expectedPortable);
const legacyEnvelope = { ...envelope, kind: 'comfytavern-workflow' };
assert.equal(parseWorkflow(JSON.stringify(legacyEnvelope)).error.code, 'UNSUPPORTED_PACKAGE');
assert.equal(parseWorkflow(JSON.stringify({ ...legacyEnvelope, minRuntime: 3 })).error?.code, 'UNSUPPORTED_PACKAGE');
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, kind: 'unrelated-workflow' })).error?.code, 'UNSUPPORTED_PACKAGE');
assert.equal(portable.nodes.plan.profileId, 'override-profile', 'export never mutates the saved instance');
const futurePackage = { ...envelope, schema: 3 };
assert.equal(parseWorkflow(JSON.stringify(futurePackage)).error?.code, 'UNSUPPORTED_PACKAGE');
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, minRuntime: 3 })).error?.code, 'UNSUPPORTED_PACKAGE');
assert.deepEqual(validateWorkflow(reachable).data.requiredRoles, ['Analysis'], 'setup derives unique reachable call roles from descriptors');
const inheritedOperation = fixturePreGraph();
inheritedOperation.nodes.plan.operation = '__proto__';
assert.equal(validateWorkflow(inheritedOperation).error?.code, 'UNKNOWN_OPERATION');
for (const extra of [{ from: 42 }, { fromPort: null }, { toPort: [] }, { loop: { max: 3 } }, { port: 'out' }]) {
    const badWire = fixturePreGraph(); Object.assign(badWire.wires.a, extra);
    assert.equal(validateWorkflow(badWire).error?.code, 'INVALID_WIRE');
}
const secretPackage = structuredClone(envelope);
secretPackage.graph.nodes.plan.apiKey = 'synthetic-do-not-persist';
assert.equal(parseWorkflow(JSON.stringify(secretPackage)).error?.code, 'MALFORMED_WORKFLOW');
const annotated = fixturePreGraph();
annotated.nodes.note = { id: 'note', type: 'note', content: 'An editor annotation', x: 100, y: 100 };
assert.equal(validateWorkflow(annotated).ok, true);
assert.deepEqual(validateWorkflow(annotated).data.primitives.filter(unit => unit.included).map(unit => unit.node).map(n => n.id), ['source', 'compact', 'plan', 'output', 'on-send', 'generate-reply', 'review-publish']);
const brokenFormation = fixturePreGraph();
brokenFormation.groups.formation = { id: 'formation', members: ['missing', 'plan'] };
assert.equal(validateWorkflow(brokenFormation).error?.code, 'INVALID_GROUP');
const futureFormation = fixturePreGraph();
futureFormation.groups.formation = { id: 'formation', members: ['compact', 'compact'] };
assert.equal(validateWorkflow(futureFormation).error?.code, 'INVALID_GROUP');
const offGroup = fixturePreGraph();
offGroup.groups.off = { id: 'off', collapsed: true }; offGroup.nodes.compact.inGroup = 'off';
assert.equal(validateWorkflow(offGroup).ok, true, 'visual group state does not disable executable nodes');
const scanOnly = { id: 'post', schema: 3, runtime: 2, mode: 'native-unified', roles: { Prose: { profileId: null, model: null } }, nodes: {
    source: { id: 'source', type: 'workflow', operation: 'reply-snapshot' },
    scan: { id: 'scan', type: 'workflow', operation: 'pattern' },
    repair: { id: 'repair', type: 'workflow', operation: 'repair', mode: 'scan' },
    validate: { id: 'validate', type: 'workflow', operation: 'validate-patches' },
    review: { id: 'review', type: 'workflow', operation: 'review-gate' },
    apply: { id: 'apply', type: 'workflow', operation: 'apply-reply' },
}, wires: { a: { id: 'a', route: 'wire', from: 'source', fromPort: 'out', to: 'scan', toPort: 'in' }, b: { id: 'b', route: 'wire', from: 'scan', fromPort: 'out', to: 'repair', toPort: 'in' }, c: { id: 'c', route: 'wire', from: 'repair', fromPort: 'out', to: 'validate', toPort: 'in' }, d: { id: 'd', route: 'wire', from: 'validate', fromPort: 'out', to: 'review', toPort: 'in' }, e: { id: 'e', route: 'wire', from: 'review', fromPort: 'out', to: 'apply', toPort: 'in' } } };
for (const node of Object.values(scanOnly.nodes)) node.phase = 'post';
const scanTarget = { workflowId: scanOnly.id, instancePath: [], nodeId: 'review', portId: 'out' };
assert.equal(validateWorkflow(scanOnly, { target: scanTarget }).data.callBound, 0);
assert.deepEqual(validateWorkflow(scanOnly, { target: scanTarget }).data.requiredRoles, []);
scanOnly.nodes.repair.mode = 'repair';
assert.equal(validateWorkflow(scanOnly, { target: scanTarget }).data.callBound, 1);
assert.deepEqual(validateWorkflow(scanOnly, { target: scanTarget }).data.requiredRoles, ['Prose']);
assert.equal(validateWorkflow(fixturePreGraph()).data.callBound, 1);
assert.throws(() => exportWorkflow(secretPackage.graph));
assert.equal(parseWorkflow('x'.repeat(2000001)).ok, false);
assert.equal(parseWorkflow('{"kind":"comfytavern-workflow","schema":1,"minRuntime":1,"__proto__":{}}').ok, false);



// A JSON object reference must produce typed failure before property-key coercion.
const objectWireFrom = fixturePreGraph();
objectWireFrom.wires.a.from = { toString: null, valueOf: null };
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: objectWireFrom })).error?.code, 'INVALID_WIRE');
const objectWireTo = fixturePreGraph();
objectWireTo.wires.a.to = { toString: null, valueOf: null };
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: objectWireTo })).error?.code, 'INVALID_WIRE');
const objectGroupIdentity = fixturePreGraph();
objectGroupIdentity.groups.ordinary = { id: { toString: null, valueOf: null } };
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: objectGroupIdentity })).error?.code, 'INVALID_GROUP');
const objectGroupMember = fixturePreGraph();
objectGroupMember.groups.ordinary = { id: 'ordinary', members: [{ toString: null, valueOf: null }] };
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: objectGroupMember })).error?.code, 'INVALID_GROUP');
const objectNodeGroup = fixturePreGraph();
objectNodeGroup.nodes.compact.inGroup = { toString: null, valueOf: null };
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: objectNodeGroup })).error?.code, 'INVALID_SETTINGS');
function fixtureVisualGroupGraph() {
    const graph = structuredClone(scanOnly);
    graph.groups = { formation: { id: 'formation', members: ['scan', 'repair', 'validate'] } };
    for (const id of ['scan', 'repair', 'validate']) graph.nodes[id].inGroup = 'formation';
    return graph;
}
const detachedMember = fixtureVisualGroupGraph();
delete detachedMember.nodes.repair.inGroup;
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: detachedMember })).error?.code, 'INVALID_GROUP', 'declared members must appear in the canvas group');
const undeclaredMember = fixtureVisualGroupGraph();
undeclaredMember.nodes.source.inGroup = 'formation';
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: undeclaredMember })).error?.code, 'INVALID_GROUP', 'canvas members must agree with the declared visual group');
const objectOperation = fixturePreGraph();
objectOperation.nodes.plan.operation = { toString: null, valueOf: null };
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: objectOperation })).error?.code, 'UNKNOWN_OPERATION');
const objectGraphName = fixturePreGraph();
objectGraphName.name = { toString: null, valueOf: null };
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: objectGraphName })).error?.code, 'INVALID_SETTINGS');
const inheritedReference = fixturePreGraph();
inheritedReference.groups.ordinary = { id: 'ordinary', members: ['toString'] };
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: inheritedReference })).error?.code, 'INVALID_GROUP', 'references must point to saved own nodes');
const inheritedGroup = fixturePreGraph();
inheritedGroup.nodes.compact.inGroup = 'toString';
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: inheritedGroup })).error?.code, 'INVALID_SETTINGS');
const ordinaryGroup = fixturePreGraph();
ordinaryGroup.groups.ordinary = { id: 'ordinary', title: 'Plain group' };
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: ordinaryGroup })).ok, true, 'ordinary groups keep optional visual membership');
assert.equal(parseWorkflow(JSON.stringify({ ...envelope, graph: fixtureVisualGroupGraph() })).ok, true, 'complete canvas-aligned visual groups still import');
console.log('workflow-contracts: ok');
