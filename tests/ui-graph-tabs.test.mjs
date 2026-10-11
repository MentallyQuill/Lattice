import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
import { createGraphViewSession } from '../src/ui/graph-view-session.js';
import { prepareWorkspaceViews, prepareLibraryViews } from '../src/ui/workspace-preparation.js';
import { viewIdentityKey } from '../src/ui/view-state.js';
import { definitionRefKey } from '../src/workflow/definition-data.js';
import { computeDefinitionIdentity } from '../src/workflow/definitions.js';
import { exportWorkflow, exportSubgraph, parseWorkflow, parseSubgraph } from '../src/workflow/packages.js';
import { createLibraryWorkflow, createLibrarySubgraph } from '../src/workflow/library/subgraphs.js';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);

async function component(name, directory, suppliedSource) {
    const source = suppliedSource ?? await readFile(new URL('../ui/' + name + '.svelte', import.meta.url), 'utf8');
    const compiled = compile(source, { filename: name + '.svelte', generate: 'client', css: 'injected' });
    assert.deepEqual(compiled.warnings.filter(warning => warning.code.startsWith('a11y')), [], 'component accessibility compiler warnings');
    const code = compiled.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
    const path = join(directory, name + '.mjs');
    await writeFile(path, code);
    return (await import(pathToFileURL(path).href)).default;
}

const rootIdentity = { kind: 'root', workflowId: 'root' };
const root = { key: 'root', identity: rootIdentity, label: 'Graph 1', readOnly: false, breadcrumbs: [] };
const child = (key, label) => ({ key, identity: { kind: 'instance', workflowId: 'root', instancePath: [key] }, label, readOnly: true, breadcrumbs: [{ key: 'root', identity: rootIdentity, label: 'Graph 1' }, { key, identity: { kind: 'instance', workflowId: 'root', instancePath: [key] }, label }] });
const keydown = (element, key, options = {}) => { element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })); flushSync(); };

async function controllerFunction(name, env) {
    const source = await readFile(new URL('../src/ui/controller.js', import.meta.url), 'utf8');
    let start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, `Actual controller function ${name} is available`);
    if (source.slice(start - 6, start) === 'async ') start -= 6;
    const end = source.indexOf('\n}', start) + 2;
    return Function('env', 'with(env){' + source.slice(start, end) + ';return ' + name + ';}')(env);
}

