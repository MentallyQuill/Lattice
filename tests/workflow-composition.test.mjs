import assert from 'node:assert/strict';
import { validateGraphStructure, validateWorkflow } from '../src/workflow/contracts.js';
import { graphSemanticSignature } from '../src/workflow/ports.js';
import * as definitions from '../src/workflow/definitions.js';
import * as catalog from '../src/workflow/catalog.js';

const root = () => ({ id: 'root', schema: 3, runtime: 2, mode: 'native-unified', nodes: {
    source: { id: 'source', type: 'workflow', operation: 'scene-context' },
    compact: { id: 'compact', type: 'workflow', operation: 'smart-compactor' },
}, wires: { edge: { id: 'edge', route: 'portal', portalId: 'shared', to: 'compact', toPort: 'in' } },
portals: { shared: { id: 'shared', label: 'Context', kind: 'context', source: { nodeId: 'source', portId: 'out' } } }, definitions: {} });

// Hidden dependencies participate in named validation before any execution completeness checks.
assert.equal(validateGraphStructure(root()).ok, true);
assert.equal(validateWorkflow(root()).error.code, 'MISSING_TERMINAL', 'supported schema3 authoring still needs a terminal for a full run');
for (const [change, code] of [
    [g => { delete g.portals.shared; }, 'MISSING_PORTAL'],
    [g => { g.portals.shared.source.nodeId = 'other/scope'; }, 'DANGLING_WIRE'],
    [g => { g.wires.ordinary = { id: 'ordinary', route: 'wire', from: 'source', fromPort: 'out', to: 'compact', toPort: 'in' }; }, 'AMBIGUOUS_INPUT'],
    [g => { g.portals.shared.source.nodeId = 'compact'; }, 'CYCLE'],
]) { const g = root(); change(g); assert.equal(validateGraphStructure(g).error.code, code); }

const definitionDraft = () => ({ id: 'compact-definition', version: 1, name: 'Compact', interface: [
    { id: 'input', label: 'Input', kind: 'context', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'entry' },
    { id: 'output', label: 'Output', kind: 'context', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'exit' },
], parameters: [{ id: 'method', label: 'Method', target: { instancePath: [], nodeId: 'work', controlId: 'method' } }], body: {
    schema: 3, runtime: 2, mode: 'native-pre', roles: { Analysis: { profileId: 'local', model: 'model' } }, nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'input' },
        work: { id: 'work', type: 'workflow', operation: 'smart-compactor' },
        exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'output' },
    }, wires: { a: { id: 'a', route: 'wire', from: 'entry', fromPort: 'out', to: 'work', toPort: 'in' }, b: { id: 'b', route: 'wire', from: 'work', fromPort: 'out', to: 'exit', toPort: 'in' } },
} });
const finalize = draft => { const value = definitions.computeDefinitionIdentity(draft); assert.equal(value.ok, true); return { ...structuredClone(value.data.materializedDefinition), semanticHash: value.data.semanticHash }; };
const refFor = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });
const snapshot = finalize(definitionDraft());
const instance = id => ({ id, type: 'subgraph', definition: refFor(snapshot), parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} });
const composed = () => { const g = root(); g.definitions = { [definitions.definitionRefKey(snapshot)]: snapshot }; g.nodes.compact = instance('compact'); g.wires.edge.toPort = 'input'; return g; };
assert.equal(typeof definitions.validateDefinition, 'function');
assert.equal(definitions.validateDefinition(snapshot, composed().definitions).ok, true);
assert.equal(validateGraphStructure(composed()).ok, true);
assert.deepEqual(catalog.portsForNode(composed(), composed().nodes.compact).map(p => p.id), ['input', 'output']);
for (const [mutate, code] of [
    [d => { d.body.nodes.work.operation = 'scene-context'; }, 'INVALID_PORT'],
    [d => { d.body.wires.a.toPort = 'missing'; }, 'INVALID_PORT'],
    [d => { d.parameters[0].target.controlId = 'profileId'; }, 'DEFINITION_PARAMETER'],
]) { const draft = definitionDraft(); mutate(draft); const bad = finalize(draft); assert.equal(definitions.validateDefinition(bad, {}).error.code, code); }
const invalidOverride = composed(); invalidOverride.nodes.compact.parameterOverrides.method = 'invented';
assert.equal(validateGraphStructure(invalidOverride).error.code, 'INVALID_OVERRIDE');
const missingPin = composed(); missingPin.nodes.compact.definition.version++;
assert.equal(validateGraphStructure(missingPin).error.code, 'MISSING_DEFINITION');

