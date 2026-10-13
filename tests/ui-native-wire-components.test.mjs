import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
import { prepareNativeSearchCatalog, filterNativeSearchChoices } from '../src/ui/native-search-catalog.js?v=0.27.2';
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLMediaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(clientURL);
const keydown = (element, key, extra = {}) => { const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }); element.dispatchEvent(event); flushSync(); return event; };
async function component(name, directory, suppliedSource) {
    const source = suppliedSource ?? await readFile(new URL('../ui/' + name + '.svelte', import.meta.url), 'utf8');
    const compiled = compile(source, { filename: name + '.svelte', generate: 'client', css: 'injected' });
    assert.deepEqual(compiled.warnings.filter(warning => warning.code.startsWith('a11y')), [], 'accessibility compiler warnings');
    const code = compiled.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
    const path = join(directory, name + '.mjs'); await writeFile(path, code);
    return (await import(pathToFileURL(path).href)).default;
}
async function mounted(name, view, actions, check, reactive = false) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-native-popovers-')), host = document.createElement('div'); document.body.append(host);
    let instance;
    try {
        let source = await component(name, directory), setView;
        if (reactive) source = await component('Controlled', directory, `<script>import Child from ${JSON.stringify(pathToFileURL(join(directory, name + '.mjs')).href)};let {initial, actions, ready}=$props();let view=$state(initial);$effect(()=>ready(value=>view=value));</script><Child {view} {actions}/>`);
        instance = mount(source, { target: host, props: reactive ? { initial: view, actions, ready: setter => setView = setter } : { view, actions } }); flushSync(); await tick(); await check(host, value => { setView(value); flushSync(); });
    }
    finally {
        if (instance) await unmount(instance); host.remove();
        const absolute = resolve(directory), scope = relative(resolve(tmpdir()), absolute);
        assert.ok(scope && !scope.startsWith('..') && !isAbsolute(scope) && scope.startsWith('lattice-native-popovers-'));
        await rm(absolute, { recursive: true, force: true });
    }
}
const choices = [
    { id: 'first', label: 'Smart Compactor', family: 'Shaping', phase: 'pre', ports: [] },
    { id: 'second', label: 'Context Join', family: 'Shaping', phase: 'pre', ports: [] },
    { id: 'shelf', label: 'Saved shape', family: 'Subgraphs', phase: 'pre', ports: [], disabledReason: 'Atomic subgraph creation is not available yet.' },
];
const searchView = extra => ({ key: 1, mode: 'nodes', readOnly: false, screenAnchor: { x: 70, y: 40 }, origin: { dir: 'out', kind: 'context' }, contextSensitive: true, choices, ports: [], feedback: '', ...extra });

test('NodeSearch mounts plain choices, focuses search and filters locally without invoking semantic callbacks', async () => {
    const calls = [];
    await mounted('NodeSearch', searchView(), { choose: id => calls.push(id) }, async host => {
        const input = host.querySelector('input[type="search"]'); assert.equal(document.activeElement, input);
        assert.equal(host.querySelectorAll('[data-choice]').length, 3);
        input.value = 'join'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync();
        assert.deepEqual([...host.querySelectorAll('[data-choice]')].map(button => button.textContent.trim()), ['Context Join Shaping']); assert.deepEqual(calls, []);
        keydown(input, 'Enter'); assert.deepEqual(calls, ['second']);
    });
});