test('tab exports download the clicked root or exact pinned subgraph revision without changing active view', async () => {
    const graph = accepted(createLibraryWorkflow('scene-compass')).graph;
    graph.id = 'tab-export-root'; graph.name = 'Export workflow';
    const lens = accepted(createLibrarySubgraph('context-lens')).definition;
    const revised = accepted(computeDefinitionIdentity({ ...structuredClone(lens), version: 2, name: 'Other library revision' }));
    const newer = { ...revised.materializedDefinition, semanticHash: revised.semanticHash };
    const snapshots = { ...graph.definitions, [definitionRefKey(newer)]: newer };
    const library = accepted(prepareLibraryViews(graph.id, snapshots));
    const prepared = accepted(prepareWorkspaceViews(graph));
    const workspacePrepared = { ...prepared, preparedViews: [...prepared.preparedViews, ...library.preparedViews], libraryDefinitions: snapshots };
    const session = accepted(createGraphViewSession({ root: graph, activationId: 'tab-exports', ...workspacePrepared, navigation: [...prepared.navigation, ...library.navigation] }));
    const parentId = Object.values(graph.nodes).find(node => node.type === 'subgraph').id;
    accepted(session.openInstance([parentId, 'lens']));
    const instanceKey = session.readEditor().view.key;
    const libraryRef = { id: newer.id, version: newer.version, semanticHash: newer.semanticHash };
    accepted(session.openLibrary(libraryRef)); const libraryKey = session.readEditor().view.key;
    const rootKey = session.project().graphViews.tabs[0].key; accepted(session.focusView(rootKey));
    const blobs = new Map(), downloads = [], revoked = [], later = [];
    const env = { current: graph, graphViews: session, workspacePrepared, viewIdentityKey, definitionRefKey, exportSubgraph, Blob, URL: { createObjectURL(blob) { const url = 'blob:tab-export-' + blobs.size; blobs.set(url, blob); return url; }, revokeObjectURL(url) { revoked.push(url); } }, setTimeout(callback) { later.push(callback); }, exportGraph(value) { assert.equal(value, graph); return JSON.stringify(exportWorkflow(graph)); }, toast(message) { assert.fail(message); }, document: { createElement(name) { const element = document.createElement(name); element.addEventListener('click', event => { event.preventDefault(); downloads.push({ file: element.download, blob: blobs.get(element.href) }); }); return element; } } };
    const exportView = await controllerFunction('onExportGraphView', env);
    env.downloadGraphViewJSON = await controllerFunction('downloadGraphViewJSON', env);
    env.onExportGraph = await controllerFunction('onExportGraph', env);
    exportView(instanceKey); exportView(libraryKey); exportView(rootKey);
    assert.equal(downloads.length, 3);
    const instance = accepted(parseSubgraph(await downloads[0].blob.text()));
    assert.deepEqual([instance.definition.id, instance.definition.version, instance.definition.semanticHash], [lens.id, 1, lens.semanticHash]);
    const inspected = accepted(parseSubgraph(await downloads[1].blob.text()));
    assert.deepEqual([inspected.definition.id, inspected.definition.version, inspected.definition.semanticHash], [newer.id, 2, newer.semanticHash]);
    assert.equal(accepted(parseWorkflow(await downloads[2].blob.text())).id, 'tab-export-root');
    assert.match(downloads[0].file, /\.subgraph\.json$/); assert.match(downloads[2].file, /\.workflow\.json$/);
    assert.equal(session.readEditor().view.key, rootKey);
    exportView('removed-tab'); assert.equal(downloads.length, 3);
    later.forEach(callback => callback()); assert.deepEqual(revoked, ['blob:tab-export-0', 'blob:tab-export-1', 'blob:tab-export-2']);
});

// A context action belongs to the clicked tab even while a different view stays active.
test('right-click closes the clicked inactive tab without activating it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-tab-context-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const session = actualSession();
        accepted(session.openInstance(['parent']));
        accepted(session.openInstance(['sibling']));
        const change = action => { accepted(action()); mounted.refresh(); };
        const Harness = await reactiveSessionComponent('GraphTabs', directory);
        mounted = mount(Harness, { target: host, props: { session, actions: { focusView: key => change(() => session.focusView(key)), closeView: key => change(() => session.closeView(key)) } } }); flushSync();
        const tab = [...host.querySelectorAll('[role="tab"]')].find(element => element.textContent.startsWith('Parent'));
        const activeKey = session.readEditor().view.key;
        const event = new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 35 });
        tab.dispatchEvent(event); flushSync(); await tick();
        assert.equal(event.defaultPrevented, true, 'replace the browser context menu');
        assert.equal(session.readEditor().view.key, activeKey);
        const menu = host.querySelector('[role="menu"]');
        assert.ok(menu, 'tab context actions appear');
        [...menu.querySelectorAll('button')].find(button => button.textContent === 'Close tab').click(); flushSync(); await tick();
        assert.equal(session.readEditor().view.key, activeKey);
        assert.deepEqual(session.project().graphViews.tabs.map(view => view.label), ['Graph 1', 'Sibling']);
        assert.deepEqual(session.project().graphViews.closedViews.map(view => view.label), ['Parent']);
        assert.equal(host.querySelector('[role="menu"]'), null);
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});