const resolver = await import('../src/workflow/resolve.js').catch(() => ({}));
assert.equal(typeof resolver.resolveWorkflow, 'function');
const withTerminals = composed();
withTerminals.nodes.plan = { id: 'plan', type: 'workflow', operation: 'response-plan' };
withTerminals.nodes.output = { id: 'output', type: 'workflow', operation: 'guidance' };
withTerminals.nodes.unused = { id: 'unused', type: 'workflow', operation: 'smart-compactor', enabled: false };
withTerminals.wires.b = { id: 'b', route: 'wire', from: 'compact', fromPort: 'output', to: 'plan', toPort: 'in' };
withTerminals.wires.c = { id: 'c', route: 'wire', from: 'plan', fromPort: 'out', to: 'output', toPort: 'in' };
withTerminals.nodes.compact.parameterOverrides.method = 'compress';
withTerminals.nodes.compact.roleOverrides.Analysis = { profileId: 'instance-profile', model: 'instance-model' };
const outputTarget = {workflowId:'root',instancePath:[],nodeId:'output',portId:'out'};
const resolved = resolver.resolveWorkflow(withTerminals, {target: outputTarget});
assert.equal(resolved.ok, true, JSON.stringify(resolved));
assert.equal(resolved.data.primitives.length, 5);
assert.equal(resolved.data.primitives.filter(unit => unit.included).length, 4);
assert.equal(resolved.data.callBound, 2);
const work = resolved.data.primitives.find(unit => unit.address.instancePath.length);
assert.deepEqual(work.address, { workflowId: 'root', instancePath: ['compact'], nodeId: 'work' });
assert.equal(work.node.method, 'compress');
assert.equal(work.node.profileId, 'instance-profile');
assert.equal(work.node.model, 'instance-model');
assert.equal(snapshot.body.nodes.work.method, 'select', 'shared pinned snapshots remain unchanged');
assert.deepEqual(resolved.data.terminals, []);
const target = { workflowId: 'root', instancePath: [], nodeId: 'compact', portId: 'output' };
const targetResult = resolver.resolveWorkflow(withTerminals, { target });
assert.equal(targetResult.ok, true);
assert.equal(targetResult.data.primitives.length, 5, 'target planning retains full inventory');
assert.equal(targetResult.data.primitives.filter(unit => unit.included).length, 2);
assert.equal(targetResult.data.callBound, 1);
assert.deepEqual(targetResult.data.target, target);
assert.deepEqual(targetResult.data.resolvedTarget, { ...work.address, portId: 'out' });
assert.equal(resolver.resolveWorkflow(withTerminals, { target: { ...target, portId: 'missing' } }).error.code, 'INVALID_TARGET');
assert.equal(resolver.resolveWorkflow(withTerminals, { target: { kind:'terminal',address:{ workflowId: 'root', instancePath: [], nodeId: 'output' } } }).error.code, 'INVALID_TARGET');
assert.equal(resolver.resolveWorkflow(withTerminals, { target: outputTarget }).ok, true);
const incomplete = structuredClone(withTerminals); delete incomplete.wires.edge;
assert.equal(validateGraphStructure(incomplete).ok, true);
assert.equal(resolver.resolveWorkflow(incomplete, {target: outputTarget}).error.code, 'MISSING_INPUT');

const signature = graphSemanticSignature(withTerminals), renamed = structuredClone(withTerminals);
renamed.portals.shared.label = 'Renamed'; renamed.nodes.compact.alias = 'Renamed instance';
Object.values(renamed.definitions)[0].name = 'Renamed definition';
assert.equal(graphSemanticSignature(renamed), signature);
for (const change of [
    g => { g.portals.shared.source.nodeId = 'unused'; },
    g => { g.nodes.compact.parameterOverrides.method = 'select'; },
    g => { g.nodes.compact.roleOverrides.Analysis.profileId = 'changed'; },
    g => { Object.values(g.definitions)[0].body.roles.Analysis.profileId = 'changed'; },
]) { const g = structuredClone(withTerminals); change(g); assert.notEqual(graphSemanticSignature(g), signature); }

