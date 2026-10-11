import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'https://lattice.test' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLMediaElement', 'MutationObserver', 'localStorage']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const client = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(client);
const pointer = (element, type, extra = {}) => { const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 500, ...extra }); Object.defineProperty(event, 'pointerId', { value: extra.pointerId ?? 1 }); element.dispatchEvent(event); flushSync(); return event; };
const key = (element, name, extra = {}) => { const event = new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...extra }); element.dispatchEvent(event); flushSync(); return event; };
async function fixture(check) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-details-resize-')), host = document.createElement('div'); document.body.append(host);
    let instance, width = 258, draft = null, starts = 0; const committed = [], previews = [], captures = new Set();
    try {
        const source = await readFile(new URL('../ui/DetailsDivider.svelte', import.meta.url), 'utf8').catch(() => '<div></div>');
        const output = compile(source, { filename: 'DetailsDivider.svelte', generate: 'client', css: 'injected' });
        assert.deepEqual(output.warnings.filter(warning => warning.code.startsWith('a11y')), []);
        const code = output.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? client : import.meta.resolve(specifier)));
        const file = join(directory, 'divider.mjs'); await writeFile(file, code);
        const props = { width, min: 220, max: 400, start: () => starts++, preview: value => { draft = value; previews.push(value); }, change: value => { width = value; committed.push(value); } };
        instance = mount((await import(pathToFileURL(file).href)).default, { target: host, props }); flushSync(); await tick();
        const handle = host.querySelector('[role="separator"]'); assert.ok(handle, 'Details needs a focusable left-edge separator');
        handle.setPointerCapture = id => captures.add(id); handle.hasPointerCapture = id => captures.has(id); handle.releasePointerCapture = id => captures.delete(id);
        await check({ handle, committed, previews, captures, starts: () => starts, draft: () => draft, close: async () => { await unmount(instance); instance = null; } });
    } finally {
        if (instance) await unmount(instance); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && scope.startsWith('lattice-details-resize-') && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true });
    }
}

test('Details left-edge dragging previews bounded width and persists only the matching pointer release', async () => {
    await fixture(async f => {
        assert.equal(f.handle.tabIndex, 0); assert.equal(f.handle.getAttribute('aria-orientation'), 'vertical'); assert.equal(f.handle.getAttribute('aria-label'), 'Resize Details');
        pointer(f.handle, 'pointerdown'); assert.equal(f.starts(), 1); assert.deepEqual([...f.captures], [1]);
        pointer(f.handle, 'pointermove', { clientX: 350 }); assert.equal(f.draft(), 400); assert.deepEqual(f.committed, []);
        pointer(f.handle, 'pointermove', { clientX: 700, pointerId: 2 }); assert.equal(f.draft(), 400);
        pointer(f.handle, 'pointerup', { pointerId: 2 }); assert.deepEqual(f.committed, []);
        pointer(f.handle, 'pointerup'); assert.deepEqual(f.committed, [400]); assert.equal(f.draft(), null); assert.equal(f.captures.size, 0);
        pointer(f.handle, 'lostpointercapture'); assert.deepEqual(f.committed, [400]);
    });
});

test('cancel, lost capture, Escape, blur and unmount discard the transient Details width', async () => {
    for (const action of ['pointercancel', 'lostpointercapture', 'Escape', 'blur', 'unmount']) await fixture(async f => {
        pointer(f.handle, 'pointerdown'); pointer(f.handle, 'pointermove', { clientX: 450 }); assert.equal(f.draft(), 308);
        if (action === 'Escape') assert.equal(key(f.handle, 'Escape').defaultPrevented, true);
        else if (action === 'blur') window.dispatchEvent(new dom.window.Event('blur'));
        else if (action === 'unmount') await f.close();
        else pointer(f.handle, action);
        flushSync(); assert.equal(f.draft(), null, action); assert.deepEqual(f.committed, [], action); assert.equal(f.captures.size, 0, action);
    });
});