test('NodeSearch keyboard navigation skips disabled choices and owns Escape/editing shortcuts without breaking text defaults', async () => {
    const calls = []; let escaped = 0, leaked = 0;
    const handler = () => leaked++; document.body.addEventListener('keydown', handler);
    try {
        await mounted('NodeSearch', searchView(), { choose: id => calls.push(id), dismiss: () => escaped++ }, async host => {
            const input = host.querySelector('input[type="search"]');
            keydown(input, 'ArrowDown'); keydown(input, 'Enter'); assert.deepEqual(calls, ['second']);
            keydown(input, 'End'); keydown(input, 'Enter'); assert.deepEqual(calls, ['second', 'second']);
            keydown(input, 'Home'); keydown(input, 'Enter'); assert.equal(calls.at(-1), 'first');
            for (const key of ['Backspace', 'Delete', ' ', 'a']) assert.equal(keydown(input, key, { ctrlKey: key === 'a' }).defaultPrevented, false);
            keydown(input, 'Escape'); assert.equal(escaped, 1); assert.equal(leaked, 0);
            host.querySelector('[data-choice="shelf"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); flushSync(); assert.equal(calls.length, 3);
        });
    } finally { document.body.removeEventListener('keydown', handler); }
});

test('NodeSearch explicit port chooser selects a real port and context/readonly guards survive raw DOM events', async () => {
    const calls = [];
    await mounted('NodeSearch', searchView({ mode: 'ports', ports: [{ portId: 'context-1', dir: 'in', kind: 'context', label: 'First context' }, { portId: 'context-2', dir: 'in', kind: 'context', label: 'Second context' }] }), { choosePort: id => calls.push(id) }, async host => {
        assert.equal(host.querySelector('input[type="search"]'), null);
        keydown(host.querySelector('[role="dialog"]'), 'End'); keydown(host.querySelector('[role="dialog"]'), 'Enter'); assert.deepEqual(calls, ['context-2']);
    });
    await mounted('NodeSearch', searchView(), { setContextSensitive: enabled => calls.push(enabled) }, async host => {
        const checkbox = host.querySelector('input[type="checkbox"]'); checkbox.checked = false; checkbox.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync(); assert.equal(calls.at(-1), false);
    });
    await mounted('NodeSearch', searchView({ readOnly: true }), { choose: id => calls.push(id), setContextSensitive: value => calls.push(value) }, async host => {
        const length = calls.length;
        host.querySelector('[data-choice="first"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        host.querySelector('input[type="checkbox"]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        keydown(host.querySelector('input[type="search"]'), 'Enter'); assert.equal(calls.length, length);
    });
});

test('standalone search hides context control and empty results/feedback remain visible', async () => {
    await mounted('NodeSearch', searchView({ origin: null, choices: [], feedback: 'The view changed.' }), {}, async host => {
        assert.equal(host.querySelector('input[type="checkbox"]'), null);
        assert.match(host.querySelector('.pc-empty').textContent, /No nodes are available in this view/); assert.match(host.querySelector('.pc-feedback').textContent, /The view changed/);
        const input = host.querySelector('input[type="search"]'); input.value = 'missing'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync();
        assert.match(host.querySelector('.pc-empty').textContent, /No nodes match your search/); assert.match(host.querySelector('.pc-feedback').textContent, /The view changed/);
    });
});

test('PinMenu readonly leaves navigation available and guards raw edit/disabled dispatch with keyboard focus ownership', async () => {
    const picked = []; let escaped = 0;
    const view = { key: 1, title: 'Source · Output', kind: 'context', screenAnchor: { x: 40, y: 60 }, readOnly: true, entries: [
        { id: 'cut', label: 'Break all links', capability: 'edit' }, { id: 'jump', label: 'Jump to source', capability: 'navigation' }, { id: 'blocked', label: 'Unavailable jump', capability: 'navigation', disabled: true },
    ] };
    await mounted('PinMenu', view, { pick: id => picked.push(id), dismiss: () => escaped++ }, async host => {
        const edit = host.querySelector('[data-entry="cut"]'), navigation = host.querySelector('[data-entry="jump"]');
        assert.equal(edit.disabled, true); assert.equal(navigation.disabled, false); assert.equal(document.activeElement, navigation);
        edit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); host.querySelector('[data-entry="blocked"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); flushSync(); assert.deepEqual(picked, []);
        keydown(navigation, 'Enter'); assert.deepEqual(picked, ['jump']); keydown(navigation, 'Escape'); assert.equal(escaped, 1);
    });
});

test('both popovers clamp only screen placement at the supported widths without touching captured graph coordinates', async () => {
    for (const width of [1024, 736, 360, 320]) {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }); Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
        for (const name of ['NodeSearch', 'PinMenu']) {
            const graphPoint = Object.freeze({ x: -171.125, y: 84.75 });
            const view = name === 'NodeSearch' ? searchView({ screenAnchor: { x: width - 1, y: 590 }, graphPoint }) : { key: 1, title: 'Pin', kind: 'context', readOnly: false, entries: [], screenAnchor: { x: width - 1, y: 590 }, graphPoint };
            await mounted(name, view, {}, async host => {
                const popup = host.querySelector('[role="dialog"]'); popup.getBoundingClientRect = () => ({ width: 284, height: 200 });
                window.dispatchEvent(new dom.window.Event('resize')); flushSync();
                assert.equal(popup.style.left, width - 284 - 8 + 'px'); assert.equal(popup.style.top, '392px');
                assert.deepEqual(graphPoint, { x: -171.125, y: 84.75 });
            });
        }
    }
});