// Repeated snapshots expand independently while the shared root dependency executes once.
const siblings = structuredClone(withTerminals);
siblings.nodes['compact/second'] = { ...instance('compact/second'), parameterOverrides: { method: 'compress' } };
siblings.nodes.plan2 = { id: 'plan2', type: 'workflow', operation: 'response-plan' };
siblings.nodes.output2 = { id: 'output2', type: 'workflow', operation: 'guidance' };
siblings.wires.d = { id: 'd', route: 'portal', portalId: 'shared', to: 'compact/second', toPort: 'input' };
siblings.wires.e = { id: 'e', route: 'wire', from: 'compact/second', fromPort: 'output', to: 'plan2', toPort: 'in' };
siblings.wires.f = { id: 'f', route: 'wire', from: 'plan2', fromPort: 'out', to: 'output2', toPort: 'in' };
const siblingsPlan = resolver.resolveWorkflow(siblings, {target: outputTarget});
assert.equal(siblingsPlan.ok, true);
assert.equal(siblingsPlan.data.primitives.filter(unit => unit.address.nodeId === 'source').length, 1);
assert.equal(siblingsPlan.data.primitives.filter(unit => unit.address.nodeId === 'work').length, 2);
assert.equal(siblingsPlan.data.callBound, 2);

const outerDraft = definitionDraft(); outerDraft.id = 'outer';
outerDraft.body.nodes.work = { ...instance('work'), parameterOverrides: { method: 'compress' } };
outerDraft.body.wires.a.toPort = 'input'; outerDraft.body.wires.b.fromPort = 'output';
outerDraft.parameters[0].target.instancePath = ['work'];
outerDraft.parameters[0].target.nodeId = 'work';
const outer = finalize(outerDraft);
const outerDiagnostics = definitions.validateDefinition(outer, { [definitions.definitionRefKey(snapshot)]: snapshot });
assert.equal(outerDiagnostics.ok, true);
assert.equal(outerDiagnostics.data.parameterDescriptors.method.default, 'compress');
const nestedRoot = structuredClone(withTerminals);
nestedRoot.definitions[definitions.definitionRefKey(outer)] = outer;
nestedRoot.nodes.compact.definition = refFor(outer);
nestedRoot.nodes.compact.parameterOverrides.method = 'select';
nestedRoot.nodes.compact.nodeBindingOverrides[definitions.nodeBindingOverrideKey(['work'], 'work')] = { profileId: 'outer-node-profile', model: 'outer-node-model' };
const nestedPlan = resolver.resolveWorkflow(nestedRoot, {target: outputTarget});
assert.equal(nestedPlan.ok, true, JSON.stringify(nestedPlan));
const nestedWork = nestedPlan.data.primitives.find(unit => unit.address.instancePath.length === 2);
assert.equal(nestedWork.node.method, 'select');
assert.equal(nestedWork.node.profileId, 'outer-node-profile');
assert.equal(nestedWork.node.model, 'outer-node-model');

const cycle = composed(); cycle.wires.edge = { id: 'edge', route: 'wire', from: 'compact', fromPort: 'output', to: 'compact', toPort: 'input' };
assert.equal(validateGraphStructure(cycle).error.code, 'CYCLE');
const optionalDraft = definitionDraft(); optionalDraft.interface[0].required = false;
const optional = finalize(optionalDraft), optionalRoot = structuredClone(withTerminals);
optionalRoot.definitions = { [definitions.definitionRefKey(optional)]: optional }; optionalRoot.nodes.compact.definition = refFor(optional); delete optionalRoot.wires.edge;
assert.equal(validateGraphStructure(optionalRoot).ok, true);
assert.equal(resolver.resolveWorkflow(optionalRoot, {target: outputTarget}).error.code, 'MISSING_INPUT');

const recursive = definitionDraft(); recursive.semanticHash = `sha256:${'0'.repeat(64)}`;
recursive.body.nodes.work = { ...instance('work'), definition: refFor(recursive) };
recursive.body.wires.a.toPort = 'input'; recursive.body.wires.b.fromPort = 'output';
assert.equal(definitions.validateDefinition(recursive, {}).error.code, 'DEFINITION_RECURSION');
const excess = composed(); for (let i = 0; i < 260; i++) excess.nodes[`instance-${i}`] = instance(`instance-${i}`);
assert.equal(validateGraphStructure(excess).error.code, 'GRAPH_LIMIT');
const hiddenTable = finalize(definitionDraft()); hiddenTable.body.definitions = { [definitions.definitionRefKey(snapshot)]: snapshot };
assert.equal(definitions.validateDefinition(hiddenTable, {}).error.code, 'DEFINITION_REF');

