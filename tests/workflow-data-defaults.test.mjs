import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChatDocumentCatalog } from '../src/workflow/document-catalog.js?v=0.27.2';
import { operationDefaults } from '../src/workflow/catalog.js?v=0.27.2';
import { executeTimeNode } from '../src/workflow/operations/time-nodes.js?v=0.27.2';
import { executeFileNode } from '../src/workflow/operations/file-nodes.js?v=0.27.2';
import { ensureWorkflowDataDefaults, workflowDataKind, workflowDataPresetFor } from '../src/workflow/workflow-data-defaults.js?v=0.27.2';
import { unifiedRecipeHost } from './helpers/unified-recipe-host.mjs';
import { normalizeOccurrences, confirmOccurrences, resolveItemHolders } from '../src/workflow/operations/event-data.js?v=0.27.2';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definition-data.js?v=0.27.2';

function fixture() {
    let userId = 'user', live = { chatId: 'chat', chat: [{ mes: 'A turn', is_user: true }], chatMetadata: { keep: true } };
    const catalog = createChatDocumentCatalog({ getContext: () => live, getUserId: () => userId });
    return { catalog, context: () => live, scope: { userId, chatId: live.chatId }, switchChat() { live = { chatId: 'next', chat: [], chatMetadata: {} }; }, switchUser() { userId = 'other'; } };
}
const graph = (...nodes) => ({ nodes: Object.fromEntries(nodes.map((node, index) => [index, node])) });
const provision = (f, selected, catalog = f.catalog) => ensureWorkflowDataDefaults({ catalog, graph: selected, scope: f.scope, context: f.context, isCurrent: () => f.context().chatId === f.scope.chatId });

test('new document-backed nodes have usable named defaults without requiring chat authoring', () => {
    assert.equal(operationDefaults('story-clock').clockId, 'lattice-default-clock');
    assert.equal(operationDefaults('read-file').targetId, 'lattice-default-notes');
    assert.equal(operationDefaults('commit-outcomes').targetId, 'lattice-default-outcomes');
    assert.equal(operationDefaults('random-pick').ledgerId, '');
    assert.equal(workflowDataPresetFor('commit-clock'), null);
    const clock = workflowDataPresetFor('story-clock');
    assert.equal(clock.name, 'Chat clock');
    assert.equal(clock.format, 'json');
    assert.deepEqual(JSON.parse(clock.content), { schemaVersion: 1, clockId: 'lattice-default-clock', calendarId: 'story-calendar', dayLengthMinutes: 1440, absoluteMinute: 0, revision: 1, unit: 'minute', originMinute: 0, originDay: 1, timeEvidence: { kind: 'explicit' } });
});

test('provisioning creates only referenced built-in defaults and never arbitrary custom targets', () => {
    const f = fixture();
    assert.equal(provision(f, graph({ operation: 'read-file' }, { operation: 'story-clock', clockId: 'custom-clock' }, { operation: 'random-pick', ledgerId: '' })).ok, true);
    assert.deepEqual(f.catalog.snapshot().data.documents.map(doc => doc.targetId), ['lattice-default-notes']);
    assert.equal(f.catalog.definition('lattice-default-notes').data.content, '');
    assert.equal(f.catalog.definition('lattice-default-notes').data.format, 'text');
    assert.equal(f.context().chatMetadata.keep, true);
    assert.equal(f.context().chatMetadata.latticeDocuments, undefined);
    assert.equal(provision(f, graph({ operation: 'story-clock', clockId: '' }, { operation: 'commit-outcomes' }, { operation: 'random-pick', ledgerId: 'lattice-default-outcomes' })).ok, true);
    assert.deepEqual(f.catalog.snapshot().data.documents.map(doc => doc.targetId).sort(), ['lattice-default-clock', 'lattice-default-notes', 'lattice-default-outcomes']);
});

