import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js';
import { validateGraphStructure, validateWorkflow } from '../src/workflow/contracts.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { serializeWorkflowDocument, parseWorkflowDocument } from '../src/workflow/document-file.js';

const legacyGraph = (id = 'old-pre', mode = 'native-pre') => ({ id, name: 'Saved scene tool', description: '', schema: 3, runtime: 2, mode, nodes: { text: { id: 'text', type: 'workflow', operation: 'text', operationVersion: 1, text: 'Keep this authored text.' } }, wires: {}, groups: {}, roles: {}, portals: {}, definitions: {}, view: { x: 4, y: 7, zoom: 1 } });
function savedSettings(graph) {
    return { schema: 1, enabled: true, activeGraphId: graph.id, graphs: { [graph.id]: graph }, nativeBindings: { preGraphId: graph.mode === 'native-pre' ? graph.id : null, postGraphId: graph.mode === 'native-post' ? graph.id : null }, subgraphLibrary: { definitions: {} }, ui: {} };
}
let sequence = 0;
async function stateFor(value) {
    let saves = 0;
    const context = { extensionSettings: { lattice: value }, saveSettingsDebounced() { saves++; } };
    globalThis.SillyTavern = { getContext: () => context };
    const state = await import('../src/state.js?retirement=' + ++sequence);
    return { state, context, saves: () => saves };
}

test('retiring a saved Pre root preserves its original and opens an unassigned disabled unified workflow', async () => {
    const graph = legacyGraph(), original = structuredClone(graph), value = savedSettings(graph);
    const host = await stateFor(value), current = host.state.settings();
    assert.deepEqual(current.archivedWorkflows?.graphs?.[graph.id], original);
    assert.deepEqual(current.archivedWorkflows.bindings, { preGraphId: graph.id, postGraphId: null });
    assert.equal(current.archivedWorkflows.activeGraphId, graph.id);
    assert.equal(Object.hasOwn(current, 'graphs'), false);
    assert.equal(host.state.activeWorkflow().mode, 'native-unified');
    assert.equal(Object.hasOwn(current, 'nativeBindings'), false);
    assert.equal(host.state.recoveredWorkflows().find(entry => entry.id === graph.id)?.graph, undefined);
    assert.equal(current.enabled, false);
    assert.equal(host.saves(), 1);
    assert.equal(host.state.settings(), current);
    assert.equal(host.saves(), 1);
});

test('archived originals export portable recovery data without local connections or assignment effects', async () => {
    const graph = legacyGraph('old-post', 'native-post');
    graph.nodes.text.profileId = 'local-private-profile';
    const host = await stateFor(savedSettings(graph));
    const current = host.state.settings(), before = structuredClone(current);
    assert.equal(typeof host.state.exportArchivedWorkflows, 'function');
    const exported = JSON.parse(host.state.exportArchivedWorkflows());
    assert.equal(exported.kind, 'lattice-workflow-archive');
    assert.equal(exported.graphs[graph.id].mode, 'native-post');
    assert.equal(exported.graphs[graph.id].nodes.text.text, 'Keep this authored text.');
    assert.equal(JSON.stringify(exported).includes('local-private-profile'), false);
    assert.deepEqual(current, before);
    assert.equal(host.saves(), 1);
});

test('a retired root package cannot reactivate an archived workflow through import', async () => {
    const graph = legacyGraph(), host = await stateFor(savedSettings(graph));
    const current = host.state.settings(), before = structuredClone(current), saves = host.saves();
    const json = JSON.stringify(exportWorkflow(graph));
    assert.equal(parseWorkflow(json).ok, false);
    const imported = host.state.importGraph(json);
    assert.equal(imported.ok, false);
    assert.equal(imported.error.code, 'WRONG_PHASE');
    assert.deepEqual(current, before);
    assert.equal(host.saves(), saves);
});

