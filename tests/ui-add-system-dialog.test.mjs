import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLMediaElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver'])
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href, { mount, unmount, flushSync } = await import(clientURL);
test('selected reply Guidance merge shows one destination and preserves user-facing connection preview', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-add-system-'));
    let mounted;
    const host = document.createElement('div');
    document.body.append(host);
    try {
        const source = await readFile(new URL('../ui/AddSystem.svelte', import.meta.url), 'utf8'), compiled = compile(source, { filename: 'AddSystem.svelte', generate: 'client', css: 'injected' });
        assert.deepEqual(compiled.warnings, []);
        const code = compiled.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
        const file = join(directory, 'AddSystem.mjs');
        await writeFile(file, code);
        const Component = (await import(pathToFileURL(file).href)).default;
        const output = { id: 'guidance', label: 'Guidance', kind: 'guidance', direction: 'output' }, view = { mode: 'assist', key: 'dialog', generatorId: 'generate', canCreate: false, destinations: [{ nodeId: 'merge', label: 'Compose Guidance', route: [] }], pins: [], choices: [{ key: 'weather', name: 'Weather', definition: { version: 1 }, inputs: [], outputs: [output], parameters: [] }] };
        mounted = mount(Component, { target: host, props: { view, actions: { close() { }, submit() { }, preview() { return { ok: true, data: { connections: ['Weather · Guidance → Compose Guidance · Weather section → Generate Reply'], changes: [] } }; } } } });
        flushSync();
        assert.equal(document.activeElement, host.querySelector('[aria-label="System Guidance output"]'));
        const select = (label, value) => { const el = host.querySelector(`[aria-label="${label}"]`); el.value = value; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync(); };
        select('System Guidance output', 'guidance');
        select('Guidance merge destination', 'merge');
        assert.equal(host.querySelector('[aria-label="System output Guidance"]'), null);
        host.querySelectorAll('button')[1].click();
        flushSync();
        assert.equal(document.activeElement, host.querySelector('[aria-label="System Guidance output"]'));
        assert.match(host.textContent, /Applies to the placed Weather system/);
        assert.match(host.textContent, /Weather · Guidance → Compose Guidance/);
    }
    finally {
        if (mounted)
            await unmount(mounted);
        host.remove();
        await rm(directory, { recursive: true, force: true });
    }
});


test('saved-system chooser enables placement with required inputs and exposed settings before any preview', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-system-chooser-'));
    const host = document.createElement('div'); document.body.append(host); let mounted;
    try {
        const source = await readFile(new URL('../ui/AddSystem.svelte', import.meta.url), 'utf8');
        const compiled = compile(source, { filename: 'AddSystem.svelte', generate: 'client', css: 'injected' });
        assert.deepEqual(compiled.warnings, []);
        const code = compiled.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
        const file = join(directory, 'Chooser.mjs'); await writeFile(file, code);
        const Component = (await import(pathToFileURL(file).href)).default;
        const view = { key: 'chooser', generatorId: 'generate', canCreate: true, destinations: [], pins: [], choices: [{ key: 'weather', name: 'Weather', definition: { version: 2 }, inputs: [{ id: 'data', label: 'Data', kind: 'data', direction: 'input', required: true }], outputs: [], parameters: [{ id: 'actor', label: 'Actor' }] }] };
        let submitted;
        mounted = mount(Component, { target: host, props: { view, actions: { close() {}, submit(...args) { submitted = args; }, preview() { throw Error('placement must not preview'); } } } }); flushSync();
        const add = [...host.querySelectorAll('button')].find(button => button.textContent === 'Add system');
        assert.equal(add.disabled, false, 'saved revision is immediately placeable');
        assert.equal(host.querySelector('[aria-label="System input Data"]'), null);
        assert.equal(host.querySelector('[aria-label="System setting Actor"]'), null);
        assert.equal([...host.querySelectorAll('button')].some(button => button.textContent === 'Preview connections'), false);
        add.click(); flushSync(); assert.deepEqual(submitted, ['chooser', 'weather']);
    } finally { if (mounted) await unmount(mounted); host.remove(); await rm(directory, { recursive: true, force: true }); }
});