test('compatible existing settings and saved document bytes win without changing catalog leases', () => {
    const f = fixture(), clock = workflowDataPresetFor('story-clock');
    const initial = { ...JSON.parse(clock.content), absoluteMinute: 120 };
    assert.equal(f.catalog.define({ targetId: clock.targetId, name: 'Renamed clock', format: 'json', content: JSON.stringify(initial), visibility: { kind: 'hidden' } }).ok, true);
    f.context().chatMetadata.latticeDocuments = { user: { [clock.targetId]: { targetId: clock.targetId, format: 'json', revision: 3, content: JSON.stringify({ ...initial, absoluteMinute: 900, revision: 3 }), receipts: [] } } };
    const bytes = JSON.stringify(f.context().chatMetadata), lease = f.catalog.capture().data;
    assert.equal(provision(f, graph({ operation: 'story-clock' })).ok, true);
    assert.equal(JSON.stringify(f.context().chatMetadata), bytes);
    assert.equal(lease.isCurrent(), true);
});

test('incompatible reserved clock or saved outcome data reports a conflict before creating other defaults', () => {
    const f = fixture(), clock = workflowDataPresetFor('story-clock');
    assert.equal(f.catalog.define({ targetId: clock.targetId, name: 'Existing unrelated data', format: 'json', content: '{}', visibility: { kind: 'public' } }).ok, true);
    const before = JSON.stringify(f.context().chatMetadata);
    const result = provision(f, graph({ operation: 'read-file' }, { operation: 'story-clock' }));
    assert.equal(result.error.code, 'WORKFLOW_DATA_DEFAULT_CONFLICT');
    assert.equal(JSON.stringify(f.context().chatMetadata), before);
    const g = fixture();
    g.context().chatMetadata.latticeDocuments = { user: { 'lattice-default-outcomes': { targetId: 'lattice-default-outcomes', format: 'json', content: '{}', revision: 1, receipts: [] } } };
    assert.equal(provision(g, graph({ operation: 'commit-outcomes' })).error.code, 'WORKFLOW_DATA_DEFAULT_CONFLICT');
    assert.equal(g.context().chatMetadata.latticeDocumentCatalog, undefined);
});

test('a reserved outcomes array with records lacking stable outcome IDs is rejected without mutation', () => {
    for (const content of ['[1]', '[{}]', '[{"outcomeId":" "}]']) {
        const f = fixture(), preset = workflowDataPresetFor('commit-outcomes');
        assert.equal(f.catalog.define({ targetId: preset.targetId, name: preset.name, format: 'json', content, visibility: { kind: 'public' } }).ok, true);
        const before = JSON.stringify(f.context().chatMetadata);
        const result = provision(f, graph({ operation: 'read-file' }, { operation: 'commit-outcomes' }));
        assert.equal(result.ok, false, JSON.stringify(result));
        assert.equal(result.error.code, 'WORKFLOW_DATA_DEFAULT_CONFLICT');
        assert.equal(JSON.stringify(f.context().chatMetadata), before);
        assert.equal(workflowDataKind({ ...preset, content }), 'notes');
    }
});

test('a reserved outcomes collection larger than the Random Pick reader window remains compatible with Outcome Commit', () => {
    const f = fixture(), preset = workflowDataPresetFor('commit-outcomes'), content = JSON.stringify(Array.from({ length: 257 }, (_, index) => ({ outcomeId: 'outcome-' + index })));
    assert.equal(f.catalog.define({ targetId: preset.targetId, name: preset.name, format: 'json', content, visibility: { kind: 'public' } }).ok, true);
    const before = JSON.stringify(f.context().chatMetadata);
    const result = provision(f, graph({ operation: 'commit-outcomes' }));
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(workflowDataKind({ ...preset, content }), 'outcomes');
    assert.equal(JSON.stringify(f.context().chatMetadata), before);
});