test('tab context commands keep their clicked target for exporting renaming and closing others', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-tab-context-actions-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const GraphTabs = await component('GraphTabs', directory);
        const first = child('first', 'First child'), second = child('second', 'Second child'), closed = child('closed', 'Closed child');
        const calls = [];
        mounted = mount(GraphTabs, { target: host, props: { views: { workflowId: 'root', viewEpoch: 1, active: first, tabs: [root, first, second], closedViews: [closed] }, actions: { focusView: key => calls.push(['focus', key]), exportView: key => calls.push(['export', key]), renameView: (key, name) => calls.push(['rename', key, name]), closeView: key => calls.push(['close', key]), closeOtherViews: key => calls.push(['others', key]), reopenView: key => calls.push(['reopen', key]) } } }); flushSync();
        const tabs = [...host.querySelectorAll('[role="tab"]')];
        const command = async (tab, label) => {
            tab.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 20 })); flushSync(); await tick();
            const button = [...host.querySelectorAll('[role="menuitem"]')].find(element => element.textContent === label);
            assert.ok(button, `${label} is offered`); assert.equal(button.disabled, false);
            button.click(); flushSync(); await tick();
        };
        tabs[2].dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); flushSync(); await tick();
        assert.equal([...host.querySelectorAll('[role="menuitem"]')].some(element => element.textContent === 'Save workflow'), false, 'File owns saving the document');
        await command(tabs[2], 'Export subgraph JSON'); assert.deepEqual(calls.at(-1), ['export', 'second']);
        await command(tabs[2], 'Rename subgraph');
        const input = host.querySelector('input[aria-label="Subgraph name"]');
        assert.ok(input, 'Rename edits the clicked tab inline');
        assert.equal(document.activeElement, input);
        assert.equal(input.value.slice(input.selectionStart, input.selectionEnd), 'Second child');
        assert.deepEqual(calls.at(-1), ['export', 'second'], 'opening the editor does not rename yet');
        input.value = 'Renamed second'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        keydown(input, 'Enter'); await tick();
        assert.deepEqual(calls.at(-1), ['rename', 'second', 'Renamed second']);
        assert.equal(host.querySelector('input'), null);
        input.dispatchEvent(new dom.window.FocusEvent('blur'));
        assert.equal(calls.filter(([action]) => action === 'rename').length, 1, 'Enter and blur commit once');
        await command(tabs[2], 'Close other tabs'); assert.deepEqual(calls.at(-1), ['others', 'second']);
        await command(tabs[2], 'Reopen Closed child · Graph 1 / Closed child ("closed")'); assert.deepEqual(calls.at(-1), ['reopen', 'closed']);
        await command(tabs[0], 'Export workflow JSON'); assert.deepEqual(calls.at(-1), ['export', 'root']);
        await command(tabs[0], 'Rename graph');
        const rootInput = host.querySelector('input[aria-label="Graph name"]');
        rootInput.value = 'Renamed root'; rootInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        keydown(rootInput, 'Enter'); await tick();
        assert.deepEqual(calls.at(-1), ['rename', 'root', 'Renamed root']);
        tabs[0].dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); flushSync(); await tick();
        const closeRoot = [...host.querySelectorAll('[role="menuitem"]')].find(element => element.textContent === 'Close tab');
        assert.equal(closeRoot.disabled, true); closeRoot.click(); flushSync();
        assert.equal(calls.some(([action]) => action === 'focus' || action === 'close'), false);
        assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});

test('events from a dismissed rename input cannot commit or cancel a later editor', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-tab-rename-events-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const GraphTabs = await component('GraphTabs', directory), first = child('first', 'First child'), calls = [];
        mounted = mount(GraphTabs, { target: host, props: { views: { workflowId: 'root', viewEpoch: 1, active: root, tabs: [root, first], closedViews: [] }, actions: { renameView: (key, name) => calls.push([key, name]) } } }); flushSync();
        await mounted.startRename('root'); flushSync();
        const oldInput = host.querySelector('input');
        keydown(oldInput, 'Escape'); await tick();
        for (const key of ['first', 'root']) {
            await mounted.startRename(key); flushSync();
            const input = host.querySelector('input');
            input.value = 'Current draft'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
            oldInput.dispatchEvent(new dom.window.FocusEvent('blur')); flushSync();
            assert.deepEqual(calls, [], 'late blur cannot save another rename');
            keydown(oldInput, 'Escape'); await tick();
            assert.equal(host.querySelector('input'), input, 'late Escape cannot dismiss another rename');
            keydown(input, 'Escape'); await tick();
        }
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});

