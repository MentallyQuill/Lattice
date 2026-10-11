import assert from 'node:assert/strict';
import { computeDefinitionIdentity, definitionRefKey, nodeBindingOverrideKey } from '../src/workflow/definitions.js';
import { prepareWorkflowInsertion } from '../src/workflow/insertion.js';
import { inspectExpandedGraph } from '../src/workflow/graph-validation.js';
import { makeLocalCopy } from '../src/workflow/definition-library.js';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js';
import { graphSemanticSignature, graphDocumentSignature } from '../src/workflow/ports.js';
import { installMock } from './mock.js';
import { captureGraphEditContext } from '../src/workflow/transactions.js?v=0.27.0';
import * as S from '../src/state.js?v=0.27.0';
import * as H from '../src/history.js?v=0.27.0';

const finalize = draft => { const value = computeDefinitionIdentity(draft); assert.equal(value.ok, true); return { ...structuredClone(value.data.materializedDefinition), semanticHash: value.data.semanticHash }; };
const ref = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });
const instance = (id, definition) => ({ id, type: 'subgraph', definition: ref(definition), parameterOverrides: {}, roleOverrides: {}, nodeBindingOverrides: {} });
const leaf = finalize({ id: 'shared-leaf', version: 1, name: 'Leaf', interface: [
    { id: 'input', label: 'Input', direction: 'input', kind: 'context', required: true, cardinality: 'one', boundaryNodeId: 'entry' },
    { id: 'output', label: 'Output', direction: 'output', kind: 'context', required: false, cardinality: 'one', boundaryNodeId: 'exit' },
], parameters: [], body: { schema: 3, runtime: 2, mode: 'native-pre', roles: { Analysis: {} }, nodes: {
    entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'input' }, work: { id: 'work', type: 'workflow', operation: 'smart-compactor', method: 'compress' }, exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'output' },
}, wires: { a: { id: 'a', route: 'wire', from: 'entry', fromPort: 'out', to: 'work', toPort: 'in' }, b: { id: 'b', route: 'wire', from: 'work', fromPort: 'out', to: 'exit', toPort: 'in' } } } });
const outerDraft = structuredClone(leaf); outerDraft.id = 'outer'; outerDraft.body.nodes.work = instance('work', leaf); outerDraft.body.wires.a.toPort = 'input'; outerDraft.body.wires.b.fromPort = 'output';
const outer = finalize(outerDraft);
function graph(id, profileId, model) {
    return { id, schema: 3, runtime: 2, mode: 'native-unified', roles: { Analysis: { profileId, model } }, nodes: {
        source: { id: 'source', type: 'workflow', operation: 'scene-context' }, placed: { ...instance('placed', outer), inGroup: 'boxed' }, direct: { id: 'direct', type: 'workflow', operation: 'smart-compactor', method: 'compress' },
    }, wires: {
        input: { id: 'input', route: 'portal', portalId: 'context', to: 'placed', toPort: 'input' }, direct: { id: 'direct', route: 'wire', from: 'source', fromPort: 'out', to: 'direct', toPort: 'in' },
    }, groups: { boxed: { id: 'boxed', members: ['placed'], x: 0, y: 0 } }, portals: { context: { id: 'context', label: 'Context', kind: 'context', source: { nodeId: 'source', portId: 'out' } }, result: { id: 'result', label: 'Result', kind: 'context', source: { nodeId: 'placed', portId: 'output' } } }, definitions: { [definitionRefKey(leaf)]: structuredClone(leaf), [definitionRefKey(outer)]: structuredClone(outer) } };
}
const source = graph('source-root', 'source-profile', 'source-model'), recipient = graph('recipient-root', 'recipient-profile', 'recipient-model');
source.nodes.placed.roleOverrides.Analysis = { model: 'outer-model' };
source.nodes.placed.nodeBindingOverrides[nodeBindingOverrideKey(['work'], 'work')] = { model: 'explicit-node-model', profileId: null };
recipient.definitions[definitionRefKey(leaf)].body.roles.Analysis.profileId = 'recipient-body-profile';
const sourceBefore = structuredClone(source), recipientBefore = structuredClone(recipient);
const previousHost = Object.getOwnPropertyDescriptor(globalThis, 'SillyTavern');
Object.defineProperty(globalThis, 'SillyTavern', { configurable: true, get() { throw new Error('Insertion must not look up host profiles'); } });
let inserted;
try { inserted = prepareWorkflowInsertion(recipient, source); }
finally { if (previousHost) Object.defineProperty(globalThis, 'SillyTavern', previousHost); else delete globalThis.SillyTavern; }
assert.equal(inserted.ok, true, JSON.stringify(inserted));
const { candidate, identityMap, added, diagnostics } = inserted.data;
assert.deepEqual(source, sourceBefore); assert.deepEqual(recipient, recipientBefore);
assert.deepEqual(candidate.roles.Analysis, recipient.roles.Analysis);
assert.deepEqual(candidate.nodes[identityMap.nodes.placed].definition, ref(outer));
assert.deepEqual(candidate.definitions[definitionRefKey(leaf)], recipient.definitions[definitionRefKey(leaf)]);
assert.equal(added.definitions.length, 0, 'equal portable pins reuse receiver snapshots');
assert.equal(candidate.wires[identityMap.wires.input].portalId, identityMap.portals.context);
assert.equal(Object.hasOwn(candidate.wires[identityMap.wires.input], 'from'), false);
assert.equal(candidate.portals[identityMap.portals.result].source.nodeId, identityMap.nodes.placed);
assert.deepEqual(candidate.groups[identityMap.groups.boxed].members, [identityMap.nodes.placed]);
const expanded = inspectExpandedGraph(candidate).data.primitives;
const nested = expanded.find(unit => unit.address.instancePath[0] === identityMap.nodes.placed);
assert.equal(nested.node.model, 'explicit-node-model'); assert.equal(nested.node.profileId, null);
const direct = expanded.find(unit => unit.address.nodeId === identityMap.nodes.direct);
assert.equal(direct.node.model, 'source-model'); assert.equal(direct.node.profileId, 'source-profile');
assert.equal(diagnostics.importedCallBound, 2); assert.equal(diagnostics.callBound, 4);
assert.equal(diagnostics.unresolvedBindings.some(item => item.address.instancePath[0] === identityMap.nodes.placed && item.missing.includes('profileId')), true);