test('a scope change in catalog callbacks cannot create authorization in the new scope', () => {
    const f = fixture();
    const catalog = { capture() { const captured = f.catalog.capture(); f.switchChat(); return captured; }, defineCaptured: f.catalog.defineCaptured };
    const result = provision(f, graph({ operation: 'story-clock' }), catalog);
    assert.equal(result.error.code, 'STALE_DOCUMENT_SCOPE');
    assert.equal(f.context().chatMetadata.latticeDocumentCatalog, undefined);
    const g = fixture();
    const userCatalog = { capture() { const captured = g.catalog.capture(); g.switchUser(); return captured; }, defineCaptured: g.catalog.defineCaptured };
    assert.equal(provision(g, graph({ operation: 'read-file' }), userCatalog).error.code, 'STALE_DOCUMENT_SCOPE');
    assert.equal(g.context().chatMetadata.latticeDocumentCatalog, undefined);
});

test('clock classification checks schema, revision and internal target identity instead of treating all JSON as clocks', () => {
    const clock = workflowDataPresetFor('story-clock');
    assert.equal(workflowDataKind(clock), 'clock');
    assert.equal(workflowDataKind({ ...clock, content: JSON.stringify({ ...JSON.parse(clock.content), clockId: 'other' }) }), 'notes');
    assert.equal(workflowDataKind({ ...clock, content: JSON.stringify({ ...JSON.parse(clock.content), revision: 0 }) }), 'notes');
    assert.equal(workflowDataKind({ ...clock, content: '[]' }), 'outcomes');
    assert.equal(workflowDataKind({ ...clock, content: '{}' }), 'notes');
    assert.equal(workflowDataKind({ ...clock, content: 'invalid json' }), null);
    assert.equal(workflowDataKind(workflowDataPresetFor('read-file')), 'notes');
});

test('legacy blank required IDs resolve to presets while blank optional outcome storage stays disabled', async () => {
    let readClockId, readTarget;
    const clock = JSON.parse(workflowDataPresetFor('story-clock').content);
    const time = await executeTimeNode({ operation: 'story-clock', clockId: '' }, {}, { root: true, readStoryClock: async id => { readClockId = id; return { ok: true, data: clock }; } });
    assert.equal(time.ok, true, JSON.stringify(time.error));
    assert.equal(readClockId, 'lattice-default-clock');
    const read = await executeFileNode({ operation: 'read-file', targetId: '' }, {}, { root: true, files: { read: async targetId => { readTarget = targetId; return { ok: false, error: { code: 'FILE_NOT_FOUND', message: 'No document' } }; } } });
    assert.equal(read.error.code, 'FILE_NOT_FOUND');
    assert.equal(readTarget, 'lattice-default-notes');
});

function defaultWorkflow() {
    const g = { id: 'automatic-data', name: 'Automatic data', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, portals: {}, definitions: {} };
    const node = (id, operation, controls = {}) => g.nodes[id] = { id, type: 'workflow', ...operationDefaults(operation), ...controls };
    const wire = (id, from, fromPort, to, toPort) => g.wires[id] = { id, route: 'wire', from, fromPort, to, toPort };
    node('send', 'on-send'); node('generate', 'generate-reply'); node('review', 'review-publish');
    wire('activation', 'send', 'activation', 'generate', 'activation'); wire('draft', 'generate', 'draft', 'review', 'draft');
    node('read', 'read-file', { targetId: '' }); node('body', 'draft-text'); node('write', 'write-file');
    wire('body', 'generate', 'draft', 'body', 'draft'); wire('reference', 'read', 'reference', 'write', 'reference'); wire('notes', 'body', 'out', 'write', 'text');
    node('clock', 'story-clock', { clockId: '' }); node('duration', 'text', { text: '{"kind":"duration","minutes":30}' }); node('proposal', 'json-decode'); node('advance', 'advance-time'); node('commit', 'commit-clock');
    wire('parse', 'duration', 'out', 'proposal', 'in'); wire('clock', 'clock', 'out', 'advance', 'clock'); wire('proposal', 'proposal', 'out', 'advance', 'proposal'); wire('commit', 'advance', 'report', 'commit', 'projection');
    return g;
}