test('tab rename availability follows the containing graph capability and keeps library inspection read only', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-tab-rename-capability-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const GraphTabs = await component('GraphTabs', directory);
        const editableParent = child('allowed', 'Pinned child in root'), pinnedParent = child('blocked', 'Nested pinned child');
        const identity = { kind: 'library', workflowId: 'root', definitionRef: { id: 'library', version: 3, semanticHash: 'exact' } };
        const library = { key: 'library', identity, label: 'Library definition', readOnly: true, breadcrumbs: [] };
        const renamed = [];
        mounted = mount(GraphTabs, { target: host, props: { views: { workflowId: 'root', viewEpoch: 1, active: root, tabs: [root, editableParent, pinnedParent, library], closedViews: [] }, actions: { renameView: (key, name) => renamed.push([key, name]), canRenameView: key => key !== 'blocked' } } }); flushSync();
        const tabs = [...host.querySelectorAll('[role="tab"]')];
        const rename = async index => {
            tabs[index].dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); flushSync(); await tick();
            return [...host.querySelectorAll('[role="menuitem"]')].find(button => button.textContent.startsWith('Rename'));
        };
        assert.equal((await rename(0)).disabled, false);
        const allowed = await rename(1); assert.equal(allowed.disabled, false); allowed.click(); flushSync(); await tick();
        const input = host.querySelector('input'); input.value = 'Renamed child'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        input.dispatchEvent(new dom.window.FocusEvent('blur')); flushSync();
        assert.deepEqual(renamed, [['allowed', 'Renamed child']]);
        const blocked = await rename(2); assert.equal(blocked.disabled, true); assert.match(blocked.title, /local copy.*containing graph/i); blocked.click(); flushSync();
        assert.equal((await rename(3)).disabled, true);
        assert.deepEqual(renamed, [['allowed', 'Renamed child']]);
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});

test('keyboard tab menus restore their trigger and dismiss when the target or workspace changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-tab-context-keyboard-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        await component('GraphTabs', directory);
        const first = child('first', 'First child'), second = child('second', 'Second child');
        const initial = { workflowId: 'root', viewEpoch: 1, active: first, tabs: [root, first, second], closedViews: [] };
        const source = `<script>import GraphTabs from ${JSON.stringify(pathToFileURL(join(directory, 'GraphTabs.mjs')).href)}; let { initial } = $props(); let views = $state(initial); export function update(next) { views = next; }</script><GraphTabs {views} actions={{ exportView() {}, renameView() {}, closeView() {}, closeOtherViews() {} }} />`;
        const Harness = await component('GraphTabKeyboardHarness', directory, source);
        mounted = mount(Harness, { target: host, props: { initial } }); flushSync();
        const tabs = [...host.querySelectorAll('[role="tab"]')];
        const menu = () => host.querySelector('[role="menu"]');
        tabs[2].focus(); keydown(tabs[2], 'F10', { shiftKey: true }); await tick();
        assert.ok(menu(), 'Shift+F10 opens the focused tab menu');
        assert.equal(document.activeElement.textContent, 'Export subgraph JSON');
        keydown(document.activeElement, 'End'); assert.equal(document.activeElement.textContent, 'Close other tabs');
        keydown(document.activeElement, 'Escape'); assert.equal(menu(), null); assert.equal(document.activeElement, tabs[2]);
        keydown(tabs[2], 'ContextMenu'); await tick(); assert.ok(menu());
        tabs[0].dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); flushSync();
        assert.equal(menu(), null, 'clicking another tab dismisses the menu');
        keydown(tabs[2], 'ContextMenu'); await tick();
        window.dispatchEvent(new dom.window.Event('resize')); flushSync(); assert.equal(menu(), null);
        keydown(tabs[2], 'ContextMenu'); await tick();
        mounted.update({ ...initial, tabs: [root, first], viewEpoch: 2 }); flushSync(); await tick();
        assert.equal(menu(), null, 'removing the clicked target dismisses the menu');
        keydown(tabs[1], 'ContextMenu'); await tick();
        mounted.update({ ...initial, active: root, viewEpoch: 3 }); flushSync(); await tick();
        assert.equal(menu(), null, 'active-view transitions dismiss the menu');
        assert.deepEqual([...host.querySelectorAll('[role="tab"]')].map(tab => tab.tabIndex), [0, -1, -1]);
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});

