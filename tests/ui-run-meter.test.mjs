import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync } = await import(clientURL);
const pixelGrid = await import('../src/ui/pixel-grid.js').catch(() => ({}));

test('pixel grid uses equal physical cell and gap sizes at fractional device scales', () => {
    assert.equal(typeof pixelGrid.alignPixelGrid, 'function');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (let index = 0; index < 36; index++) svg.append(document.createElementNS(svg.namespaceURI, 'rect'));
    const alignment = pixelGrid.alignPixelGrid(svg);
    try {
        for (const ratio of [1, 1.25, 1.5, 1.75, 2, 2.625]) {
            Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: ratio });
            alignment.update();
            const cell = Math.round(4 * ratio), gap = Math.round(2 * ratio);
            const width = 12 * cell + 11 * gap + 2, height = 3 * cell + 2 * gap + 2;
            assert.equal(svg.getAttribute('viewBox'), `-1 -1 ${width} ${height}`, 'one transparent device pixel protects each outer edge from viewport clipping');
            assert.equal(Number.parseFloat(svg.style.width), width / ratio);
            assert.equal(Number.parseFloat(svg.style.height), height / ratio);
            assert.equal(svg.getAttribute('shape-rendering'), 'crispEdges');
            assert.equal(svg.getAttribute('preserveAspectRatio'), 'none');
            [...svg.children].forEach((rect, index) => {
                assert.equal(rect.getAttribute('x'), String(Math.floor(index / 3) * (cell + gap)));
                assert.equal(rect.getAttribute('y'), String(index % 3 * (cell + gap)));
                assert.equal(rect.getAttribute('width'), String(cell));
                assert.equal(rect.getAttribute('height'), String(cell));
            });
        }
    } finally {
        alignment.destroy();
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    }
});

test('pixel grid follows child and device-scale changes until its action is destroyed', async () => {
    const originalMatchMedia = window.matchMedia;
    const queries = [];
    window.matchMedia = media => {
        const listeners = new Set();
        const query = {
            media, listeners,
            addEventListener(type, listener) { assert.equal(type, 'change'); listeners.add(listener); },
            removeEventListener(type, listener) { assert.equal(type, 'change'); listeners.delete(listener); },
            change() { for (const listener of [...listeners]) listener(); },
        };
        queries.push(query);
        return query;
    };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const appendPixel = () => svg.append(document.createElementNS(svg.namespaceURI, 'rect'));
    appendPixel();
    const alignment = pixelGrid.alignPixelGrid(svg);
    try {
        assert.equal(queries.at(-1)?.media, '(resolution: 1dppx)');
        appendPixel(); appendPixel(); appendPixel();
        await Promise.resolve();
        assert.equal(svg.getAttribute('viewBox'), '-1 -1 12 18', 'new columns are aligned after the Svelte keyed list changes');
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.25 });
        window.dispatchEvent(new window.Event('resize'));
        assert.equal(svg.getAttribute('viewBox'), '-1 -1 15 23');
        assert.equal(queries.at(-1).media, '(resolution: 1.25dppx)');
        assert.equal(queries[0].listeners.size, 0, 'the old resolution listener is released');
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1.5 });
        queries.at(-1).change();
        assert.equal(svg.getAttribute('viewBox'), '-1 -1 17 26', 'a zoom change does not require a resize event');
        assert.equal(queries.at(-1).media, '(resolution: 1.5dppx)');
        alignment.destroy();
        assert.ok(queries.every(query => query.listeners.size === 0), 'destroy releases every resolution listener');
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
        window.dispatchEvent(new window.Event('resize'));
        appendPixel(); appendPixel(); appendPixel();
        await Promise.resolve();
        alignment.update();
        assert.equal(svg.getAttribute('viewBox'), '-1 -1 17 26', 'destroyed grids stop reacting to all update sources');
    } finally {
        alignment.destroy();
        window.matchMedia = originalMatchMedia;
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    }
});