test('Details separator keyboard keeps the canvas space clamp and ignores unrelated keys/buttons', async () => {
    await fixture(async f => {
        assert.equal(key(f.handle, 'ArrowLeft').defaultPrevented, true); assert.deepEqual(f.committed, [270]);
        key(f.handle, 'ArrowRight', { shiftKey: true }); assert.equal(f.committed.at(-1), 220);
        key(f.handle, 'End'); assert.equal(f.committed.at(-1), 400); key(f.handle, 'Home'); assert.equal(f.committed.at(-1), 220);
        assert.equal(key(f.handle, 'a').defaultPrevented, false);
        pointer(f.handle, 'pointerdown', { button: 2 }); pointer(f.handle, 'pointermove', { clientX: 350 }); assert.equal(f.draft(), null); assert.equal(f.starts(), 4);
    });
});

test('Workbench clamps Details to leave a useful canvas and cancels a draft when changing graph views', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-details-resize-')), host = document.createElement('div'); document.body.append(host);
    const files = new Map(); let instance; const committed = [];
    async function component(name) {
        if (files.has(name)) return files.get(name);
        const sourceURL = new URL('../ui/' + name + '.svelte', import.meta.url), source = await readFile(sourceURL, 'utf8');
        const output = compile(source, { filename: name + '.svelte', generate: 'client', css: 'injected' });
        assert.deepEqual(output.warnings.filter(warning => warning.code.startsWith('a11y')), [], name + ' accessibility');
        const file = join(directory, name + '.mjs'); files.set(name, file);
        for (const match of output.js.code.matchAll(/from ['"]\.\/([^'"]+)\.svelte['"]/g)) await component(match[1]);
        const code = output.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? client : import.meta.resolve(specifier)))
            .replace(/(['"])(\.\/([^'"]+)\.svelte)\1/g, (_, quote, specifier, child) => JSON.stringify(pathToFileURL(files.get(child)).href))
            .replace(/(['"])(\.\.\/src\/[^'"]+)\1/g, (_, quote, specifier) => JSON.stringify(new URL(specifier, sourceURL).href));
        await writeFile(file, code); return file;
    }
    try {
        const file = await component('Workbench');
        instance = mount((await import(pathToFileURL(file).href)).default, { target: host, props: { actions: { arm() {}, command() {}, mode() {}, zoom() {}, fitSelection() {}, resizeDetails: width => committed.push(width) } } }); flushSync(); await tick();
        const body = host.querySelector('.pc-body'), root = instance.getParts().root;
        Object.defineProperty(body, 'clientWidth', { configurable: true, value: 690 });
        instance.update({ graphId: 'first', detailsWidth: 480 }); window.dispatchEvent(new dom.window.Event('resize')); flushSync(); await tick();
        let handle = host.querySelector('[aria-label="Resize Details"]'); assert.ok(handle, 'Details resize handle is mounted in the shell');
        assert.equal(handle.getAttribute('aria-valuemax'), '322'); assert.equal(handle.getAttribute('aria-valuenow'), '322'); assert.equal(root.style.getPropertyValue('--pc-details-width'), '322px');
        key(handle, 'End'); assert.deepEqual(committed, [322]);
        instance.update({ detailsWidth: 260 }); flushSync();
        const captures = new Set(); handle.setPointerCapture = id => captures.add(id); handle.hasPointerCapture = id => captures.has(id); handle.releasePointerCapture = id => captures.delete(id);
        pointer(handle, 'pointerdown'); pointer(handle, 'pointermove', { clientX: 480 }); assert.equal(root.style.getPropertyValue('--pc-details-width'), '280px');
        Object.defineProperty(body, 'clientWidth', { configurable: true, value: 1100 }); window.dispatchEvent(new dom.window.Event('resize'));
        instance.update({ graphId: 'second', detailsWidth: 350 }); flushSync(); await tick(); flushSync();
        assert.equal(root.style.getPropertyValue('--pc-details-width'), '350px'); assert.equal(captures.size, 0); assert.deepEqual(committed, [322]);
    } finally {
        if (instance) await unmount(instance); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && scope.startsWith('lattice-details-resize-') && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true });
    }
});