// Exercise the real source component without rebuilding or consuming the Workbench's generated bundle.
test('tabs retain the root default and provide roving focus, sibling close controls and reopen commands', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-tabs-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const GraphTabs = await component('GraphTabs', directory);
        mounted = mount(GraphTabs, { target: host }); flushSync();
        assert.equal(host.querySelector('button.pc-graph-tab'), null);
        await unmount(mounted); mounted = null;
        const selected = child('first', 'First child'), second = child('second', 'Second child'), closed = child('closed', 'Closed child');
        const calls = [];
        mounted = mount(GraphTabs, { target: host, props: { views: { workflowId: 'root', viewEpoch: 1, active: selected, tabs: [root, selected, second], closedViews: [closed] }, panelId: 'canvas-panel', actions: { focusView: key => calls.push(['focus', key]), closeView: key => calls.push(['close', key]), reopenView: key => calls.push(['reopen', key]), closeOtherViews: key => calls.push(['others', key]) } } }); flushSync();
        const tabs = [...host.querySelectorAll('[role="tab"]')];
        assert.equal(tabs.length, 3);
        assert.deepEqual(tabs.map(tab => tab.tabIndex), [-1, 0, -1]);
        assert.equal(tabs[1].getAttribute('aria-controls'), 'canvas-panel');
        tabs[1].focus(); keydown(tabs[1], 'ArrowRight');
        assert.equal(document.activeElement, tabs[2]);
        assert.deepEqual(calls.at(-1), ['focus', 'second']);
        keydown(tabs[2], 'Home');
        assert.equal(document.activeElement, tabs[0]);
        assert.deepEqual(calls.at(-1), ['focus', 'root']);
        keydown(tabs[0], 'End');
        assert.equal(document.activeElement, tabs[2]);
        const close = host.querySelector('button[aria-label^="Close First child"]');
        assert.ok(close);
        assert.equal(close.closest('[role="tab"]'), null, 'close control is a sibling, never a nested button');
        close.click(); flushSync();
        assert.deepEqual(calls.at(-1), ['close', 'first']);
        assert.equal(host.querySelector('button[aria-label^="Close Graph 1"]'), null);
        host.querySelector('button[aria-label="Graph view actions"]').click(); flushSync(); await tick();
        const reopen = [...host.querySelectorAll('button')].find(button => button.textContent.includes('Reopen Closed child'));
        assert.ok(reopen); reopen.click(); flushSync();
        assert.deepEqual(calls.at(-1), ['reopen', 'closed']);
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});

// Root stays visually quiet; children use cached ancestry and library inspection shows the exact revision.
test('breadcrumbs appear only for child/library views and navigate cached identities', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-breadcrumbs-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const GraphBreadcrumbs = await component('GraphBreadcrumbs', directory);
        mounted = mount(GraphBreadcrumbs, { target: host, props: { view: root } }); flushSync();
        assert.equal(host.querySelector('nav'), null);
        await unmount(mounted); mounted = null;
        const view = child('child', 'Child alias'), calls = [];
        mounted = mount(GraphBreadcrumbs, { target: host, props: { view, definitionRef: { id: 'saved-definition', version: 4, semanticHash: 'exact-hash' }, actions: { focusView: key => calls.push(key) } } }); flushSync();
        assert.equal(host.querySelector('nav').getAttribute('aria-label'), 'Graph location');
        assert.equal(host.querySelector('[aria-current="page"]').textContent, 'Child alias');
        assert.ok(host.textContent.includes('v4'));
        assert.ok(host.textContent.includes('Read only'));
        host.querySelector('button').click(); flushSync();
        assert.deepEqual(calls, ['root']);
        await unmount(mounted); mounted = null;
        const identity = { kind: 'library', workflowId: 'root', definitionRef: { id: 'library-definition', version: 9, semanticHash: 'pinned-hash' } };
        mounted = mount(GraphBreadcrumbs, { target: host, props: { view: { key: 'library', identity, label: 'Library alias', readOnly: true, breadcrumbs: [{ key: 'root', identity: rootIdentity, label: 'Graph 1' }, { key: 'library', identity, label: 'Library alias' }] } } }); flushSync();
        assert.ok(host.textContent.includes('Library inspection'));
        assert.ok(host.textContent.includes('v9'));
        assert.ok(host.querySelector('[title]').getAttribute('title').includes('pinned-hash'));
        assert.equal([...host.querySelectorAll('button')].some(button => /Run|Apply/.test(button.textContent)), false);
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});