test('manual default node previews need no prior authorization and provision only the selected dependency', async () => {
    const g = defaultWorkflow(), f = unifiedRecipeHost(g);
    const result = await f.controller.runTarget(g, { workflowId: g.id, instancePath: [], nodeId: 'read', portId: 'text' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(f.catalog.snapshot().data.documents.map(doc => doc.targetId), ['lattice-default-notes']);
    assert.equal(f.saves(), 0);
    assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
    const clockResult = await f.controller.runTarget(g, { workflowId: g.id, instancePath: [], nodeId: 'clock', portId: 'out' });
    assert.equal(clockResult.ok, true, JSON.stringify(clockResult.error));
    assert.equal(f.saves(), 0);
});

test('Read File alone provisions the reserved clock or outcomes source referenced by an imported workflow', async () => {
    for (const targetId of ['lattice-default-clock', 'lattice-default-outcomes']) {
        const g = { id: 'imported-read', name: 'Imported read', schema: 3, runtime: 2, mode: 'native-unified', nodes: { read: { id: 'read', type: 'workflow', ...operationDefaults('read-file'), targetId } }, wires: {}, portals: {}, definitions: {} };
        const f = unifiedRecipeHost(g);
        const result = await f.controller.runTarget(g, { workflowId: g.id, instancePath: [], nodeId: 'read', portId: 'document' });
        assert.equal(result.ok, true, JSON.stringify(result.error));
        assert.deepEqual(f.catalog.snapshot().data.documents.map(doc => doc.targetId), [targetId]);
        assert.equal(f.saves(), 0);
        assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
    }
});

test('a zero-setup native workflow captures every referenced default before staging accepted notes and clock writes', async () => {
    const g = defaultWorkflow(), f = unifiedRecipeHost(g);
    const result = await f.generate('Mara rests for half an hour.');
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(f.saves(), 0);
    assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
    assert.deepEqual(f.catalog.snapshot().data.documents.map(doc => doc.targetId).sort(), ['lattice-default-clock', 'lattice-default-notes']);
    const accepted = await f.controller.apply(result.reviewHandles[0]);
    assert.equal(accepted.ok, true, JSON.stringify(accepted.error));
    assert.equal(accepted.settlement.status, 'settled');
    assert.equal(f.saves(), 2);
    const stored = f.c.chatMetadata.latticeDocuments['default-user'];
    assert.equal(stored['lattice-default-notes'].content, 'Mara rests for half an hour.');
    const clock = JSON.parse(stored['lattice-default-clock'].content);
    assert.equal(clock.absoluteMinute, 30);
    assert.equal(clock.revision, 2);
    assert.equal(clock.calendarId, 'story-calendar');
});

function defaultOutcomeWorkflow() {
    const g = defaultWorkflow(), retained = new Set(['send', 'generate', 'review']);
    g.nodes = Object.fromEntries(Object.entries(g.nodes).filter(([key]) => retained.has(key)));
    g.wires = Object.fromEntries(Object.entries(g.wires).filter(([, wire]) => retained.has(wire.from) && retained.has(wire.to)));
    const node = (id, operation, controls = {}) => g.nodes[id] = { id, type: 'workflow', ...operationDefaults(operation), ...controls };
    const wire = (id, from, fromPort, to, toPort) => g.wires[id] = { id, route: 'wire', from, fromPort, to, toPort };
    const playerText = 'Mara uses her wand.';
    const source = { sourceId: 'player-turn', revision: '1', sceneId: 'Story-2', watch: 'player-message', text: playerText, visibility: 'public' };
    const candidates = normalizeOccurrences(source, [{ eventType: 'item-used', actorId: 'mara', itemId: 'wand', position: { start: 0, end: playerText.length }, semantics: 'actual' }], { actorIds: ['mara'], itemIds: ['wand'] }).data.events;
    const events = resolveItemHolders({ wand: 'mara' }, confirmOccurrences(candidates, [{ eventId: candidates[0].eventId, accepted: true }]).data.events).data.events;
    for (const [id, value] of Object.entries({ events, library: { libraryId: 'wand', revision: '1', itemId: 'wand', effects: [{ id: 'sparks', kind: 'fixed', weight: 1, description: 'Blue sparks appear.' }] } })) {
        node(id + '-text', 'text', { text: JSON.stringify(value) }); node(id, 'json-decode'); wire(id + '-parse', id + '-text', 'out', id, 'in');
    }
    node('pick', 'random-pick'); node('commit', 'commit-outcomes', { targetId: '' });
    wire('events', 'events', 'out', 'pick', 'events'); wire('library', 'library', 'out', 'pick', 'library'); wire('commit', 'pick', 'out', 'commit', 'outcomes');
    return { g, playerText };
}

test('default Outcome Commit saves accepted draws without any prior Workflow Data authorization', async () => {
    const { g, playerText } = defaultOutcomeWorkflow(), f = unifiedRecipeHost(g, { playerText });
    const result = await f.generate('Blue sparks appear.');
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(f.catalog.snapshot().data.documents.map(doc => doc.targetId), ['lattice-default-outcomes']);
    assert.equal(f.saves(), 0);
    assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
    const accepted = await f.controller.apply(result.reviewHandles[0]);
    assert.equal(accepted.ok, true, JSON.stringify(accepted.error));
    assert.equal(accepted.settlement.status, 'settled');
    assert.equal(f.saves(), 1);
    const outcomes = JSON.parse(f.c.chatMetadata.latticeDocuments['default-user']['lattice-default-outcomes'].content);
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].acceptance, 'accepted');
    assert.equal(outcomes[0].selection.id, 'sparks');
});

