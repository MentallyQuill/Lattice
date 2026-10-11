import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compiled as compileComponent } from './helpers/svelte-compile.mjs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync } = await import(clientURL);

async function fixture(initial, actions = {}, collapse) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-preview-tabs-'));
    const host = document.createElement('div'); host.style.fontFamily = 'system-ui'; document.body.append(host);
    let mounted;
    async function compiled(name, source) {
        return compileComponent(name, directory, source);
    }
    async function close() {
        if (mounted) await unmount(mounted);
        host.remove();
        const target = resolve(directory), rel = relative(resolve(tmpdir()), target);
        assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
        await rm(target, { recursive: true, force: true });
    }
    try {
        const leaf = await compiled('OutputPreview', await readFile(new URL('../ui/OutputPreview.svelte', import.meta.url), 'utf8'));
        const harness = await compiled('PreviewHarness', `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions, collapse } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf {view} {actions} {collapse} />`);
        mounted = mount(harness.component, { target: host, props: { initial, actions, collapse } }); flushSync();
        return { host, update(next) { mounted.update(next); flushSync(); }, close };
    } catch (error) { await close(); throw error; }
}
const target = { workflowId: 'root', instancePath: ['nested/one'], nodeId: 'fields', portId: 'out' };
const section = (id, label, text, extra = {}) => ({ id, label, kind: 'data', text, format: 'structured-text', truncated: false, readable: { kind: 'json', text, truncated: false }, ...extra });
const preview = extra => ({
    sourceKey: 'record-one', title: 'Output preview', status: 'current',
    source: { format: 'structured-text', text: '{"kind":"data","value":{"direction":"north"}}', truncated: false, policy: 'safe-recording' },
    choices: [{ key: 'fields/out', label: 'Scene Fields · Output', kind: 'data', target }],
    selectedKey: 'fields/out', pinned: false, followSelection: true,
    sections: [section('out', 'Output', '{"direction":"north"}'), section('in', 'Input', '{"direction":"north","unused":true}')],
    issues: [], busy: false, runHere: { enabled: true, callBound: 0 }, review: null, ...extra,
});
const tabs = host => [...host.querySelectorAll('[role="tab"]')];
const panel = host => host.querySelector('[role="tabpanel"]');

test('artifact tabs expose only supplied sections and switch the visible recorded artifact without dispatching actions', async () => {
    const calls = [];
    const f = await fixture(preview(), { select: (...args) => calls.push(args), runHere: (...args) => calls.push(args) });
    try {
        assert.equal(f.host.querySelectorAll('[role="tablist"]').length, 1, 'recorded artifacts need a tab strip');
        assert.deepEqual(tabs(f.host).map(tab => tab.textContent), ['Output', 'Input']);
        assert.equal(tabs(f.host)[0].getAttribute('aria-selected'), 'true');
        assert.equal(tabs(f.host)[0].tabIndex, 0);
        assert.equal(tabs(f.host)[1].tabIndex, -1);
        assert.equal(panel(f.host).textContent.includes('{"direction":"north"}'), true);
        assert.equal(f.host.querySelectorAll('[data-artifact-kind]').length, 1, 'inactive artifact text is not hidden in the DOM');
        tabs(f.host)[1].click(); flushSync();
        assert.equal(tabs(f.host)[1].getAttribute('aria-selected'), 'true');
        assert.equal(panel(f.host).querySelector('pre').textContent, '{"direction":"north","unused":true}');
        assert.equal(panel(f.host).id, tabs(f.host)[1].getAttribute('aria-controls'));
        assert.equal(panel(f.host).getAttribute('aria-labelledby'), tabs(f.host)[1].id);
        assert.deepEqual(calls, []);
    } finally { await f.close(); }
});

test('tab selection resets with source or output identity and reconciles removed sections without resurrecting them', async () => {
    const f = await fixture(preview());
    const chooseInput = () => { tabs(f.host).find(tab => tab.textContent === 'Input').click(); flushSync(); };
    const selectedLabel = () => tabs(f.host).find(tab => tab.getAttribute('aria-selected') === 'true')?.textContent;
    try {
        chooseInput();
        f.update(preview({ sourceKey: 'record-two' }));
        assert.equal(selectedLabel(), 'Output', 'same section IDs on a new recording must reset');
        chooseInput();
        f.update(preview({ sourceKey: 'record-two', selectedKey: 'other-output' }));
        assert.equal(selectedLabel(), 'Output', 'output identity is part of the tab scope');
        chooseInput();
        f.update(preview({ sourceKey: 'record-two', selectedKey: 'other-output', sections: [section('out', 'Output', 'replacement')] }));
        assert.equal(selectedLabel(), 'Output');
        f.update(preview({ sourceKey: 'record-two', selectedKey: 'other-output' }));
        assert.equal(selectedLabel(), 'Output', 'reinserted sections must not resurrect a removed tab selection');
        f.update(preview({ sections: [] }));
        assert.equal(f.host.querySelector('[role="tablist"]'), null);
        assert.equal(panel(f.host), null);
        assert.match(f.host.textContent, /No output was kept/);
    } finally { await f.close(); }
});