// A parent can switch active views while a menu is open; the old popover cannot retain keyboard ownership.
test('active-view updates close overflow and Escape returns focus to its trigger', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-tab-transition-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        await component('GraphTabs', directory);
        const first = child('first', 'First child'), second = child('second', 'Second child');
        const initial = { workflowId: 'root', viewEpoch: 1, active: first, tabs: [root, first, second], closedViews: [] };
        const source = `<script>import GraphTabs from ${JSON.stringify(pathToFileURL(join(directory, 'GraphTabs.mjs')).href)}; let { initial } = $props(); let views = $state(initial); export function update(next) { views = next; }</script><GraphTabs {views} actions={{focusView() {}}} />`;
        const Harness = await component('GraphTabHarness', directory, source);
        mounted = mount(Harness, { target: host, props: { initial } }); flushSync();
        const trigger = host.querySelector('button[aria-label="Graph view actions"]');
        trigger.click(); flushSync(); await tick();
        assert.ok(host.querySelector('[role="menu"]'));
        mounted.update({ ...initial, active: second, viewEpoch: 2 }); flushSync(); await tick();
        assert.equal(host.querySelector('[role="menu"]'), null);
        assert.deepEqual([...host.querySelectorAll('[role="tab"]')].map(tab => tab.tabIndex), [-1, -1, 0]);
        trigger.click(); flushSync(); await tick();
        const menu = host.querySelector('[role="menu"]');
        keydown(menu.querySelector('button'), 'End');
        assert.equal(document.activeElement, [...menu.querySelectorAll('button:not(:disabled)')].at(-1));
        keydown(document.activeElement, 'Escape');
        assert.equal(host.querySelector('[role="menu"]'), null);
        assert.equal(document.activeElement, trigger);
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});
const accepted = result => { assert.equal(result.ok, true, JSON.stringify(result.error)); return result.data; };
function actualSession() {
    const root = { id: 'actual/root', nodes: {}, wires: {} };
    const rootIdentity = { kind: 'root', workflowId: root.id };
    const instance = path => ({ kind: 'instance', workflowId: root.id, instancePath: path });
    const navigation = [
        { identity: instance(['parent']), label: 'Parent', readOnly: true },
        { identity: instance(['parent', 'child']), label: 'Nested child', readOnly: true },
        { identity: instance(['sibling']), label: 'Sibling', readOnly: true },
    ];
    const preparedViews = [rootIdentity, ...navigation.map(entry => entry.identity)].map(identity => ({
        identity, ...(identity.kind === 'root' ? {} : { definitionRef: { id: 'saved-definition', version: 1, semanticHash: 'exact-hash' } }),
        savedGraph: { nodes: {}, wires: {} }, effectiveNodes: {}, interface: [], ports: [],
    }));
    return accepted(createGraphViewSession({ root, activationId: 'actual-activation', navigation, preparedViews }));
}
async function reactiveSessionComponent(name, directory) {
    await component(name, directory);
    const source = `<script>import View from ${JSON.stringify(pathToFileURL(join(directory, name + '.mjs')).href)}; let { session, actions } = $props(); let projection = $state.raw(session.project()); export function refresh() { projection = session.project(); } export function setActions(next) { actions = next; }</script><View ${name === 'GraphTabs' ? 'views={projection.graphViews}' : 'view={projection.graphViews.active}'} {actions} />`;
    return component(name + 'SessionHarness', directory, source);
}