test('current readonly changes guard already mounted controls and feedback updates preserve query/focus', async () => {
    const calls = [], initial = searchView();
    await mounted('NodeSearch', initial, { choose: id => calls.push(id), setContextSensitive: value => calls.push(value) }, async (host, update) => {
        const input = host.querySelector('input[type="search"]'); input.value = 'join'; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync();
        update({ ...initial, feedback: 'Choose a compatible port.' }); await tick();
        assert.equal(input.value, 'join'); assert.equal(document.activeElement, input);
        const result = host.querySelector('[data-choice="second"]');
        update({ ...initial, readOnly: true }); await tick();
        result.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); host.querySelector('input[type="checkbox"]').dispatchEvent(new dom.window.Event('change', { bubbles: true })); keydown(input, 'Enter'); assert.deepEqual(calls, []);
    }, true);
    const view = { key: 1, title: 'Pin', kind: 'context', readOnly: false, screenAnchor: { x: 10, y: 20 }, entries: [{ id: 'cut', label: 'Break link', capability: 'edit' }, { id: 'jump', label: 'Jump to source', capability: 'navigation' }] };
    await mounted('PinMenu', view, { pick: id => calls.push(id) }, async (host, update) => {
        const edit = host.querySelector('[data-entry="cut"]'); update({ ...view, readOnly: true }); await tick();
        edit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); assert.deepEqual(calls, []);
        host.querySelector('[data-entry="jump"]').click(); flushSync(); assert.deepEqual(calls, ['jump']);
    }, true);
});

test('search starts with an accessible input and outside presses dismiss anywhere without choosing a result', async () => {
    let dismissed = 0; const selected = [];
    await mounted('NodeSearch', searchView(), { choose: id => selected.push(id), dismiss: () => dismissed++ }, async host => {
        const dialog = host.querySelector('[role="dialog"]'), input = host.querySelector('input[type="search"]');
        assert.equal(dialog.firstElementChild.tagName, 'LABEL'); assert.equal(input.getAttribute('aria-label'), 'Search nodes and subgraphs');
        assert.equal(host.querySelector('h2, [data-search-close]'), null);
        assert.doesNotMatch(host.textContent, /Add node|Close|Search nodes and subgraphs/);
        const press = element => element.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
        press(input); press(host.querySelector('[data-choice="first"]')); assert.equal(dismissed, 0);
        for (const tag of ['header', 'div', 'button']) {
            const outside = document.createElement(tag); outside.addEventListener('pointerdown', event => event.stopPropagation()); document.body.append(outside);
            press(outside); outside.remove();
        }
        press(document.body); assert.equal(dismissed, 4); assert.deepEqual(selected, []);
        keydown(input, 'Escape'); assert.equal(dismissed, 5); assert.deepEqual(selected, []);
    });
    document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); assert.equal(dismissed, 5, 'unmount removes outside listener');
});

test('real cached purpose, shortcode and known operation alias terms independently filter the source-compiled popup', async () => {
    const catalog = prepareNativeSearchCatalog({ schema: 3, runtime: 2, mode: 'native-unified', workflowId: 'query-root', viewPath: [], inDefinition: false }).data;
    const cached = filterNativeSearchChoices(catalog, { origin: { dir: 'out', kind: 'context' }, contextSensitive: true });
    const item = cached.find(choice => choice.id === 'operation:smart-compactor'), calls = [];
    const fields = { label: item.label, family: item.family, purpose: item.purpose, shortcode: item.shortcode, searchAliases: item.searchAliases.join(' ') };
    await mounted('NodeSearch', searchView({ choices: cached }), { choose: id => calls.push(id) }, async host => {
        const input = host.querySelector('input[type="search"]');
        for (const [field, term] of [['purpose', 'protected'], ['shortcode', 'cp'], ['searchAliases', 'compaction']]) {
            assert.ok(fields[field].toLowerCase().includes(term));
            for (const [name, text] of Object.entries(fields)) if (name !== field) assert.equal(text.toLowerCase().includes(term), false, term + ' occurs only in ' + field);
            input.value = term.toUpperCase(); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync();
            assert.deepEqual([...host.querySelectorAll('[data-choice]')].map(button => button.dataset.choice), [item.id], field);
            keydown(input, 'Enter'); assert.equal(calls.at(-1), item.id);
        }
        assert.equal(calls.length, 3);
    });
});