const composition = await import('../src/workflow/composition.js').catch(() => ({}));
assert.equal(typeof composition.preparePortalRename, 'function');
const renamedPortal = composition.preparePortalRename(root(), { portalId: 'shared', label: 'Renamed' });
assert.equal(renamedPortal.ok, true);
assert.equal(renamedPortal.data.changed, true);
assert.equal(renamedPortal.data.baseSignature, graphSemanticSignature(renamedPortal.data.candidate));
const restore = composition.preparePortalRestoreWire(root(), { edgeId: 'edge' });
assert.equal(restore.ok, true);
assert.deepEqual(restore.data.candidate.wires.edge, { id: 'edge', route: 'wire', from: 'source', fromPort: 'out', to: 'compact', toPort: 'in' });
assert.equal(composition.preparePortalDelete(root(), { portalId: 'shared' }).error.code, 'PORTAL_IN_USE');
assert.equal(composition.preparePortalDelete(root(), { portalId: 'shared', consumers: 'restore' }).data.candidate.portals.shared, undefined);
const disconnected = composition.preparePortalDelete(root(), { portalId: 'shared', consumers: 'disconnect' });
assert.deepEqual(disconnected.data.removedEdgeIds, ['edge']);
assert.equal(root().wires.edge.route, 'portal');
const noPortal = root(); noPortal.portals = {}; noPortal.wires = {};
const create = composition.preparePortalCreate(noPortal, { label: 'Shared', source: { nodeId: 'source', portId: 'out' } });
assert.equal(create.ok, true);
const portalId = Object.keys(create.data.candidate.portals)[0];
assert.equal(composition.preparePortalBinding(create.data.candidate, { portalId, to: { nodeId: 'compact', portId: 'in' } }).ok, true);
assert.equal(composition.preparePortalRetarget(root(), { portalId: 'shared', source: { nodeId: 'compact', portId: 'out' } }).error.code, 'CYCLE');

const packages = await import('../src/workflow/packages.js');
const exported = packages.exportWorkflow(nestedRoot);
const imported = packages.parseWorkflow(JSON.stringify(exported));
assert.equal(imported.ok, true);
assert.equal(resolver.resolveWorkflow(imported.data, {target: outputTarget}).ok, true);
assert.equal(Object.values(imported.data.definitions).find(item => item.id === snapshot.id).semanticHash, snapshot.semanticHash);
assert.equal(Object.values(imported.data.definitions).find(item => item.id === snapshot.id).body.roles.Analysis.profileId, null);
assert.equal(Object.values(imported.data.nodes.compact.nodeBindingOverrides)[0].profileId, null);
assert.equal(imported.data.nodes.compact.definition.semanticHash, outer.semanticHash);
assert.equal(typeof packages.exportSubgraph, 'function');
const standalone = packages.exportSubgraph(outer, nestedRoot.definitions);
assert.deepEqual([standalone.kind, standalone.schema, standalone.minRuntime], ['lattice-subgraph', 1, 2]);
assert.equal(packages.parseSubgraph(JSON.stringify(standalone)).ok, true);
const malicious = structuredClone(standalone); malicious.definition.body.wires.a.toPort = 'bad';
assert.equal(packages.parseSubgraph(JSON.stringify(malicious)).ok, false);

let targetGetterCalls = 0;
assert.equal(resolver.resolveWorkflow(withTerminals, { get target() { targetGetterCalls++; return target; } }).ok, false);
assert.equal(targetGetterCalls, 0);
assert.equal(resolver.resolveWorkflow(withTerminals, null).ok, false);
const wrongTagged = { ...target, kind: 'anything' };
assert.equal(resolver.resolveWorkflow(withTerminals, { target: wrongTagged }).error.code, 'INVALID_TARGET');
const disabledBoundary = definitionDraft(); disabledBoundary.body.nodes.entry.enabled = false;
const disabledSnapshot = finalize(disabledBoundary), disabledRoot = structuredClone(withTerminals);
disabledRoot.definitions = { [definitions.definitionRefKey(disabledSnapshot)]: disabledSnapshot }; disabledRoot.nodes.compact.definition = refFor(disabledSnapshot);
assert.equal(resolver.resolveWorkflow(disabledRoot, {target: outputTarget}).error.code, 'DISABLED_OPERATION');

const partialRole = structuredClone(withTerminals);
partialRole.nodes.compact.roleOverrides.Analysis = { profileId: 'override-only-profile' };
assert.equal(resolver.resolveWorkflow(partialRole, {target: outputTarget}).data.primitives.find(unit => unit.address.nodeId === 'work').node.model, 'model');