const inheritedSource = graph('inherited-source', 'source-profile', 'source-model');
const inheritedInsert = prepareWorkflowInsertion(recipient, inheritedSource); assert.equal(inheritedInsert.ok, true);
const inheritedUnit = inspectExpandedGraph(inheritedInsert.data.candidate).data.primitives.find(unit => unit.address.instancePath[0] === inheritedInsert.data.identityMap.nodes.placed);
assert.equal(inheritedUnit.node.profileId, 'source-profile'); assert.equal(inheritedUnit.node.model, 'source-model');
const portable = parseWorkflow(JSON.stringify(exportWorkflow(inheritedSource))); assert.equal(portable.ok, true);
const portableInsert = prepareWorkflowInsertion(recipient, portable.data); assert.equal(portableInsert.ok, true);
const portableUnit = inspectExpandedGraph(portableInsert.data.candidate).data.primitives.find(unit => unit.address.instancePath[0] === portableInsert.data.identityMap.nodes.placed);
assert.equal(portableUnit.node.profileId, null, 'portable missing binding cannot capture a receiver profile');
assert.equal(portableUnit.node.model, 'source-model');
const privateSource = makeLocalCopy(inheritedSource, { instancePath: ['placed', 'work'], id: 'private-source-leaf' }); assert.equal(privateSource.ok, true);
const privateInsert = prepareWorkflowInsertion(recipient, privateSource.data.candidate); assert.equal(privateInsert.ok, true);
assert.equal(privateInsert.data.candidate.nodes[privateInsert.data.identityMap.nodes.placed].localCopy, undefined);
assert.equal(privateInsert.data.candidate.localDefinitionOwners, undefined);
const conflicting = structuredClone(source), changedLeaf = structuredClone(leaf); changedLeaf.body.nodes.work.targetTokens = 222;
const changedSnapshot = finalize(changedLeaf); conflicting.definitions[definitionRefKey(changedSnapshot)] = changedSnapshot;
assert.equal(prepareWorkflowInsertion(recipient, conflicting).error.code, 'DEFINITION_CONFLICT');
const invalidUnused = structuredClone(source); invalidUnused.definitions[definitionRefKey(leaf)].body.nodes.work.targetTokens = -1;
assert.equal(prepareWorkflowInsertion(recipient, invalidUnused).ok, false);
const crossConflict = graph('cross-conflict', 'source-profile', 'source-model');
const crossLeaf = finalize(changedLeaf); delete crossConflict.definitions[definitionRefKey(leaf)];
crossConflict.definitions = { [definitionRefKey(crossLeaf)]: crossLeaf }; crossConflict.nodes.placed.definition = ref(crossLeaf);
let conflictAllocations = 0;
assert.equal(prepareWorkflowInsertion(recipient, crossConflict, { allocateId: () => `attempt-${++conflictAllocations}` }).error.code, 'DEFINITION_CONFLICT');
assert.equal(conflictAllocations, 0, 'cross-table semantic conflicts reject before rename/allocation');
const fragment = structuredClone(inheritedSource); delete fragment.nodes.source; fragment.wires = {}; delete fragment.portals.context; fragment.mode = 'native-pre';
const nestedOwner = makeLocalCopy(recipient, { instancePath: ['placed', 'work'], id: 'nested-recipient-private' }); assert.equal(nestedOwner.ok, true);
const nestedRoot = nestedOwner.data.candidate, nestedBefore = structuredClone(nestedRoot);
assert.equal(prepareWorkflowInsertion(recipient, fragment, { viewPath: ['placed', 'work'] }).error.code, 'READ_ONLY_VIEW');
const nestedInsert = prepareWorkflowInsertion(nestedRoot, fragment, { viewPath: ['placed', 'work'], at: { x: 100, y: 200 } });
assert.equal(nestedInsert.ok, true, JSON.stringify(nestedInsert));
assert.equal(nestedInsert.data.baseSignature, graphSemanticSignature(nestedRoot));
assert.equal(nestedInsert.data.baseDocumentSignature, graphDocumentSignature(nestedRoot));
assert.deepEqual(nestedRoot, nestedBefore);
assert.deepEqual(Object.keys(nestedInsert.data.candidate.nodes), Object.keys(nestedRoot.nodes));
assert.deepEqual(nestedInsert.data.candidate.localDefinitionOwners, nestedRoot.localDefinitionOwners);
const nestedInventory = inspectExpandedGraph(nestedInsert.data.candidate).data.primitives;
const nestedAdded = nestedInventory.find(unit => unit.address.instancePath[0] === 'placed' && unit.address.instancePath[1] === 'work' && unit.address.nodeId === nestedInsert.data.identityMap.nodes.direct);
assert.equal(nestedAdded.node.model, 'source-model'); assert.equal(nestedAdded.node.profileId, 'source-profile');
assert.equal(nestedInsert.data.diagnostics.importedCallBound, 2);
assert.equal(nestedInsert.data.diagnostics.importedBindingOverrides.every(item => item.address.instancePath.slice(0, 2).join(',') === 'placed,work'), true);
assert.equal(prepareWorkflowInsertion(nestedRoot, { ...source, mode: 'native-pre' }, { viewPath: ['placed', 'work'] }).ok, true);
// A readonly import cannot take the recipient's existing private identity or permissions.
let repeatedRecipient = structuredClone(privateSource.data.candidate);
const privateOwners = structuredClone(repeatedRecipient.localDefinitionOwners), originalPrivateRef = structuredClone(repeatedRecipient.nodes.placed.definition);
for (let repetition = 0; repetition < 2; repetition++) {
    const importedPrivate = prepareWorkflowInsertion(repeatedRecipient, privateSource.data.candidate);
    assert.equal(importedPrivate.ok, true, JSON.stringify(importedPrivate));
    assert.deepEqual(importedPrivate.data.candidate.localDefinitionOwners, privateOwners);
    assert.deepEqual(importedPrivate.data.candidate.nodes.placed.definition, originalPrivateRef);
    const insertedRef = importedPrivate.data.candidate.nodes[importedPrivate.data.identityMap.nodes.placed].definition;
    assert.notEqual(insertedRef.id, originalPrivateRef.id);
    assert.equal(importedPrivate.data.diagnostics.changedRefs.length, 2);
    assert.equal(importedPrivate.data.identityMap.definitions[definitionRefKey(originalPrivateRef)], definitionRefKey(insertedRef));
    assert.equal(importedPrivate.data.candidate.nodes[importedPrivate.data.identityMap.nodes.placed].localCopy, undefined);
    const importedUnit = inspectExpandedGraph(importedPrivate.data.candidate).data.primitives.find(unit => unit.address.instancePath[0] === importedPrivate.data.identityMap.nodes.placed);
    assert.equal(importedUnit.node.profileId, 'source-profile'); assert.equal(importedUnit.node.model, 'source-model');
    repeatedRecipient = importedPrivate.data.candidate;
}
const host = installMock({ settings: { graphs: {} } }); let saves = 0, cancels = 0; host.saveSettingsDebounced = () => saves++;
const atomicRoot = structuredClone(privateSource.data.candidate); atomicRoot.id = 'atomic-composed-insertion';
atomicRoot.authority = { activeRun: 'current' }; atomicRoot.recording = { id: 'diagnostic' }; atomicRoot.view = { x: 0, y: 0, zoom: 1 };
const authority = atomicRoot.authority, recording = atomicRoot.recording, beforeAtomic = structuredClone(atomicRoot);
H.track(atomicRoot);
const preparedAtomic = prepareWorkflowInsertion(atomicRoot, privateSource.data.candidate);
const context = captureGraphEditContext(atomicRoot, () => ({ sessionId: 'atomic-composition', viewPath: [], readOnly: false })); assert.equal(context.ok, true);
atomicRoot.view = { x: 20, y: 30, zoom: 2 }; const camera = atomicRoot.view;
const committed = S.commitGraphEdit(atomicRoot, { ...preparedAtomic.data, context: context.data }, { onSemanticChange: () => cancels++ });
assert.equal(committed.ok, true); assert.equal(committed.data.semanticChanged, true); assert.equal(saves, 1); assert.equal(cancels, 1);
assert.deepEqual(atomicRoot.definitions, preparedAtomic.data.candidate.definitions); assert.equal(atomicRoot.view, camera);
assert.equal(S.stepGraphHistory(atomicRoot, 'undo', { onSemanticChange: () => cancels++ }).data.semanticChanged, true);
for (const field of H.GRAPH_DOCUMENT_FIELDS) { assert.equal(Object.hasOwn(atomicRoot, field), Object.hasOwn(beforeAtomic, field)); assert.deepEqual(atomicRoot[field], beforeAtomic[field]); }
assert.equal(S.stepGraphHistory(atomicRoot, 'undo').data.changed, false);
assert.equal(S.stepGraphHistory(atomicRoot, 'redo', { onSemanticChange: () => cancels++ }).data.semanticChanged, true);
assert.deepEqual(atomicRoot.definitions, preparedAtomic.data.candidate.definitions); assert.deepEqual(atomicRoot.portals, preparedAtomic.data.candidate.portals);
assert.equal(S.stepGraphHistory(atomicRoot, 'redo').data.changed, false);
assert.equal(saves, 3); assert.equal(cancels, 3); assert.equal(atomicRoot.authority, authority); assert.equal(atomicRoot.recording, recording); assert.equal(atomicRoot.view, camera);
console.log('workflow-composition-insertion: exact pins, scoped bindings, portals and atomic diagnostics passed');
