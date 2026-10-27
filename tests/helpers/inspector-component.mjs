import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { compiled } from './svelte-compile.mjs';
import { findInlineEditor, rememberValueEditor } from './inline-value-scope.mjs';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node','Element','Text','Comment','Document','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync } = await import(clientURL);

export async function inspectorComponent(name, initial, options, check) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-slim-inspector-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const leaf = await compiled(name, directory);
        const harness = await compiled('Harness', directory, `<script>
            import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)};
            let { initial, options } = $props();
            let text = $state(initial), value = $state.raw(initial), draft = $state.raw();
            let changes = $state([]), invalids = $state([]);
            export function read() { return { text, value, draft, changes: [...changes], invalids: [...invalids] }; }
            function ontext(next) { text = next; changes = [...changes, next]; }
            function oninvalid(next) { invalids = [...invalids, next]; }
            function onchange(next) { value = next; changes = [...changes, next]; }
        </script><Leaf {text} {value} {onchange} {ontext} {oninvalid} draftState={options.draftState} onDraftState={next => draft = next} {...options} label="Test" idPrefix="slim-test" />`);
        const start = (text, settings) => { mounted = mount(harness.component, { target: host, props: { initial: text, options: settings } }); flushSync(); };
        start(initial, options);
        await check({ host, read: () => mounted.read(), remount: async () => { const saved = mounted.read(); await unmount(mounted); start(saved.text, { ...options, draftState: saved.draft }); } });
    } finally {
        if (mounted) await unmount(mounted);
        host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory));
        assert.ok(scope && scope.startsWith('lattice-slim-inspector-') && !scope.startsWith('..') && !isAbsolute(scope));
        await rm(directory, { recursive: true, force: true });
    }
}
export function control(host, label) {
    const element = findInlineEditor(host,label);
    assert.ok(element, `Missing ${label}`); return element;
}
export function input(host, label, value, event = 'input') {
    const element = control(host, label); element.value = value;
    element.dispatchEvent(new dom.window.Event(event, { bubbles: true })); flushSync(); return element;
}
export function click(host, label) { const element = control(host, label); element.click(); flushSync(); rememberValueEditor(host,element,flushSync); return element; }
export function nodeAt(host, path) { const element = [...host.querySelectorAll('[data-schema-path]')].find(element => element.getAttribute('data-schema-path') === JSON.stringify(path)); assert.ok(element, `Missing schema node ${JSON.stringify(path)}`); return element; }

export async function detailsComponent(initial, actions, check) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-slim-inspector-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const leaf = await compiled('NodeDetails', directory);
        const harness = await compiled('Harness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions } = $props(); let view = $state.raw(initial); export function update(next) { view = next; }</script><Leaf {view} {actions}/>`);
        mounted = mount(harness.component, { target: host, props: { initial, actions } }); flushSync();
        await check({ host, async update(next) { mounted.update(next); flushSync(); await new Promise(resolve => queueMicrotask(resolve)); flushSync(); } });
    } finally {
        if (mounted) await unmount(mounted); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory));
        assert.ok(scope && scope.startsWith('lattice-slim-inspector-') && !scope.startsWith('..') && !isAbsolute(scope));
        await rm(directory, { recursive: true, force: true });
    }
}