const escape = root(); escape.portals.shared.source.instancePath = ['outside'];
assert.equal(validateGraphStructure(escape).error.code, 'INVALID_PORTAL');

const extraRequiredDraft = definitionDraft();
extraRequiredDraft.interface.push({ id: 'extra', label: 'Extra required', direction: 'input', kind: 'context', cardinality: 'one', required: true, boundaryNodeId: 'extra' });
extraRequiredDraft.body.nodes.extra = { id: 'extra', type: 'subgraph-input', interfacePortId: 'extra' };
extraRequiredDraft.interface.push({ id: 'extraOutput', label: 'Other branch', direction: 'output', kind: 'context', cardinality: 'one', required: false, boundaryNodeId: 'extraExit' });
extraRequiredDraft.body.nodes.extraWork = { id: 'extraWork', type: 'workflow', operation: 'smart-compactor' };
extraRequiredDraft.body.nodes.extraExit = { id: 'extraExit', type: 'subgraph-output', interfacePortId: 'extraOutput' };
extraRequiredDraft.body.wires.extraA = { id: 'extraA', route: 'wire', from: 'extra', fromPort: 'out', to: 'extraWork', toPort: 'in' };
extraRequiredDraft.body.wires.extraB = { id: 'extraB', route: 'wire', from: 'extraWork', fromPort: 'out', to: 'extraExit', toPort: 'in' };
const extraRequired = finalize(extraRequiredDraft), extraRoot = structuredClone(withTerminals);
extraRoot.definitions = { [definitions.definitionRefKey(extraRequired)]: extraRequired }; extraRoot.nodes.compact.definition = refFor(extraRequired);
assert.equal(validateGraphStructure(extraRoot).ok, true);
assert.equal(resolver.resolveWorkflow(extraRoot, {target: outputTarget}).ok, true, 'target completeness excludes an unrelated unfinished output');

// Internal targets check only the selected branch; a full run honors every required interface.
assert.equal(resolver.resolveWorkflow(extraRoot, { target }).ok, true);
assert.equal(resolver.resolveWorkflow(extraRoot, { target: { ...target, portId: 'extraOutput' } }).error.code, 'MISSING_INPUT');
assert.equal(resolver.resolveWorkflow(extraRoot, { target: { workflowId: 'root', instancePath: [], nodeId: 'compact' } }).error.code, 'INVALID_TARGET');
delete extraRoot.wires.edge;
assert.equal(resolver.resolveWorkflow(extraRoot, { target }).error.code, 'MISSING_INPUT');

const libraryApi = await import('../src/workflow/definition-library.js').catch(() => ({}));
assert.equal(typeof libraryApi.installDefinition, 'function');
const library = libraryApi.installDefinition({ definitions: {} }, snapshot);
assert.equal(library.ok, true);
assert.equal(Object.isFrozen(library.data.library.definitions[definitions.definitionRefKey(snapshot)]), true);
assert.equal(libraryApi.installDefinition(library.data.library, snapshot).data.changed, false);
const revisionDraft = structuredClone(snapshot); revisionDraft.body.nodes.work.targetTokens = 555;
const revision = libraryApi.createRevision(library.data.library, revisionDraft);
assert.equal(revision.ok, true);
assert.equal(revision.data.ref.version, 2);
assert.notEqual(revision.data.ref.semanticHash, snapshot.semanticHash);
const deleted = libraryApi.removeLibraryEntry(library.data.library, refFor(snapshot));
assert.deepEqual(deleted.data.library.definitions, {});
assert.equal(resolver.resolveWorkflow(withTerminals, {target: outputTarget}).ok, true, 'workflow-owned snapshots survive shelf deletion');
const copied = libraryApi.makeLocalCopy(withTerminals, { instanceId: 'compact', id: 'private-copy', name: 'Private copy' });
assert.equal(copied.ok, true);
assert.equal(copied.data.candidate.nodes.compact.definition.id, 'private-copy');
assert.equal(copied.data.candidate.nodes.compact.definition.semanticHash, snapshot.semanticHash);
assert.equal(withTerminals.nodes.compact.definition.id, snapshot.id);
const updated = libraryApi.prepareInstanceUpdate(withTerminals, { instanceId: 'compact', definition: revision.data.library.definitions[definitions.definitionRefKey(revision.data.ref)] });
assert.equal(updated.ok, true);
assert.equal(updated.data.candidate.nodes.compact.definition.version, 2);
assert.equal(resolver.resolveWorkflow(updated.data.candidate, {target: outputTarget}).data.primitives.find(unit => unit.address.nodeId === 'work').node.targetTokens, 555);

