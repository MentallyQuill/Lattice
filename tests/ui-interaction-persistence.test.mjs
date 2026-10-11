import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.26.0';

const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
function controllerFunction(name, env) {
    const start = source.indexOf('function ' + name + '('), lineEnd = source.indexOf('\n', start), firstLine = source.slice(start, lineEnd).trim();
    assert.ok(start >= 0, 'Actual controller function ' + name);
    const end = firstLine.endsWith('}') ? lineEnd : source.indexOf('\n}', start) + 2;
    return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
function persistenceFixture() {
    const root = { id: 'persistence-root', nodes: {}, wires: {} }, identity = { kind: 'root', workflowId: root.id }, child = { kind: 'instance', workflowId: root.id, instancePath: ['child'] };
    const session = createGraphViewSession({ root, activationId: 'persistence-activation', navigation: [{ identity: child, label: 'Child' }], preparedViews: [identity, child].map(identity => ({ identity, ...(identity.kind === 'instance' ? { definitionRef: { id: 'definition', version: 1, semanticHash: 'hash' } } : {}), savedGraph: { nodes: {}, wires: {} }, effectiveNodes: {}, interface: [], ports: [] })) }).data;
    session.updateView({ nodePresentation: { retained: { alias: 'Root draft', x: 12 } } }); session.openInstance(['child']); session.updateView({ nodePresentation: { other: { alias: 'Child draft', compact: true } } });
    const stored = {}, scheduled = new Map(); let sequence = 0, serializations = 0, saves = 0;
    const env = { graphViews: { ...session, serialize() { serializations++; return session.serialize(); } }, activeWorkflow: () => root, setActiveWorkspaceViews: views => { stored.views = views; }, viewSaveTimer: null, save: () => saves++, setTimeout(callback) { scheduled.set(++sequence, callback); return sequence; }, clearTimeout(ticket) { scheduled.delete(ticket); } };
    return { session, stored, scheduled, env, persist: controllerFunction('persistGraphViews', env), serializations: () => serializations, saves: () => saves };
}

test('camera bursts defer retained-view serialization until the save boundary', () => {
    const f = persistenceFixture();
    for (let index = 0; index < 60; index++) { f.session.updateView({ camera: { x: index, y: -index, zoom: 1.5 } }); f.persist(false, true); }
    assert.equal(f.serializations(), 0); assert.equal(f.saves(), 0); assert.equal(f.scheduled.size, 1);
    [...f.scheduled.values()][0](); assert.equal(f.serializations(), 1); assert.equal(f.saves(), 1);
    const views = f.stored.views.views;
    assert.deepEqual(views[0].nodePresentation, { retained: { alias: 'Root draft', x: 12 } });
    assert.deepEqual(views[1].nodePresentation, { other: { alias: 'Child draft', compact: true } });
    assert.deepEqual(views[1].camera, { x: 59, y: -59, zoom: 1.5 });
});

test('flush stores the final camera synchronously and clears the deferred save before a session switch', () => {
    const f = persistenceFixture(); f.session.updateView({ camera: { x: 40, y: 90, zoom: 2 } }); f.persist(false, true);
    f.persist(true); assert.equal(f.serializations(), 1); assert.equal(f.saves(), 1); assert.equal(f.scheduled.size, 0);
    f.env.graphViews = null;
    assert.deepEqual(f.stored.views.views[1].camera, { x: 40, y: 90, zoom: 2 });
});

test('Details width persistence updates only active inspector presentation', () => {
    const f = persistenceFixture(); let persisted = 0; const updates = [];
    Object.assign(f.env, { canvas: { cancelGesture() {} }, workbench: { update: value => updates.push(value) }, root: { classList: { contains: () => false } }, persistGraphViews: () => persisted++ });
    f.env.syncPaneToggles = controllerFunction('syncPaneToggles', f.env);
    const resize = controllerFunction('resizeDetails', f.env), before = f.session.readEditor().view;
    resize(400); assert.equal(f.session.readEditor().view.inspector.width, 400); assert.equal(persisted, 1); assert.equal(updates.at(-1).detailsWidth, 400);
    assert.equal(f.session.readEditor().view.nodePresentation, before.nodePresentation);
    resize(Infinity); resize(0); assert.equal(persisted, 1); assert.equal(f.session.readEditor().view.inspector.width, 400);
});

test('graph navigation flushes the cancelled source camera before changing the active view', () => {
    const f = persistenceFixture(), childKey = f.session.readEditor().view.key, rootKey = f.session.project().graphViews.tabs[0].key, serialized = [];
    const serialize = f.env.graphViews.serialize;
    f.env.graphViews = { ...f.env.graphViews, serialize() { const result = serialize(); serialized.push(result.data.activeKey); return result; } };
    Object.assign(f.env, { canvas: { cancelGesture() { f.session.updateView({ camera: { x: 70, y: 80, zoom: 2 } }); f.persist(false, true); } }, persistGraphViews: f.persist, activateEditorDraw() {}, toast: () => assert.fail('Navigation must remain current') });
    controllerFunction('navigateGraphView', f.env)('focusView', rootKey);
    assert.equal(f.session.readEditor().view.key, rootKey);
    const saved = f.stored.views;
    assert.deepEqual(saved.views.find(view => view.identity.kind === 'instance').camera, { x: 70, y: 80, zoom: 2 });
    assert.equal(serialized[0], childKey, 'The synchronous boundary stores the source view before navigation');
    assert.equal(saved.activeKey, rootKey, 'Explicit navigation immediately publishes the new active view');
    assert.deepEqual(f.session.readEditor().view.camera, { x: 0, y: 0, zoom: 1 });
    [...f.scheduled.values()][0](); assert.equal(f.stored.views.activeKey, rootKey);
});

test('close flushes the final cancelled camera before deactivating the view session', () => {
    const f = persistenceFixture();
    f.env.pendingDocumentPrompt = null; f.env.documentCommands = null;
    f.env.chooseDocumentPrompt = controllerFunction('chooseDocumentPrompt', f.env);
    f.env.workbench = { update() {} };
    Object.assign(f.env, { canvas: { cancelGesture() { f.session.updateView({ camera: { x: 45, y: -20, zoom: 1.2 } }); f.persist(false, true); } }, persistGraphViews: f.persist, cancelConfiguredNode() {}, cancelImportReview() {}, document: { removeEventListener() {} }, receiveAutomaticWorkflow() {}, documentTransition: false, workflowSession: { cancel() {} }, rootRunEpoch: 0, uiEpoch: 0, nativeWireBridge: null, root: { classList: { remove() {} } } });
    controllerFunction('close', f.env)();
    assert.equal(f.env.graphViews, null); assert.equal(f.scheduled.size, 0);
    assert.deepEqual(f.stored.views.views[1].camera, { x: 45, y: -20, zoom: 1.2 });
    assert.equal(f.session.readEditContext().readOnly, true); assert.equal(f.saves(), 1);
});

test('explicit scoped portal presentation snapshots immediately while external saves stay debounced', () => {
    const f = persistenceFixture(); f.persist(true);
    const editor = f.session.readEditor();
    const portalPresentation = { publisher: { identity: editor.view.identity, definitionRef: editor.prepared.definitionRef, source: { nodeId: 'work', portId: 'out' }, label: 'Local label' } };
    assert.equal(f.session.updateView({ portalPresentation }).ok, true); f.persist();
    const saved = f.stored.views.views.find(view => view.identity.kind === 'instance');
    assert.equal(saved.portalPresentation?.publisher?.label, 'Local label'); assert.deepEqual(saved.portalPresentation.publisher.source, { nodeId: 'work', portId: 'out' });
    assert.equal(f.saves(), 1); assert.equal(f.scheduled.size, 1);
    assert.deepEqual(saved.nodePresentation, { other: { alias: 'Child draft', compact: true } });
});
