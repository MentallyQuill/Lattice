import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorkflowDocumentController } from '../src/ui/document-controller.js';
import { createWorkflowDocumentSession } from '../src/ui/document-session.js';
import { installWorkflowExample } from '../src/workflow/examples.js';
import { diagnosticText, presentDiagnostic } from '../src/ui/diagnostics.js?v=0.27.1';
const graph = id => ({ id, name: id, schema: 3, runtime: 2, mode: 'native-unified', nodes: {}, wires: {}, groups: {}, roles: {}, portals: {}, definitions: {} });
async function controllerFunction(name, env) {
    const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8'); let start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, `Actual controller function ${name} is available`); if (source.slice(start - 6, start) === 'async ') start -= 6;
    const end = source.indexOf('\n}', start) + 2; return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}
function fixture() {
    const session = createWorkflowDocumentSession(), original = graph('original'), notices = [], companions = [], activations = [], prompts = [];
    session.activate(original, { clean: true, source: { kind: 'native', name: 'original.json' } });
    const env = { session, files: { native: true, recents: () => ({ ok: true, data: [] }) }, examples: installWorkflowExample, recovery: () => [], create: () => graph('new'), views: () => null,
        prompt: async () => { prompts.push(true); return 'discard'; }, activate(value, options) { activations.push(value); session.activate(value, options); }, retainCompanions: value => companions.push(...value), report: (message, type) => notices.push({ message, type }), changed() {},
    }; return { session, original, notices, companions, activations, prompts, env, controller: createWorkflowDocumentController(env) };
}
test('catalog failure leaves the workspace available and a retry restores its tiles', async () => {
    const updates = [], notices = [], tiles = [{ id: 'lesson-01', title: '1. Follow a reply from Send to Review' }]; let fail = true;
    const env = { projectWorkflowExamples() { if (fail) throw new Error('Broken catalog: private example contents'); return tiles; }, workbench: { update: value => updates.push(value) }, diagnosticText, presentDiagnostic, safe: fn => fn(),
        globalThis: { toastr: { error: message => notices.push({ message, type: 'error' }) } } };
    env.toast = await controllerFunction('toast', env);
    const refresh = await controllerFunction('refreshExampleCatalog', env); assert.equal(refresh(), false);
    assert.match(updates.at(-1).examplesIssue, /Lattice could not complete this action/); assert.doesNotMatch(updates.at(-1).examplesIssue, /Broken catalog|private example contents/);
    assert.equal(notices.at(-1).type, 'error'); assert.match(notices.at(-1).message, /Lattice could not complete this action/); assert.doesNotMatch(notices.at(-1).message, /Broken catalog|private example contents/);
    fail = false; assert.equal(refresh(), true); assert.deepEqual(updates.at(-1), { examples: tiles, examplesIssue: '' });
});
test('bundled example opens a detached unsaved document and keeps native recents separate', async () => {
    const f = fixture(), before = structuredClone(f.original); assert.equal((await f.controller.example('lesson-01')).ok, true);
    assert.notEqual(f.session.current().id, f.original.id); assert.equal(f.session.current().name, '1. Follow a reply from Send to Review'); assert.equal(f.session.source(), null); assert.equal(f.session.dirty(), true); assert.deepEqual(f.original, before);
    assert.equal(Object.values(f.session.current().nodes).filter(node => node.type === 'workflow').length, 3); assert.deepEqual(f.controller.view().recents, []); assert.deepEqual(f.companions, []);
});
test('unavailable and throwing example loads preserve drafts without opening the discard guard', async () => {
    for (const load of [installWorkflowExample, () => { throw new Error('Broken example'); }]) {
        const f = fixture(), source = f.session.source(); f.original.description = 'Keep edits'; f.env.examples = load;
        assert.equal((await f.controller.example('missing-example')).ok, false); assert.equal(f.session.current(), f.original); assert.equal(f.session.source(), source); assert.equal(f.session.dirty(), true);
        assert.deepEqual(f.activations, []); assert.deepEqual(f.companions, []); assert.deepEqual(f.prompts, []); assert.equal(f.notices.at(-1).type, 'error');
    }
});
test('example companions are retained only after the replacement guard accepts the primary document', async () => {
    const f = fixture(); f.env.examples = () => ({ ok: true, data: { graph: graph('example'), companions: [graph('helper')] } }); f.original.description = 'Dirty'; f.env.prompt = async () => { f.prompts.push(true); return 'cancel'; };
    assert.equal((await f.controller.example('lesson-13')).ok, false); assert.equal(f.session.current(), f.original); assert.deepEqual(f.companions, []);
    f.env.prompt = async () => { f.prompts.push(true); return 'discard'; }; assert.equal((await f.controller.example('lesson-13')).ok, true); assert.equal(f.companions.length, 1);
    assert.notEqual(f.companions[0].id, f.session.current().id); assert.equal(f.session.source(), null); assert.equal(f.session.dirty(), true); assert.deepEqual(f.controller.view().recents, []); assert.equal(f.prompts.length, 2);
});
test('stale example results cannot install their primary document or retain companions', async () => {
    const f = fixture(); let finish; f.env.examples = () => new Promise(resolve => { finish = resolve; }); const pending = f.controller.example('lesson-13'), other = graph('other');
    f.session.activate(other, { clean: true }); finish(installWorkflowExample('lesson-13')); await pending;
    assert.equal(f.session.current(), other); assert.deepEqual(f.activations, []); assert.deepEqual(f.companions, []);
});
test('example fitting remains attached to the opened root when a child tab is entered before layout settles', async () => {
    for (const enterChild of [false, true]) {
        const f = fixture(), frames = []; let fitted = 0, kind = 'root';
        const env = { current: f.original, uiEpoch: 1, ensureDocumentCommands: () => f.controller, requestAnimationFrame: callback => frames.push(callback), stillEditing: (value, epoch) => env.current === value && env.uiEpoch === epoch, graphViews: { readEditor: () => ({ view: { identity: { kind } } }) }, canvas: { fit() { fitted++; } } };
        f.env.activate = (value, options) => { f.session.activate(value, options); env.current = value; env.uiEpoch++; };
        assert.equal(await (await controllerFunction('onOpenExample', env))('lesson-01'), true); if (enterChild) kind = 'instance'; while (frames.length) frames.shift()(); assert.equal(fitted, enterChild ? 0 : 1);
    }
});