assert.deepEqual(copied.data.candidate.nodes.compact.localCopy, { definitionId: 'private-copy' });
const localDraft = structuredClone(copied.data.candidate.definitions[definitions.definitionRefKey(copied.data.candidate.nodes.compact.definition)]);
localDraft.body.nodes.work.targetTokens = 777;
const localEdit = libraryApi.prepareLocalDefinitionEdit(copied.data.candidate, { instanceId: 'compact', expectedRef: copied.data.candidate.nodes.compact.definition, draft: localDraft });
assert.equal(localEdit.ok, true);
assert.equal(localEdit.data.candidate.nodes.compact.definition.version, 2);
assert.equal(resolver.resolveWorkflow(localEdit.data.candidate, {target: outputTarget}).data.primitives.find(unit => unit.address.nodeId === 'work').node.targetTokens, 777);
assert.equal(libraryApi.prepareLocalDefinitionEdit(withTerminals, { instanceId: 'compact', expectedRef: refFor(snapshot), draft: snapshot }).error.code, 'READ_ONLY_DEFINITION');
assert.equal(libraryApi.prepareLocalDefinitionEdit(localEdit.data.candidate, { instanceId: 'compact', expectedRef: copied.data.candidate.nodes.compact.definition, draft: localDraft }).error.code, 'STALE_DEFINITION');
const duplicateOwner = structuredClone(copied.data.candidate); duplicateOwner.nodes.otherOwner = { ...duplicateOwner.nodes.compact, id: 'otherOwner' };
assert.equal(validateGraphStructure(duplicateOwner).error.code, 'LOCAL_COPY_OWNERSHIP');
const portableLocal = packages.parseWorkflow(JSON.stringify(packages.exportWorkflow(copied.data.candidate)));
assert.equal(portableLocal.ok, true);
assert.equal(portableLocal.data.nodes.compact.localCopy, undefined);

// Explicit update maps rewrite wires and overrides together; a missing map leaves no mutation.
const mappedDraft = structuredClone(snapshot); mappedDraft.version = 2;
mappedDraft.interface[0].id = 'renamed/input'; mappedDraft.body.nodes.entry.interfacePortId = 'renamed/input';
mappedDraft.parameters[0].id = 'new-method';
const mappedSnapshot = finalize(mappedDraft), beforeUpdate = structuredClone(withTerminals);
assert.equal(libraryApi.prepareInstanceUpdate(withTerminals, { instanceId: 'compact', definition: mappedSnapshot }).ok, false);
assert.deepEqual(withTerminals, beforeUpdate);
const mappedUpdate = libraryApi.prepareInstanceUpdate(withTerminals, { instanceId: 'compact', definition: mappedSnapshot, portMap: { input: 'renamed/input' }, parameterMap: { method: 'new-method' } });
assert.equal(mappedUpdate.ok, true);
assert.equal(mappedUpdate.data.candidate.wires.edge.toPort, 'renamed/input');
assert.deepEqual(mappedUpdate.data.candidate.nodes.compact.parameterOverrides, { 'new-method': 'compress' });
assert.equal(resolver.resolveWorkflow(mappedUpdate.data.candidate, {target: outputTarget}).ok, true);

// Depth is checked across shared DAG branches; direct/indirect references never resolve remotely.
const chainTable = { [definitions.definitionRefKey(snapshot)]: snapshot }; let child = snapshot;
for (let depth = 2; depth <= 9; depth++) {
    const draft = definitionDraft(); draft.id = `depth-${depth}`; draft.parameters = [];
    draft.body.nodes.work = { ...instance('work'), definition: refFor(child) };
    draft.body.wires.a.toPort = 'input'; draft.body.wires.b.fromPort = 'output';
    child = finalize(draft); chainTable[definitions.definitionRefKey(child)] = child;
    if (depth === 8) assert.equal(definitions.validateDefinition(child, chainTable).ok, true);
}
assert.equal(definitions.validateDefinition(child, chainTable).error.code, 'DEFINITION_DEPTH');
assert.equal(packages.parseSubgraph(JSON.stringify({ ...standalone, schema: 2 })).error.code, 'UNSUPPORTED_PACKAGE');
assert.equal(packages.parseWorkflow(JSON.stringify({ kind: 'lattice-workflow', schema: 2, minRuntime: 2, graph: escape })).ok, false);
console.log('workflow-composition: named portals, pinned expansion, targets, portable packages and immutable library edits passed');