test('blank Random Pick storage remains optional and creates no document during a selected-node preview', async () => {
    const { g, playerText } = defaultOutcomeWorkflow(), f = unifiedRecipeHost(g, { playerText });
    const result = await f.controller.runTarget(g, { workflowId: g.id, instancePath: [], nodeId: 'pick', portId: 'out' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(f.catalog.snapshot().data.documents, []);
    assert.equal(f.c.chatMetadata.latticeDocumentCatalog, undefined);
    assert.equal(f.saves(), 0);
});

test('a bound Random Pick in a pinned subgraph provisions its referenced preset before session capture', async () => {
    const { g, playerText } = defaultOutcomeWorkflow();
    const edge = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
    const raw = { id: 'shared-pick', version: 1, name: 'Shared Pick', parameters: [], interface: [
        { id: 'events', label: 'Events', kind: 'data', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'events' },
        { id: 'library', label: 'Library', kind: 'data', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'library' },
        { id: 'out', label: 'Outcomes', kind: 'data', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'result' },
    ], body: { schema: 3, runtime: 2, mode: 'native-unified', nodes: {
        events: { id: 'events', type: 'subgraph-input', interfacePortId: 'events' }, library: { id: 'library', type: 'subgraph-input', interfacePortId: 'library' }, result: { id: 'result', type: 'subgraph-output', interfacePortId: 'out' },
        pick: { id: 'pick', type: 'workflow', ...operationDefaults('random-pick'), ledgerId: 'lattice-default-outcomes' },
    }, wires: { events: edge('events', 'events', 'out', 'pick', 'events'), library: edge('library', 'library', 'out', 'pick', 'library'), result: edge('result', 'pick', 'out', 'result', 'in') }, roles: {} } };
    const identity = computeDefinitionIdentity(raw);
    assert.equal(identity.ok, true, JSON.stringify(identity.error));
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash };
    const ref = { id: definition.id, version: definition.version, semanticHash: definition.semanticHash };
    g.definitions[definitionRefKey(ref)] = definition;
    g.nodes.pick = { id: 'pick', type: 'subgraph', definition: ref, parameterOverrides: {}, roleOverrides: {} };
    const f = unifiedRecipeHost(g, { playerText });
    const result = await f.controller.runTarget(g, { workflowId: g.id, instancePath: [], nodeId: 'pick', portId: 'out' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(f.catalog.snapshot().data.documents.length, 1);
    assert.match(f.catalog.snapshot().data.documents[0].targetId, /^lattice-system-outcomes-/);
    assert.equal(f.saves(), 0);
    assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
});

function defaultOutcomeIteration({ included = true } = {}) {
    const { g, playerText } = defaultOutcomeWorkflow();
    g.nodes['events-text'].text = JSON.stringify([JSON.parse(g.nodes['events-text'].text)]);
    const edge = (id, from, fromPort, to, toPort) => ({ id, route: 'wire', from, fromPort, to, toPort });
    const raw = { id: 'iterate-outcomes', version: 1, name: 'Iterate outcomes', parameters: [], interface: [
        { id: 'item', label: 'Item', kind: 'data', direction: 'input', required: true, cardinality: 'one', boundaryNodeId: 'entry' },
        { id: 'result', label: 'Result', kind: 'data', direction: 'output', required: false, cardinality: 'one', boundaryNodeId: 'exit' },
    ], body: { schema: 3, runtime: 2, mode: 'native-unified', roles: {}, nodes: {
        entry: { id: 'entry', type: 'subgraph-input', interfacePortId: 'item' }, exit: { id: 'exit', type: 'subgraph-output', interfacePortId: 'result' },
        libraryText: { id: 'libraryText', type: 'workflow', ...operationDefaults('text'), text: g.nodes['library-text'].text }, library: { id: 'library', type: 'workflow', ...operationDefaults('json-decode') },
        pick: { id: 'pick', type: 'workflow', ...operationDefaults('random-pick'), ledgerId: 'lattice-default-outcomes' },
    }, wires: { libraryParse: edge('libraryParse', 'libraryText', 'out', 'library', 'in'), library: edge('library', 'library', 'out', 'pick', 'library'), events: edge('events', 'entry', 'out', 'pick', 'events'), result: included ? edge('result', 'pick', 'out', 'exit', 'in') : edge('result', 'entry', 'out', 'exit', 'in') } } };
    const identity = computeDefinitionIdentity(raw);
    assert.equal(identity.ok, true, JSON.stringify(identity.error));
    const definition = { ...identity.data.materializedDefinition, semanticHash: identity.data.semanticHash }, ref = { id: definition.id, version: definition.version, semanticHash: definition.semanticHash };
    g.definitions[definitionRefKey(ref)] = definition;
    g.nodes.pick = { id: 'pick', type: 'workflow', ...operationDefaults('for-each'), helper: ref, limit: 2 };
    g.wires.events.toPort = 'in';
    delete g.wires.library;
    return { g, playerText };
}

test('For Each provisions the explicitly bound preset from its included compiled helper nodes', async () => {
    const { g, playerText } = defaultOutcomeIteration(), f = unifiedRecipeHost(g, { playerText });
    const result = await f.controller.runTarget(g, { workflowId: g.id, instancePath: [], nodeId: 'pick', portId: 'out' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(f.catalog.snapshot().data.documents.map(doc => doc.targetId), ['lattice-default-outcomes']);
    assert.equal(f.saves(), 0);
    assert.equal(f.c.chatMetadata.latticeDocuments, undefined);
});

test('For Each does not provision defaults referenced only by unused helper nodes', async () => {
    const { g, playerText } = defaultOutcomeIteration({ included: false }), f = unifiedRecipeHost(g, { playerText });
    const result = await f.controller.runTarget(g, { workflowId: g.id, instancePath: [], nodeId: 'pick', portId: 'out' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.deepEqual(f.catalog.snapshot().data.documents, []);
    assert.equal(f.c.chatMetadata.latticeDocumentCatalog, undefined);
});
