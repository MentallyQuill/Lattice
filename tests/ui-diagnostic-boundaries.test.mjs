import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { presentDiagnostic, diagnosticText } from '../src/ui/diagnostics.js?v=0.27.2';
import { createWorkflowDocumentController } from '../src/ui/document-controller.js?v=0.27.2';
import { createWorkflowDocumentSession } from '../src/ui/document-session.js?v=0.27.2';
import { JSDOM } from 'jsdom';
import { showContextMenu } from '../src/ui/context-menu.js?v=0.27.2';
import { createNativeWireBridge } from '../src/ui/native-wire-bridge.js?v=0.27.2';
import { prepareNativeSearchCatalog } from '../src/ui/native-search-catalog.js?v=0.27.2';

const controllerSource = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
const runSource = await readFile(new URL('../src/run.js', import.meta.url), 'utf8');
function actual(source, name, env) {
    const start = source.indexOf('function ' + name + '('), end = source.indexOf('\n}', start) + 2;
    assert.ok(start >= 0);
    return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
function toastFixture() {
    const notices = [], original = globalThis.toastr;
    globalThis.toastr = Object.fromEntries(['info', 'warning', 'error', 'success'].map(type => [type, (message, title) => notices.push({ type, message, title })]));
    return { notices, restore: () => { globalThis.toastr = original; },
        toast: actual(controllerSource, 'toast', { safe: fn => fn(), presentDiagnostic, diagnosticText }) };
}
test('toast hides unknown exception text and uses diagnostic error severity', () => {
    const f = toastFixture();
    try {
        f.toast(new Error('Authorization: Bearer private-source-secret'), 'error');
        assert.equal(f.notices[0].type, 'error');
        assert.equal(typeof f.notices[0].message, 'string');
        assert.doesNotMatch(f.notices[0].message, /private-source-secret|Bearer/);
    } finally { f.restore(); }
});
test('toast preserves success notices and routes degraded outcomes as warnings', () => {
    const f = toastFixture();
    try {
        f.toast('Added to Subgraphs.', 'success');
        f.toast({ code: 'RECENT_STORAGE_FAILED', message: 'Recent workflow files could not be persisted in this browser.' }, 'warning');
        assert.equal(f.notices[0].type, 'success');
        assert.equal(f.notices[0].message, 'Added to Subgraphs.');
        assert.equal(f.notices[1].type, 'warning');
    } finally { f.restore(); }
});
test('native workflow failures are errors and do not expose unknown host exceptions', () => {
    const f = toastFixture(); let options;
    const env = { controller: null, createNativeWorkflowController: value => { options = value; return { subscribeRecall() {} }; },
        onWorkflowActivated() {}, getStoryDocumentCatalog() {}, getNativePersistenceVerifier() {}, bindingStatus() {},
        documentSession: {}, ctx() {}, currentUser() {}, transportUserId() {}, settings() {}, activeWorkflow() {},
        safe: fn => fn(), presentDiagnostic, diagnosticText };
    try {
        actual(runSource, 'getNativeWorkflowController', env)();
        options.onResult({ ok: false, error: { code: 'UNKNOWN_HOST_ERROR', message: 'private prompt text' } });
        assert.equal(f.notices[0].type, 'error');
        assert.doesNotMatch(f.notices[0].message, /private prompt text/);
        options.onResult({ ok: false, error: { code: 'CANCELLED', message: 'Stopped by the user.' } });
        assert.equal(f.notices[1].type, 'info');
        options.onResult({ ok: false, error: { code: 'PERSISTENCE_PARTIAL', message: 'Some targets failed.' } });
        assert.equal(f.notices[2].type, 'warning');
    } finally { f.restore(); }
});
test('document save catches do not put browser exception text in status or reports', async () => {
    const session = createWorkflowDocumentSession(), notices = [];
    session.activate({ id: 'one', name: 'one', schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, groups: {}, portals: {}, definitions: {}, roles: {} }, { clean: true });
    const controller = createWorkflowDocumentController({ session, files: { native: true, save: async () => { throw new Error('private draft contents'); }, recents: () => [] }, report: message => notices.push(message), recovery: () => [] });
    const result = await controller.save();
    assert.equal(result.ok, false);
    assert.doesNotMatch(notices[0], /private draft contents/);
    assert.doesNotMatch(controller.view().status, /private draft contents/);
    assert.equal(session.current().id, 'one');
});
test('disabled context menu reasons are readable without hover and associated with the action', () => {
    const dom = new JSDOM('<main></main>'), root = dom.window.document.querySelector('main');
    const dismiss = showContextMenu({ root, x: 0, y: 0, items: [{ id: 'run', label: 'Run to here', disabled: true, hint: 'This step starts when you send a message.' }] });
    const button = root.querySelector('button'), reason = dom.window.document.getElementById(button.getAttribute('aria-describedby'));
    assert.ok(reason, 'disabled explanation is associated text');
    assert.match(reason.textContent, /send a message/);
    assert.equal(reason.hidden, false);
    dismiss(); dom.window.close();
});
test('preview diagnostic reveal selects only an existing node in the active document', () => {
    const selections = [], navigation = [];
    const editor = { view: { identity: { kind: 'root', workflowId: 'one' }, key: 'root' } };
    const env = { current: { id: 'one' }, isOpen: () => true, activeEditRoot() { return this.current; },
        graphViews: { readEditor: () => editor, project: () => ({ graphViews: { tabs: [{ key: 'root', identity: editor.view.identity }] } }) },
        workspacePrepared: { preparedViews: [{ identity: editor.view.identity, drawBase: { nodes: { node: { id: 'node' } } } }] },
        editorDraw: { nodes: { node: { id: 'node' } } }, navigateGraphView: (...args) => navigation.push(args),
        canvas: { select: value => selections.push(value), fitSelection() {} } };
    const reveal = actual(controllerSource, 'revealDiagnosticNode', env);
    assert.equal(reveal({ workflowId: 'other', instancePath: [], nodeId: 'node' }), false);
    assert.equal(reveal({ workflowId: 'one', instancePath: [], nodeId: 'removed' }), false);
    assert.equal(navigation.length, 0);
    assert.equal(reveal({ workflowId: 'one', instancePath: [], nodeId: 'node' }), true);
    assert.deepEqual(selections, [{ kind: 'node', id: 'node' }]);
});
test('wire gesture feedback hides unknown adapter error text', () => {
    const catalog = prepareNativeSearchCatalog({ schema: 3, runtime: 2, mode: 'native-unified', workflowId: 'one', viewPath: [], inDefinition: false }).data;
    const bridge = createNativeWireBridge({ catalog, adapter: { capture: () => ({ ok: false, error: { code: 'ADAPTER_FAILURE', message: 'private connection token' } }) } });
    bridge.openUnconnectedSearch({ graphPoint: { x: 2, y: 3 }, screenAnchor: { x: 4, y: 5 } });
    assert.doesNotMatch(bridge.project().feedback, /private connection token/);
    assert.ok(bridge.project().feedback);
});