test('tabs support roving keyboard selection and isolate navigation and Delete from canvas shortcuts', async () => {
    const f = await fixture(preview({ sections: [...preview().sections, section('third', 'Diagnostics', 'last artifact')] }));
    const leaked = [];
    f.host.addEventListener('keydown', event => leaked.push(event.key));
    const key = value => { document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); flushSync(); };
    const focusedLabel = () => document.activeElement.textContent;
    try {
        tabs(f.host)[0].focus(); key('ArrowRight');
        assert.equal(focusedLabel(), 'Input', 'ArrowRight must focus and activate the next artifact');
        assert.equal(panel(f.host).querySelector('pre').textContent, '{"direction":"north","unused":true}');
        key('End'); assert.equal(focusedLabel(), 'Diagnostics');
        key('ArrowRight'); assert.equal(focusedLabel(), 'Output');
        key('ArrowLeft'); assert.equal(focusedLabel(), 'Diagnostics');
        key('Home'); assert.equal(focusedLabel(), 'Output');
        key('Delete'); key('Backspace'); key('ArrowDown');
        assert.deepEqual(leaked, [], 'artifact keyboard events must not reach canvas handlers');
        assert.deepEqual(tabs(f.host).map(tab => tab.tabIndex), [0, -1, -1]);
    } finally { await f.close(); }
});

test('preview chrome keeps the actual output choice and bounded actions around a flexible scrolling artifact body', async () => {
    let collapsed = 0;
    const f = await fixture(preview(), { select() {}, pin() {}, follow() {}, runHere() {} }, () => collapsed++);
    try {
        const leaf = f.host.querySelector('.pc-output-preview'), header = leaf.querySelector('header'), footer = leaf.querySelector('footer');
        assert.equal(header.querySelector('h3').textContent, 'Scene Fields · Output');
        assert.ok(header.querySelector('[aria-label="Preview output"]'), 'the actual selector belongs in the flat header');
        assert.ok(footer?.querySelector('[data-run-here]'), 'bounded run action stays reachable below the artifact body');
        assert.match(footer.textContent, /Current/); assert.match(footer.textContent, /Following selection/); assert.match(footer.textContent, /maximum 0 requests/);
        const body = leaf.querySelector('.pc-preview-sections');
        assert.equal(dom.window.getComputedStyle(leaf).display, 'flex');
        assert.equal(dom.window.getComputedStyle(leaf).height, '100%');
        assert.equal(dom.window.getComputedStyle(body).overflowY, 'auto');
        assert.equal(Number.parseFloat(dom.window.getComputedStyle(body).minHeight), 0);
        assert.equal(dom.window.getComputedStyle(panel(f.host).querySelector('article')).borderTopWidth, '0px');
        assert.equal(dom.window.getComputedStyle(panel(f.host).querySelector('pre')).fontFamily, 'system-ui');
        const collapseButton = header.querySelector('[aria-label="Collapse preview"]');
        assert.ok(collapseButton); collapseButton.click(); assert.equal(collapsed, 1);
    } finally { await f.close(); }
});

test('focused artifact panel isolates canvas keys while leaving browser text and Tab defaults available', async () => {
    const f = await fixture(preview(), { runHere() {} });
    const leaked = [], prevented = [];
    f.host.addEventListener('keydown', event => leaked.push(event.key));
    const key = (element, value, ctrlKey = false) => {
        const event = new dom.window.KeyboardEvent('keydown', { key: value, ctrlKey, bubbles: true, cancelable: true });
        element.dispatchEvent(event); flushSync(); prevented.push([value, event.defaultPrevented]);
    };
    try {
        const artifact = panel(f.host);
        tabs(f.host)[0].focus(); key(document.activeElement, 'Tab');
        artifact.focus();
        assert.equal(document.activeElement, artifact, 'the genuine artifact panel owns focus');
        for (const value of ['Delete', 'Backspace', 'ArrowDown', ' ']) key(artifact, value);
        for (const value of ['a', 'c', 'v', 'z', 'y']) key(artifact, value, true);
        key(artifact, 'Tab');
        assert.deepEqual(leaked, [], 'panel shortcuts must not reach native canvas ancestor handlers');
        assert.equal(prevented.every(([, canceled]) => !canceled), true, 'normal Tab, text selection/copy and scroll defaults must remain available');
    } finally { await f.close(); }
});

test('focused artifact panel isolates the separate paste event without suppressing ordinary canvas paste or browser defaults', async () => {
    const f = await fixture(preview());
    const received = [];
    const ancestorPaste = event => received.push(event.target);
    document.addEventListener('paste', ancestorPaste);
    const canvasTarget = document.createElement('div'); canvasTarget.tabIndex = 0; document.body.append(canvasTarget);
    try {
        const artifact = panel(f.host); artifact.focus();
        assert.equal(document.activeElement, artifact);
        const panelPaste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
        artifact.dispatchEvent(panelPaste); flushSync();
        assert.deepEqual(received, [], 'the separate panel paste event must not reach the native document graph-paste listener');
        assert.equal(panelPaste.defaultPrevented, false, 'browser paste defaults are not canceled');
        canvasTarget.focus();
        const canvasPaste = new dom.window.Event('paste', { bubbles: true, cancelable: true });
        canvasTarget.dispatchEvent(canvasPaste);
        assert.deepEqual(received, [canvasTarget], 'paste outside the artifact panel still reaches the document listener');
        assert.equal(canvasPaste.defaultPrevented, false);
    } finally { document.removeEventListener('paste', ancestorPaste); canvasTarget.remove(); await f.close(); }
});