async function fixture() {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-run-meter-'));
    const host = document.createElement('div'); document.body.append(host);
    let mounted;
    return {
        async show(view, open) {
            const source = await readFile(new URL('../ui/RunMeter.svelte', import.meta.url), 'utf8');
            const compiled = compile(source, { filename: 'RunMeter.svelte', generate: 'client', css: 'injected' });
            assert.deepEqual(compiled.warnings.filter(warning => warning.code.startsWith('a11y')), []);
            const code = compiled.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?|\.\.\/src\/ui\/pixel-grid\.js)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : specifier.startsWith('.') ? new URL(specifier, import.meta.url).href : import.meta.resolve(specifier)));
            const output = join(directory, 'RunMeter.mjs'); await writeFile(output, code);
            const component = (await import(pathToFileURL(output).href)).default;
            mounted = mount(component, { target: host, props: { view, open } }); flushSync(); return host;
        },
        async close() {
            if (mounted) await unmount(mounted);
            host.remove();
            const cleanup = resolve(directory), parent = resolve(tmpdir()), path = relative(parent, cleanup);
            assert.ok(path && !path.startsWith('..') && !isAbsolute(path), 'cleanup stays within the exact temporary fixture');
            await rm(cleanup, { recursive: true, force: true });
        },
    };
}
const row = (id, status = 'completed') => ({ id, title: 'Stage ' + id, status, executableCount: 1, completedCount: status === 'completed' ? 1 : 0 });

test('one accessible meter retains wrapper display without double-counting executable stages', async () => {
    const f = await fixture(); let opened = 0;
    try {
        const host = await f.show({ status: 'running', rows: [{ ...row('wrapper', 'running'), executableCount: 2, completedCount: 1 }, row('outside', 'waiting')], completedCount: 1, executableCount: 3, actualCalls: 1, callBound: 2, elapsedMs: 1500 }, () => opened++);
        const button = host.querySelector('button'); assert.equal(host.querySelectorAll('button').length, 1);
        assert.match(button.getAttribute('aria-label'), /1 of 3 stages complete/);
        assert.match(button.getAttribute('aria-label'), /1 of 2 requests/);
        assert.equal(host.querySelectorAll('[data-run-pixel]').length, 2);
        assert.equal(host.querySelector('[data-run-pixel]').dataset.status, 'running');
        assert.match(host.textContent, /1\.5s/);
        button.click(); assert.equal(opened, 1);
    } finally { await f.close(); }
});

test('overflow retains failure feedback in one aggregate pixel and details remain reachable', async () => {
    const f = await fixture(); let opened = 0;
    try {
        const rows = Array.from({ length: 40 }, (_, index) => row(String(index)));
        rows[39].status = 'failed'; rows[39].completedCount = 0;
        const host = await f.show({ status: 'failed', rows, completedCount: 39, executableCount: 40, actualCalls: 0, callBound: 0, elapsedMs: null }, () => opened++);
        const pixels = [...host.querySelectorAll('[data-run-pixel]')];
        assert.equal(pixels.length, 36);
        assert.equal(pixels.at(-1).dataset.status, 'failed');
        assert.match(pixels.at(-1).getAttribute('title'), /5 remaining rows/);
        assert.match(host.querySelector('button').getAttribute('aria-label'), /39 of 40 stages complete/);
        assert.equal(host.querySelector('[data-run-elapsed]'), null, 'unknown duration is not invented');
        host.querySelector('button').click(); assert.equal(opened, 1);
    } finally { await f.close(); }
});


test('partial meter calls out failures without repainting failed and blocked rows as completed', async () => {
    const f = await fixture();
    try {
        const host = await f.show({status:'partial',rows:[row('kept'),row('failed','failed'),row('blocked','blocked')],completedCount:1,executableCount:3,actualCalls:2,callBound:2,elapsedMs:1000},()=>{});
        assert.match(host.textContent,/Completed with failures/);
        assert.match(host.querySelector('button').getAttribute('aria-label'),/Completed with failures/);
        assert.deepEqual([...host.querySelectorAll('[data-run-pixel]')].map(pixel=>pixel.dataset.status),['completed','failed','blocked']);
    } finally { await f.close(); }
});