// The real store focuses only open views; breadcrumbs must open or reopen a containing instance.
test('nested breadcrumbs open unopened and closed ancestors through the reactive session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-breadcrumb-session-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const session = actualSession();
        accepted(session.openInstance(['parent', 'child']));
        assert.deepEqual(session.project().graphViews.tabs.map(view => view.label), ['Graph 1', 'Nested child']);
        const results = [];
        const change = action => { const result = action(); results.push(result); mounted.refresh(); };
        const actions = { focusView: key => change(() => session.focusView(key)), openInstance: path => change(() => session.openInstance(path)) };
        const Harness = await reactiveSessionComponent('GraphBreadcrumbs', directory);
        mounted = mount(Harness, { target: host, props: { session, actions } }); flushSync();
        const parentButton = () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Parent');
        parentButton().click(); flushSync(); await tick();
        assert.deepEqual(session.readEditor().view.identity.instancePath, ['parent']);
        assert.equal(results.at(-1).ok, true);
        assert.equal(host.querySelector('[aria-current="page"]').textContent, 'Parent');
        accepted(session.updateView({ camera: { x: 42, y: -10, zoom: 1.4 } }));
        accepted(session.openInstance(['parent', 'child']));
        const parentIdentity = { kind: 'instance', workflowId: 'actual/root', instancePath: ['parent'] };
        accepted(session.closeView(parentIdentity)); mounted.refresh(); flushSync();
        assert.equal(session.project().graphViews.closedViews.some(view => view.label === 'Parent'), true);
        parentButton().click(); flushSync(); await tick();
        assert.deepEqual(session.readEditor().view.identity.instancePath, ['parent']);
        assert.deepEqual(session.readEditor().view.camera, { x: 42, y: -10, zoom: 1.4 });
        assert.equal(session.project().graphViews.closedViews.some(view => view.label === 'Parent'), false);
        host.querySelector('button').click(); flushSync(); await tick();
        assert.equal(session.readEditor().view.identity.kind, 'root', 'Graph 1 breadcrumb keeps its existing focus action');
        assert.equal(host.querySelector('nav'), null);
        accepted(session.openInstance(['parent', 'child'])); mounted.refresh();
        mounted.setActions({ focusView: actions.focusView }); flushSync();
        assert.equal(parentButton().disabled, true, 'an instance ancestor requires openInstance');
        assert.equal([...host.querySelectorAll('button')].find(button => button.textContent === 'Graph 1').disabled, false);
        mounted.setActions({ openInstance: actions.openInstance }); flushSync();
        assert.equal(parentButton().disabled, false);
        assert.equal([...host.querySelectorAll('button')].find(button => button.textContent === 'Graph 1').disabled, true, 'the root requires focusView');
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});

// After the real reducer closes an active child, selection, tab stop and DOM focus must agree on Graph 1.
test('closing the active tab follows the reactive session surviving active view', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-graph-tab-close-session-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const session = actualSession();
        accepted(session.openInstance(['parent']));
        accepted(session.openInstance(['sibling']));
        const results = [];
        const change = action => { const result = action(); results.push(result); mounted.refresh(); };
        const actions = { focusView: key => change(() => session.focusView(key)), closeView: key => change(() => session.closeView(key)) };
        const Harness = await reactiveSessionComponent('GraphTabs', directory);
        mounted = mount(Harness, { target: host, props: { session, actions } }); flushSync();
        const tab = label => [...host.querySelectorAll('[role="tab"]')].find(element => element.querySelector('span').textContent === label);
        const assertRootFocus = () => {
            assert.equal(session.readEditor().view.identity.kind, 'root');
            assert.deepEqual([...host.querySelectorAll('[role="tab"]')].map(element => [element.querySelector('span').textContent, element.getAttribute('aria-selected'), element.tabIndex]), [['Graph 1', 'true', 0], ['Parent', 'false', -1]]);
            assert.equal(document.activeElement, tab('Graph 1'));
        };
        assert.equal(tab('Sibling').getAttribute('aria-selected'), 'true');
        const close = host.querySelector('button[aria-label^="Close Sibling"]');
        close.focus(); close.click(); flushSync(); await tick(); flushSync();
        assertRootFocus();
        assert.equal(results.at(-1).ok, true);
        assert.equal(host.querySelector('button[aria-label^="Close Sibling"]'), null);
        accepted(session.openInstance(['sibling'])); mounted.refresh(); flushSync();
        tab('Sibling').focus(); keydown(tab('Sibling'), 'Delete'); await tick(); flushSync();
        assertRootFocus();
        const closedCount = session.project().graphViews.closedViews.length;
        keydown(tab('Graph 1'), 'Delete'); await tick(); flushSync();
        assertRootFocus();
        assert.equal(session.project().graphViews.closedViews.length, closedCount, 'Graph 1 remains permanent');
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});
