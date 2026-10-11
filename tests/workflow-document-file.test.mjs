import assert from 'node:assert/strict';
import { serializeWorkflowDocument, parseWorkflowDocument } from '../src/workflow/document-file.js';
import { computeDefinitionIdentity, definitionRefKey } from '../src/workflow/definitions.js';
import { exportWorkflow } from '../src/workflow/packages.js';
import { createGraphViewSession } from '../src/ui/graph-view-session.js';
import { prepareWorkspaceViews } from '../src/ui/workspace-preparation.js';

const must = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };
const raw = { id: 'body', version: 1, name: 'Local body', interface: [], parameters: [{ id: 'value', label: 'Value', target: { instancePath: [], nodeId: 'text', controlId: 'text' } }], body: { schema: 3, runtime: 2, mode: 'native-unified', nodes: { text: { id: 'text', type: 'workflow', operation: 'text', text: 'nested', profileId: 'local-inner', presentation: { alias: 'Nested', compact: true }, x: 3, y: 4 } }, wires: {}, roles: { author: { profileId: 'local-role', model: 'model' } } } };
const identity = must(computeDefinitionIdentity(raw)), def = { ...identity.materializedDefinition, semanticHash: identity.semanticHash };
const graph = { id: 'root', name: 'Authoring', description: 'Preserved', schema: 3, runtime: 2, mode: 'native-unified', nodes: { wrapper: { id: 'wrapper', type: 'subgraph', definition: { id: def.id, version: def.version, semanticHash: def.semanticHash }, parameterOverrides: { value: 'override' }, roleOverrides: { author: { profileId: 'local-override', model: null } }, nodeBindingOverrides: { '[[],"text"]': { profileId: 'local-node', model: 'chosen' } }, localCopy: { definitionId: 'body' }, presentation: { alias: 'Wrapper', compact: true } }, note: { id: 'note', type: 'note', content: 'Note', commentFrame: { x: 1, y: 2, w: 3, h: 4 }, moveContents: true } }, wires: {}, groups: {}, roles: { writer: { profileId: 'local-root', model: 'model' } }, definitions: { [definitionRefKey(def)]: def }, localDefinitionOwners: [{ instancePath: ['wrapper'], definitionId: 'body' }] };
const views = { version: 1, workflowId: 'root', activeKey: '["root","root"]', views: [{ identity: { kind: 'root', workflowId: 'root' }, open: true, camera: { x: 1, y: 2, zoom: 1 }, selection: { primary: null, multi: [] }, inspector: { item: null, section: '', open: true }, nodePresentation: {} }] };
const json = must(serializeWorkflowDocument(graph, views)).json, envelope = JSON.parse(json);
assert.deepEqual([envelope.kind, envelope.schema, envelope.minRuntime], ['lattice-document', 1, 2]);
const parsed = must(parseWorkflowDocument(json));
assert.deepEqual(parsed.graph, graph, 'local authoring serialization retains controls, local references and ownership exactly');
assert.deepEqual(parsed.workspaceViews, views);
assert.deepEqual(must(parseWorkflowDocument(must(serializeWorkflowDocument(parsed.graph, parsed.workspaceViews)).json)), parsed);
const privateGraph = structuredClone(graph);
privateGraph.recording = { output: 'runtime-private' }; privateGraph.chat = ['chat-private']; privateGraph.nodes.note.result = 'node-private'; privateGraph.roles.writer.recording = 'role-private'; privateGraph.definitions[definitionRefKey(def)].body.nodes.text.outputs = 'nested-private';
const privateViews = structuredClone(views); privateViews.views[0].recording = 'view-private';
const safe = must(serializeWorkflowDocument(privateGraph, privateViews)).json;
for (const secret of ['runtime-private', 'chat-private', 'node-private', 'role-private', 'nested-private', 'view-private']) assert.equal(safe.includes(secret), false);
assert.deepEqual(must(parseWorkflowDocument(safe)).graph, graph);
assert.deepEqual(must(parseWorkflowDocument(JSON.stringify(exportWorkflow(graph)))).graph, exportWorkflow(graph).graph, 'existing portable files remain openable');
assert.equal(must(parseWorkflowDocument(JSON.stringify(exportWorkflow(graph)))).workspaceViews, null);
assert.equal(parseWorkflowDocument('{broken').error.code, 'INVALID_JSON');
for (const value of ['null', 'true', '42', '"plain text"', '[]']) assert.equal(parseWorkflowDocument(value).error.code, 'UNSUPPORTED_PACKAGE', 'valid JSON primitives are unsupported document envelopes and return a Result');
assert.equal(parseWorkflowDocument(JSON.stringify({ ...envelope, schema: 2 })).error.code, 'UNSUPPORTED_PACKAGE');
assert.equal(serializeWorkflowDocument({ ...graph, credentials: { apiKey: 'secret' } }).ok, false);
let read = false;
const accessor = { ...graph, get name() { read = true; return 'unsafe'; } };
assert.equal(serializeWorkflowDocument(accessor).ok, false);
assert.equal(read, false, 'unsafe properties are rejected before reads');
assert.equal(parseWorkflowDocument('{"kind":"lattice-document","schema":1,"minRuntime":2,"graph":{"__proto__":{}}}').ok, false);
assert.equal(serializeWorkflowDocument({ ...graph, description: '界'.repeat(700000) }).ok, false);
const runtimeSecrets = structuredClone(graph);
runtimeSecrets.recording = { secret: 'runtime-only' };
runtimeSecrets.nodes.note.result = { credentials: 'runtime-only' };
let runtimeRead = false;
Object.defineProperty(runtimeSecrets, 'chat', { enumerable: true, get() { runtimeRead = true; throw new Error('runtime getter'); } });
assert.deepEqual(must(parseWorkflowDocument(must(serializeWorkflowDocument(runtimeSecrets)).json)).graph, graph, 'private runtime payloads are omitted before authoring validation');
assert.equal(runtimeRead, false);
const unsafeFrame = structuredClone(graph);
unsafeFrame.groups.group = { id: 'group' };
let frameRead = false;
Object.defineProperty(unsafeFrame.groups.group, 'frame', { enumerable: true, get() { frameRead = true; return {}; } });
assert.equal(serializeWorkflowDocument(unsafeFrame).ok, false);
assert.equal(frameRead, false, 'authored nested accessors are rejected before reads');
for (const mutate of [
    value => { value.views[0].camera.zoom = 0; },
    value => { value.views[0].identity.kind = 'unknown'; },
    value => { value.activeKey = '["missing"]'; },
    value => { value.views[0].selection.multi = [null]; },
    value => { value.views[0].nodePresentation.text = { alias: 'x'.repeat(81) }; },
]) {
    const malformed = structuredClone(views); mutate(malformed);
    assert.equal(parseWorkflowDocument(JSON.stringify({ ...envelope, workspaceViews: malformed })).ok, false, 'malformed persisted presentation is rejected before document activation');
}
const idless = { schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {} };
for (const envelope of [exportWorkflow(idless), { kind: 'lattice-document', schema: 1, minRuntime: 2, graph: idless }]) {
    const admitted = must(parseWorkflowDocument(JSON.stringify(envelope))).graph;
    assert.equal(typeof admitted.id, 'string', 'accepted files without optional root metadata receive an editor identity');
    assert.ok(admitted.id.length > 0);
    assert.equal(admitted.name, 'Imported workflow');
    assert.equal(createGraphViewSession({ root: admitted, activationId: 'admitted', ...must(prepareWorkspaceViews(admitted)) }).ok, true);
    assert.equal(must(parseWorkflowDocument(must(serializeWorkflowDocument(admitted)).json)).graph.id, admitted.id, 'the admitted identity remains stable through file saves and reopens');
}
console.log('workflow-document-file: ok');
