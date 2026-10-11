import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createWorkflowDocumentController } from '../src/ui/document-controller.js';
import { createWorkflowDocumentSession } from '../src/ui/document-session.js';
import { createWorkflowFileAccess } from '../src/ui/workflow-file-access.js';
import { createGraphViewSession } from '../src/ui/graph-view-session.js';
import { prepareWorkspaceViews } from '../src/ui/workspace-preparation.js';
import { createLibraryWorkflow } from '../src/workflow/library/subgraphs.js';
import { makeLocalCopy } from '../src/workflow/definition-library.js';
import { serializeWorkflowDocument, parseWorkflowDocument } from '../src/workflow/document-file.js';
import { exportWorkflow, parseWorkflow } from '../src/workflow/packages.js';

const accepted = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };
const graph = id => ({ id, name: id, schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, groups: {}, roles: {}, portals: {}, definitions: {} });
function nativeHandle(name, initial) {
    let text = initial, modified = 1;
    const handle = { name, kind: 'file', queryPermission: async () => 'granted', isSameEntry: async other => other === handle,
        getFile: async () => ({ name, size: new TextEncoder().encode(text).length, lastModified: modified, text: async () => text }),
        createWritable: async () => { let pending; return { write: async value => { pending = value; }, close: async () => { text = pending; modified++; }, abort: async () => {} }; },
    }; return handle;
}
function environment(files, root = graph('original')) {
    const session = createWorkflowDocumentSession(), notices = [], activations = [], prompts = [];
    session.activate(root, { clean: true, source: { kind: 'recovery', name: 'original.json' } });
    const env = { session, files, create: () => graph('new'), examples: () => ({ ok: false, error: { message: 'Unavailable' } }), recovery: () => [], views: () => session.workspaceViews(),
        prompt: async () => { prompts.push(true); return 'cancel'; }, activate(value, options) { activations.push(value); session.activate(value, options); },
        report: (message, type) => notices.push({ message, type }), changed() {},
    }; return { session, notices, activations, prompts, env, controller: createWorkflowDocumentController(env) };
}
test('Open reports unreadable native files and preserves the authored document', async () => {
    const handle = { name: 'unreadable.json', queryPermission: async () => 'granted', getFile: async () => { throw new Error('File read failed'); } };
    const f = environment(createWorkflowFileAccess({ showOpenFilePicker: async () => [handle], showSaveFilePicker: async () => handle }));
    const original = f.session.current(), source = f.session.source(); original.description = 'Unsaved work';
    assert.equal((await f.controller.open()).ok, false); assert.equal(f.session.current(), original); assert.equal(f.session.source(), source);
    assert.equal(f.session.dirty(), true); assert.deepEqual(f.activations, []); assert.deepEqual(f.prompts, []); assert.equal(f.notices[0].type, 'error');
});
test('cancelled native Open and Save As preserve source and dirty work without feedback', async () => {
    const abort = async () => { throw new DOMException('Cancelled', 'AbortError'); };
    const f = environment(createWorkflowFileAccess({ showOpenFilePicker: abort, showSaveFilePicker: abort }));
    const original = f.session.current(), source = f.session.source(); original.description = 'Keep me';
    assert.equal((await f.controller.open()).cancelled, true); assert.equal((await f.controller.save(true)).cancelled, true);
    assert.equal(f.session.current(), original); assert.equal(f.session.source(), source); assert.equal(f.session.dirty(), true); assert.deepEqual(f.notices, []); assert.deepEqual(f.activations, []);
});
test('native close failure leaves the recovery source and save checkpoint untouched', async () => {
    const handle = nativeHandle('failed.json', 'existing');
    handle.createWritable = async () => ({ write: async () => {}, close: async () => { throw new Error('Disk full'); }, abort: async () => {} });
    const f = environment(createWorkflowFileAccess({ showOpenFilePicker: async () => [handle], showSaveFilePicker: async () => handle }));
    const original = f.session.current(), source = f.session.source(); original.description = 'Unsaved';
    assert.equal((await f.controller.save()).ok, false); assert.equal(f.session.current(), original); assert.equal(f.session.source(), source); assert.equal(f.session.dirty(), true);
    assert.equal(f.notices[0].type, 'error'); assert.equal(await (await handle.getFile()).text(), 'existing');
});
function localWorkspace() {
    let root = accepted(createLibraryWorkflow('scene-compass')).graph;
    const wrapper = Object.values(root.nodes).find(node => node.type === 'subgraph').id;
    root = accepted(makeLocalCopy(root, { instancePath: [wrapper], id: 'owned-compass' })).candidate;
    root = accepted(makeLocalCopy(root, { instancePath: [wrapper, 'lens'], id: 'owned-lens' })).candidate;
    root.id = 'local-save-root'; root.name = 'Local workflow'; root.roles.Analysis = { profileId: 'local-root-profile', model: 'role-model' };
    for (const definition of Object.values(root.definitions)) if (definition.body.roles?.Analysis) definition.body.roles.Analysis.profileId = 'local-nested-profile';
    const prepared = accepted(prepareWorkspaceViews(root)), views = accepted(createGraphViewSession({ root, activationId: 'file-save', ...prepared }));
    accepted(views.openInstance([wrapper, 'lens'])); accepted(views.updateView({ camera: { x: 70, y: 90, zoom: 1.5 }, nodePresentation: { compact: { alias: 'Local alias', compact: true } } }));
    return { root, views };
}
test('Save writes the whole local root, nested ownership and retained presentation while a child tab is active', async () => {
    const { root, views } = localWorkspace(), original = structuredClone(root);
    const handle = nativeHandle('local.json', accepted(serializeWorkflowDocument(root)).json), files = createWorkflowFileAccess({ showOpenFilePicker: async () => [handle], showSaveFilePicker: async () => handle });
    const opened = accepted(await files.open()), f = environment(files, root); f.session.source(opened.source);
    f.env.views = () => { const value = accepted(views.serialize()); f.session.workspaceViews(value); return value; }; root.description = 'Authored change';
    assert.equal(views.readEditor().view.identity.kind, 'instance'); const activeKey = views.readEditor().view.key, saved = await f.controller.save();
    assert.equal(saved.ok, true); assert.equal(saved.data.downloaded, false); assert.equal(f.session.dirty(), false);
    const disk = accepted(parseWorkflowDocument(await (await handle.getFile()).text()));
    assert.equal(disk.graph.id, 'local-save-root'); assert.equal(disk.graph.description, 'Authored change'); assert.deepEqual(disk.graph.localDefinitionOwners, original.localDefinitionOwners);
    assert.equal(disk.graph.localDefinitionOwners.length, 2); assert.equal(disk.graph.roles.Analysis.profileId, 'local-root-profile');
    assert.ok(Object.values(disk.graph.definitions).some(definition => definition.body.roles?.Analysis?.profileId === 'local-nested-profile'));
    assert.equal(disk.workspaceViews.activeKey, activeKey); const child = disk.workspaceViews.views.find(view => view.identity.kind === 'instance' && view.identity.instancePath.length === 2);
    assert.deepEqual(child.camera, { x: 70, y: 90, zoom: 1.5 }); assert.deepEqual(child.nodePresentation.compact, { alias: 'Local alias', compact: true });
    assert.equal(views.readEditor().view.key, activeKey); assert.equal(f.session.source().handle, handle);
});
async function controllerFunction(name, env) {
    const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8'); let start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, `Actual controller function ${name} is available`); if (source.slice(start - 6, start) === 'async ') start -= 6;
    const end = source.indexOf('\n}', start) + 2; return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
async function exportEnvironment(root = graph('whole-root')) {
    const blobs = new Map(), downloads = [], revoked = [], later = [], notices = [];
    const env = { current: root, Blob, exportGraph: value => JSON.stringify(exportWorkflow(value)),
        URL: { createObjectURL(blob) { const url = 'blob:workflow-' + blobs.size; blobs.set(url, blob); return url; }, revokeObjectURL: url => revoked.push(url) },
        setTimeout: callback => later.push(callback), document: { createElement(tag) { assert.equal(tag, 'a'); return { click() { downloads.push({ file: this.download, blob: blobs.get(this.href) }); } }; } }, toast: (message, type) => notices.push({ message, type }),
    }; env.downloadGraphViewJSON = await controllerFunction('downloadGraphViewJSON', env); return { env, downloads, revoked, later, notices, export: await controllerFunction('onExportGraph', env) };
}
test('portable Export reports an unavailable workflow without downloading null', async () => {
    const f = await exportEnvironment(); f.env.exportGraph = () => null; assert.equal(f.export(), false); assert.equal(f.notices[0].type, 'error'); assert.deepEqual(f.downloads, []);
});
test('portable Export reports failed download clicks and still defers object URL cleanup', async () => {
    const f = await exportEnvironment(); f.env.document.createElement = () => ({ click() { throw new Error('Download failed'); } });
    assert.equal(f.export(), false); assert.deepEqual(f.notices, [{ message: 'Download failed', type: 'error' }]); assert.deepEqual(f.revoked, []); assert.equal(f.later.length, 1); f.later[0](); assert.deepEqual(f.revoked, ['blob:workflow-0']);
});
test('portable Export from a child tab receives the root graph and strips bindings and ownership without changing local work', async () => {
    const { root, views } = localWorkspace(), before = structuredClone(root), activeKey = views.readEditor().view.key, f = await exportEnvironment(root); f.env.graphViews = views;
    f.env.exportGraph = value => { assert.equal(value, root, 'export receives the graph object'); return JSON.stringify(exportWorkflow(value)); };
    assert.equal(f.export(), true); assert.deepEqual(f.notices, []); assert.equal(f.downloads[0].file, 'Local_workflow.workflow.json');
    const exported = accepted(parseWorkflow(await f.downloads[0].blob.text())); assert.equal(exported.id, root.id); assert.deepEqual(Object.keys(exported.nodes).sort(), Object.keys(root.nodes).sort());
    assert.equal(exported.roles.Analysis.profileId, null); assert.equal(exported.localDefinitionOwners, undefined); assert.equal(JSON.stringify(exported).includes('local-nested-profile'), false);
    assert.deepEqual(root, before); assert.equal(views.readEditor().view.key, activeKey); f.later.forEach(callback => callback()); assert.deepEqual(f.revoked, ['blob:workflow-0']);
});