test('recovery removes Fast Decision selectors from roots, nested pins and exposed overrides without editing originals', async () => {
    // Cold snapshots preserve authored pre-retirement identities without asking the current catalog to admit them.
    const fast = id => ({ id, type: 'workflow', operation: 'fast-decision', operationVersion: 1, title: 'Fast Decision', modelRole: 'fastDecision', profileId: null, model: null, inputKind: 'data', questions: { decision: { type: 'noul', instructions: 'Does the supplied scene establish the described event?' } }, maxTokens: 2048, fastConnectionId: 'private-fast-selector', fallbackEnabled: true, fallbackProfileId: 'private-text-selector', fallbackAllowedCodes: ['RATE_LIMITED'] });
    const snapshot = (draft, semanticHash) => ({ ...draft, semanticHash });
    const ref = definition => ({ id: definition.id, version: definition.version, semanticHash: definition.semanticHash });
    const parameters = instancePath => ['fastConnectionId', 'fallbackProfileId', 'fallbackEnabled'].map(controlId => ({ id: controlId, label: controlId, target: { instancePath, nodeId: 'fast', controlId } }));
    const overrides = { fastConnectionId: 'private-override-fast', fallbackProfileId: 'private-override-text', fallbackEnabled: true };
    const child = snapshot({ id: 'fast-child', version: 1, name: 'Fast child', interface: [], parameters: parameters([]), body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { fast: fast('fast') }, wires: {} } }, 'a'.repeat(64));
    const parent = snapshot({ id: 'fast-parent', version: 1, name: 'Fast parent', interface: [], parameters: parameters(['child']), body: { schema: 3, runtime: 2, mode: 'native-pre', nodes: { child: { id: 'child', type: 'subgraph', definition: ref(child), parameterOverrides: overrides, roleOverrides: {}, nodeBindingOverrides: {} } }, wires: {} } }, 'b'.repeat(64));
    const graph = legacyGraph();
    graph.nodes.fast = fast('fast');
    graph.nodes.parent = { id: 'parent', type: 'subgraph', definition: ref(parent), parameterOverrides: overrides, roleOverrides: {}, nodeBindingOverrides: {} };
    graph.definitions = { [definitionRefKey(child)]: child, [definitionRefKey(parent)]: parent };
    const original = structuredClone(graph), host = await stateFor(savedSettings(graph));
    const current = host.state.settings(), exported = JSON.parse(host.state.exportArchivedWorkflows()).graphs[graph.id];
    assert.doesNotMatch(JSON.stringify(exported), /private-(?:fast|text|override)/);
    assert.deepEqual(current.archivedWorkflows.graphs[graph.id], original);
    assert.deepEqual(exported.nodes.parent.parameterOverrides, { fastConnectionId: '', fallbackProfileId: '', fallbackEnabled: false });
    for (const document of [exported, ...Object.values(exported.definitions).map(item => item.body)]) {
        for (const node of Object.values(document.nodes)) if (node.operation === 'fast-decision') {
            assert.equal(node.fastConnectionId, ''); assert.equal(node.fallbackProfileId, ''); assert.equal(node.fallbackEnabled, false);
            assert.deepEqual(node.fallbackAllowedCodes, ['RATE_LIMITED']);
        }
    }
    assert.equal(exported.mode, 'native-pre');
    assert.equal(exported.definitions[definitionRefKey(child)].semanticHash, child.semanticHash);
    assert.equal(exported.definitions[definitionRefKey(parent)].semanticHash, parent.semanticHash);
    assert.equal(host.saves(), 1);
});

test('legacy stage bodies remain structurally valid but cannot be admitted as executable roots', () => {
    const graph = legacyGraph();
    assert.equal(validateGraphStructure(graph).ok, true);
    const checked = validateWorkflow(graph);
    assert.equal(checked.ok, false);
    assert.equal(checked.error.code, 'WRONG_PHASE');
});

test('a mixed workspace keeps its assigned unified workflow enabled and archives only retired roots once across reloads', async () => {
    const graph = legacyGraph(), value = savedSettings(graph);
    const { starterGraph } = await import('../src/workflow/starters.js');
    const unified = starterGraph('unified-basic');
    value.graphs[unified.id] = unified; value.nativeBindings.workflowGraphId = unified.id;
    const host = await stateFor(value), current = host.state.settings();
    assert.equal(host.state.activeWorkflow().id, unified.id);
    assert.deepEqual(host.state.activeWorkflow(), unified);
    assert.equal(Object.hasOwn(current, 'graphs'), false);
    assert.equal(current.enabled, true);
    assert.equal(Object.hasOwn(current, 'nativeBindings'), false);
    assert.deepEqual(current.archivedWorkflows.graphs[graph.id], graph);
    const reloaded = await stateFor(structuredClone(current));
    assert.deepEqual(reloaded.state.settings(), current);
    assert.equal(reloaded.saves(), 0);
});

test('retirement refuses a read-only settings replacement before changing any authored state', async () => {
    const value = savedSettings(legacyGraph()), before = structuredClone(value);
    Object.defineProperty(value, 'graphs', { value: value.graphs, enumerable: true, writable: false });
    const host = await stateFor(value);
    assert.throws(() => host.state.settings(), /read.only/i);
    assert.deepEqual(value, before);
    assert.equal(host.saves(), 0);
});

