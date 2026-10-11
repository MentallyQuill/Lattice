import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
import { installMock } from './mock.js';
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
installMock({ settings: { graphs: {} } });
const version = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8')).version;
const { starterGraph } = await import(`../src/workflow/starters.js?v=${version}`);
const { cloneWorkflowDocument } = await import(`../src/workflow/document.js?v=${version}`);
const { prepareWorkspaceViews } = await import(`../src/ui/workspace-preparation.js?v=${version}`);
const { prepareWorkflowProjection, projectPreparedWorkflow, createWorkflowSession } = await import(`../src/ui/workflow-surface.js?v=${version}`);
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);
const directory = await mkdtemp(join(tmpdir(), 'lattice-workspace-menu-root-'));
after(async () => {
    const target = resolve(directory), rel = relative(resolve(tmpdir()), target);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel)); await rm(target, { recursive: true, force: true });
});
async function compiled(name, source) {
    const output = compile(source, { filename: name + '.svelte', generate: 'client', css: 'injected' });
    assert.deepEqual(output.warnings.filter(warning => warning.code.startsWith('a11y')), []);
    const code = output.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
    const path = join(directory, name + '.mjs'); await writeFile(path, code);
    return { path, component: (await import(pathToFileURL(path).href)).default };
}
const leaf = await compiled('WorkspaceMenus', await readFile(new URL('../ui/WorkspaceMenus.svelte', import.meta.url), 'utf8'));
const harness = await compiled('WorkspaceMenuHarness', `<script>import Menus from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions } = $props(); let state = $state.raw(initial); export function update(next) { state = next; }</script><Menus {state} {actions} local={() => {}} />`);
const settle = async () => { flushSync(); await tick(); flushSync(); };
const click = async element => { assert.ok(element); element.click(); await settle(); };
let sequence = 0;
const guidance = () => { const root = cloneWorkflowDocument(starterGraph('native-guidance')).data; root.id = 'menu-root-' + ++sequence; return root; };
function prepare(root, validBindings = true) {
    let bindings = 0;
    const result = prepareWorkspaceViews(root, { resolveBinding: () => { bindings++; return validBindings ? { ok: true, data: { profileId: 'cached', model: 'cached-model' } } : { ok: false, error: { message: 'The current root needs its model connection.' } }; } });
    assert.equal(result.ok, true, JSON.stringify(result));
    return { token: result.data.workflow, bindingCount: () => bindings };
}
const state = (workflow, rootWorkflow) => ({ workflow, ...(rootWorkflow === undefined ? {} : { rootWorkflow }), nativeGraph: workflow.native, history: { undo: false, redo: false }, selectionCount: 0, selectionActions: { copy: false, cut: false, delete: false } });
async function fixture(initial, command = () => {}) {
    const host = document.createElement('div'); document.body.append(host);
    const mounted = mount(harness.component, { target: host, props: { initial, actions: { command } } }); await settle();
    const menu = () => host.querySelector('[role="menu"][aria-label="Graph"]');
    const item = label => [...menu().querySelectorAll('[role="menuitem"]')].find(element => element.textContent.trim() === label);
    return { host, item, async open() { if (!menu()) await click(host.querySelector('[data-menu="Graph"]')); }, async update(next) { mounted.update(next); await settle(); }, async close() { await unmount(mounted); host.remove(); } };
}
test('a deleted genuine pinned output cannot disable the valid current root Run menu', async () => {
    const root = guidance(); root.nodes.scratch = { id: 'scratch', type: 'workflow', operation: 'compose', outputKind: 'text', sections: [{ name: 'note', text: 'Temporary preview' }] };
    const initial = prepare(root), pinned = projectPreparedWorkflow(initial.token).targets.find(target => target.nodeId === 'scratch'); assert.ok(pinned);
    const calls = [], f = await fixture(state(projectPreparedWorkflow(initial.token, { selectedTarget: pinned, pinnedPreview: pinned }), projectPreparedWorkflow(initial.token)), command => calls.push(command));
    try {
        await f.open(); assert.equal(f.item('Run workflow').disabled, false);
        delete root.nodes.scratch;
        const current = prepare(root), rootView = projectPreparedWorkflow(current.token), targetView = projectPreparedWorkflow(current.token, { selectedTarget: pinned, pinnedPreview: pinned });
        assert.equal(rootView.issues.length, 0); assert.ok(targetView.issues.length); const count = current.bindingCount();
        await f.update(state(targetView, rootView));
        assert.equal(f.item('Run workflow').disabled, false, 'Run belongs to the valid root, not the removed pinned output');
        await click(f.item('Run workflow')); assert.deepEqual(calls, ['run-workflow']); assert.equal(current.bindingCount(), count);
    } finally { await f.close(); }
});
test('a valid deterministic target cannot enable Run for the current unbound root', async () => {
    const root = guidance(), prepared = prepare(root, false), rootView = projectPreparedWorkflow(prepared.token);
    const sceneId = Object.values(root.nodes).find(node => node.operation === 'scene-context').id;
    const target = rootView.targets.find(target => target.nodeId === sceneId); assert.ok(target);
    const targetView = projectPreparedWorkflow(prepared.token, { selectedTarget: target, pinnedPreview: target });
    assert.ok(rootView.issues.length); assert.equal(targetView.issues.length, 0); const count = prepared.bindingCount(), calls = [];
    const f = await fixture(state(targetView, rootView), command => calls.push(command));
    try {
        await f.open(); assert.equal(f.item('Run workflow').disabled, true, 'the actual current root binding issue must govern Run');
        await click(f.item('Run workflow')); assert.deepEqual(calls, []); assert.equal(prepared.bindingCount(), count);
        assert.equal(f.item('Stop workflow').disabled, true);
    } finally { await f.close(); }
});
test('an actual busy root session governs Stop while the selected projection is idle', async () => {
    const root = guidance(), prepared = prepare(root), idle = projectPreparedWorkflow(prepared.token);
    let release, sessionState, cancelled = 0, runs = 0;
    const session = createWorkflowSession({ rootCurrent: () => root, runEpoch: () => 1, active: () => true, changed: next => { sessionState = next; }, runtime: () => ({ runPre: async actual => { assert.equal(actual, root); runs++; return new Promise(resolve => { release = resolve; }); }, cancel: () => { cancelled++; } }) });
    const running = session.run(); assert.equal(sessionState.busy, true);
    const current = projectPreparedWorkflow(prepared.token, sessionState), calls = [];
    const f = await fixture(state(idle, current), command => { calls.push(command); if (command === 'stop-workflow') session.cancel(); });
    try {
        await f.open(); assert.equal(f.item('Run workflow').disabled, true); assert.equal(f.item('Stop workflow').disabled, false);
        await click(f.item('Stop workflow')); assert.deepEqual(calls, ['stop-workflow']); assert.equal(cancelled, 1); assert.equal(runs, 1);
        await f.update(state(idle, projectPreparedWorkflow(prepared.token, sessionState))); await f.open();
        assert.equal(f.item('Stop workflow').disabled, true); assert.equal(f.item('Run workflow').disabled, false);
    } finally { release({ ok: false, error: { message: 'Run cancelled.' } }); await running; await f.close(); }
});
test('a missing current workflow keeps root Run disabled', async () => {
    const f = await fixture({ history: {undo:false,redo:false}, selectionCount:0, selectionActions:{} });
    try { await f.open(); assert.equal(f.item('Run workflow').disabled, true); assert.equal(f.item('Stop workflow').disabled, true); } finally { await f.close(); }
});

test('legacy documents retain Run in Graph without collection or assignment commands', async () => {
    const root = guidance(), prepared = prepare(root), calls = [];
    const f = await fixture(state(projectPreparedWorkflow(prepared.token)), command => calls.push(command));
    try {
        await f.open();
        assert.equal(f.host.querySelector('[data-menu="Workflows"]'), null);
        assert.equal(f.item('Duplicate workflow'), undefined); assert.equal(f.item('Delete workflow'), undefined);
        await click(f.item('Run workflow')); assert.deepEqual(calls, ['run-workflow']);
        await f.update(state({ ...projectPreparedWorkflow(prepared.token), phase: 'post' }));
        await f.open();
        assert.equal(f.item('Run workflow').disabled, false);
        assert.doesNotMatch(f.host.textContent, /Assign|Unassigned/);
    } finally { await f.close(); }
});