test('archive accessors and conflicting originals reject without reads, mutations or saves', async () => {
    const graph = legacyGraph(); let reads = 0;
    const accessor = savedSettings(graph);
    Object.defineProperty(accessor, 'archivedWorkflows', { enumerable: true, get() { reads++; throw Error('Must not read archive getter'); } });
    const unsafe = await stateFor(accessor);
    assert.throws(() => unsafe.state.settings(), /plain.data/i);
    assert.equal(reads, 0); assert.equal(unsafe.saves(), 0);
    const conflict = savedSettings(graph), original = structuredClone(graph);
    original.nodes.text.text = 'An earlier original';
    conflict.archivedWorkflows = { schema: 1, graphs: { [graph.id]: original }, bindings: { preGraphId: graph.id, postGraphId: null }, activeGraphId: graph.id };
    const before = structuredClone(conflict), host = await stateFor(conflict);
    assert.throws(() => host.state.settings(), /identity conflicts/i);
    assert.deepEqual(conflict, before); assert.equal(host.saves(), 0);
});

test('same-id retired activation rejects without changing document authority, history or events', async () => {
    const host = await stateFor({ schema: 2, enabled: true, subgraphLibrary: { definitions: {} }, ui: {}, migrationRecovery: [], recoveryDraft: null });
    const state = host.state;
    state.settings();
    const graph = state.activeWorkflow(), token = state.documentSession.capture();
    const history = await import('../src/history.js?v=0.27.1');
    graph.name = 'Edited active document';history.noteChange(graph);history.flush(graph);
    const undo = history.peek(graph), before = structuredClone(host.context.extensionSettings.lattice);
    let activations = 0;const unsubscribe = state.onWorkflowActivated(() => { activations++; });
    try {
        for (const mode of ['native-pre', 'native-post']) {
            const result = state.activateWorkflow(legacyGraph(graph.id,mode));
            assert.equal(result?.ok,false);assert.equal(result.error.code,'WRONG_PHASE');
            assert.equal(state.activeWorkflow(),graph);assert.equal(state.documentSession.stillCurrent(token),true);
            assert.deepEqual(history.peek(graph),undo);assert.deepEqual(host.context.extensionSettings.lattice,before);
        }
        assert.equal(activations,0);assert.equal(host.saves(),0);
    } finally { unsubscribe(); }
});

test('a retired schema-2 recovery draft is preserved without becoming the active document', async () => {
    for (const mode of ['native-pre','native-post']) {
        const graph = legacyGraph('retired-draft-' + mode,mode), original = { graph, workspaceViews:null };
        const host = await stateFor({ schema: 2, enabled: true, subgraphLibrary: { definitions: {} }, ui: {}, migrationRecovery: [], recoveryDraft: original });
        const current = host.state.settings();
        assert.equal(host.state.activeWorkflow().mode,'native-unified');
        assert.notEqual(host.state.activeWorkflow().id,graph.id);
        assert.equal(current.enabled,false,'opening a fallback cannot inherit a retired document enable preference');
        const retained = host.state.recoveredWorkflows().find(entry => entry.id === 'previous-recovery-draft');
        assert.deepEqual(retained.original,original);assert.equal(retained.graph,undefined);
        assert.equal(current.recoveryDraft.graph.mode,'native-unified');
    }
});

test('a unified active document retains pinned Pre and Post definition bodies through local save and reopen', async () => {
    const graph = legacyGraph('unified-with-stage-bodies','native-unified');
    for (const mode of ['native-pre','native-post']) {
        const draft = {id:mode + '-body',version:1,name:mode,interface:[],parameters:[],body:{schema:3,runtime:2,mode,nodes:{text:{id:'text',type:'workflow',operation:'text',operationVersion:1,text:'Preserve pinned ' + mode}},wires:{}}};
        const checked = computeDefinitionIdentity(draft);assert.equal(checked.ok,true,JSON.stringify(checked.error));
        const definition = {...checked.data.materializedDefinition,semanticHash:checked.data.semanticHash};
        graph.definitions[definitionRefKey(definition)] = definition;
        graph.nodes[mode] = {id:mode,type:'subgraph',definition:{id:definition.id,version:definition.version,semanticHash:definition.semanticHash}};
    }
    const original = structuredClone(graph);
    const host = await stateFor({schema:2,enabled:false,subgraphLibrary:{definitions:{}},ui:{},migrationRecovery:[],recoveryDraft:null});
    assert.notEqual(host.state.activateWorkflow(graph)?.ok,false);
    assert.equal(host.state.activeWorkflow(),graph);assert.deepEqual(graph,original);
    const encoded = serializeWorkflowDocument(graph);assert.equal(encoded.ok,true,JSON.stringify(encoded.error));
    const parsed = parseWorkflowDocument(encoded.data.json);assert.equal(parsed.ok,true,JSON.stringify(parsed.error));
    assert.deepEqual(parsed.data.graph.definitions,original.definitions);
    assert.deepEqual(Object.values(parsed.data.graph.definitions).map(definition=>definition.body.mode).sort(),['native-post','native-pre']);
    assert.notEqual(host.state.activateWorkflow(parsed.data.graph)?.ok,false);
    assert.deepEqual(host.state.activeWorkflow().definitions,original.definitions);
});
