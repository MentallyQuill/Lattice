import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { compiled } from './helpers/svelte-compile.mjs';

const dom = new JSDOM('<body><div id="editor"></div></body>', { pretendToBeVisual: true });
Object.assign(globalThis, {
    window: dom.window, document: dom.window.document,
    CustomEvent: dom.window.CustomEvent, getComputedStyle: dom.window.getComputedStyle,
});
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLDivElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLMediaElement', 'MutationObserver', 'SVGElement']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
const { installMock } = await import('./mock.js');
installMock({ settings: { graphs: {} } });
const version = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).version;
const T = await import(`../src/theme.js?v=${version}`);
const { renderThemeEditor } = await import(`../src/theme-editor.js?v=${version}`);
const box = document.getElementById('editor');
const themeStyle = document.createElement('style');
themeStyle.textContent = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
document.head.append(themeStyle);

test('every preset explains the shared seven pin shapes and accessible presets also explain patterns', () => {
    for (const preset of Object.keys(T.PRESETS)) {
        T.setPreset(preset);
        renderThemeEditor(box);
        const legend = box.querySelector('.pc-th-accessibility');
        assert.ok(legend, 'The selected accessible preset has a visible legend outside collapsed colour controls');
        assert.equal(legend.closest('details'), null);
        assert.match(legend.textContent, /labels/i);
        for (const cue of [
            'Context: filled circle', 'Text: capsule', 'Data: square', 'Guidance: diamond',
            'Draft: pentagon', 'Patches: triangle', 'Candidate: ring with center dot',
        ]) assert.ok(legend.textContent.includes(cue), cue);
        assert.equal(legend.querySelectorAll('.pc-th-pin-cue').length, 7);
        assert.equal(legend.querySelector('[data-kind="findings"]'), null);
        if (T.PRESETS[preset].accessible) {
            assert.match(legend.textContent, /Text wires are solid/i);
            assert.match(legend.textContent, /data dashed/i);
            assert.match(legend.textContent, /guidance dotted/i);
            assert.match(legend.textContent, /other types use distinct patterns/i);
        }
    }
    T.setPreset('lattice');
    renderThemeEditor(box);
    assert.ok(box.querySelector('.pc-th-accessibility'), 'Ordinary themes offer the same seven glyphs');
});

test('Signal accepts its shared meaning colors while still warning about unreadable custom text', () => {
    T.setPreset('signal');
    renderThemeEditor(box);
    assert.doesNotMatch(box.querySelector('.pc-th-custom').textContent, /very close|hard to tell apart/i);
    const textRow = [...box.querySelectorAll('.pc-th-row')].find(row => row.querySelector('.pc-th-label').textContent === 'Text');
    const input = textRow.querySelector('input');
    input.value = '#151515';
    input.dispatchEvent(new dom.window.Event('input'));
    input.dispatchEvent(new dom.window.Event('change'));
    assert.match(box.querySelector('.pc-th-warnings').textContent, /text is hard to read on the panel background/i);
    assert.doesNotMatch(box.querySelector('.pc-th-warnings').textContent, /very close|hard to tell apart/i);
    const warningRow = [...box.querySelectorAll('.pc-th-row')].find(row => row.querySelector('.pc-th-label').textContent === 'Warnings and skipped blocks');
    const warningInput = warningRow.querySelector('input');
    warningInput.value = '#fefefe';
    warningInput.dispatchEvent(new dom.window.Event('input'));
    warningInput.dispatchEvent(new dom.window.Event('change'));
    assert.equal(box.querySelector('.pc-th-warnings').textContent.match(/very close/g)?.length, 2, 'Changed meaning roles receive advice while the inherited matching pair stays intentional');
});

async function withPreview(check) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-theme-preview-'));
    const host = document.createElement('div');
    document.body.append(host);
    const { mount, unmount, flushSync, tick } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
    const kinds = ['context', 'text', 'data', 'guidance', 'draft', 'patches', 'candidate'];
    const ports = kinds.map((kind, index) => ({ id: kind, port: kind, dir: 'in', kind, label: `${kind} input`, optional: false, x: 10, y: 32 + index * 18 }));
    const example = {
        id: 'typed-cues', number: 1, title: 'Typed preview', goal: 'Inspect named pin cues', searchText: 'typed preview inspect named pin cues', issue: '',
        thumbnail: {
            bounds: { x: 0, y: 0, w: 260, h: 200 }, comments: [], wires: [],
            nodes: [
                { id: 'node', x: 0, y: 0, w: 260, h: 200, title: 'All types', className: 'pc-node-native', iconPath: 'M 2,2 L 8,8', body: null, compact: false, ports },
                { id: 'identity', x: 180, y: 0, w: 80, h: 32, title: 'Identity', className: 'pc-node-native pc-node-compact', iconPath: 'M 3,3 L 9,9', body: null, compact: true, ports: [] },
            ],
        },
    };
    let instance;
    try {
        const { component } = await compiled('ExamplesBrowser', directory);
        instance = mount(component, { target: host, props: { examples: [example], scroll() {}, open() {} } });
        flushSync();
        await tick();
        await check(host, ports, { flushSync, tick });
    } finally {
        if (instance) await unmount(instance);
        host.remove();
        const absolute = resolve(directory), scope = relative(resolve(tmpdir()), absolute);
        assert.ok(scope && !scope.startsWith('..') && !isAbsolute(scope) && scope.startsWith('lattice-theme-preview-'));
        await rm(absolute, { recursive: true, force: true });
    }
}

test('example overview thumbnails retain typed cue geometry without mounting small labels or ordinary icons', async () => {
    await withPreview((host, ports) => {
        const cues = [...host.querySelectorAll('.pc-example-pin-cue')];
        assert.equal(cues.length, 7, 'Every named type has the shared pin shape in its thumbnail');
        assert.equal(new Set(cues.map(cue => cue.innerHTML)).size, 7, 'The seven typed cues have different geometry');
        for (const pin of ports) {
            const cue = host.querySelector(`.pc-example-pin-cue[data-kind="${pin.kind}"]`);
            assert.equal(Number(cue.getAttribute('x')) + 9, pin.x, 'Cue geometry remains at its authored pin position');
            assert.equal(Number(cue.getAttribute('y')) + 9, pin.y);
            assert.equal(typeof pin.label, 'string', `${pin.kind} retains its route label in the thumbnail DTO`);
        }
        assert.equal(host.querySelectorAll('.pc-example-pin-label').length, 0, 'Overview thumbnails omit tiny pin label elements');
        assert.equal(host.querySelectorAll('g[data-id="node"] .pc-example-icon').length, 0, 'Ordinary overview cards omit their icon elements');
        assert.equal(host.querySelectorAll('g[data-id="identity"] .pc-example-icon').length, 1, 'Compact identity cards retain their icon');
        assert.equal(host.querySelectorAll('.pc-example-pin-dot').length, 0, 'All themes use one shared glyph instead of a circle fallback');
    });
});

test('example thumbnail shells mount overview details only near the scroll viewport', async () => {
    const original = globalThis.IntersectionObserver, observers = [];
    globalThis.IntersectionObserver = class {
        constructor(callback, options) { this.callback = callback; this.options = options; this.nodes = new Set(); observers.push(this); }
        observe(node) { this.nodes.add(node); }
        unobserve(node) { this.nodes.delete(node); }
        disconnect() { this.nodes.clear(); }
    };
    try {
        await withPreview(async (host, _ports, client) => {
            const svg = host.querySelector('.pc-example-preview'), observer = observers.find(item => item.nodes.has(svg));
            assert.ok(svg && observer);
            assert.equal(svg.querySelectorAll('.pc-example-card').length, 0, 'Offscreen shells do not retain detailed thumbnail DOM');
            observer.callback([{ target: svg, isIntersecting: true }]); client.flushSync(); await client.tick();
            assert.equal(svg.querySelectorAll('.pc-example-card').length, 2);
            observer.callback([{ target: svg, isIntersecting: false }]); client.flushSync(); await client.tick();
            assert.equal(svg.querySelectorAll('.pc-example-card').length, 0);
        });
    } finally { globalThis.IntersectionObserver = original; }
});

test('example pin colors consume typed theme tokens with their ordinary color fallbacks', async () => {
    await withPreview(host => {
        for (const [kind, expected] of [
            ['context', 'var(--pc-kind-context, #f0e442)'], ['text', 'var(--pc-kind-text, #e69f00)'],
            ['data', 'var(--pc-kind-data, #56b4e9)'], ['guidance', 'var(--pc-kind-guidance, #cc79a7)'],
            ['draft', 'var(--pc-kind-draft, #7fd8c5)'],
            ['patches', 'var(--pc-kind-patches, #ed8956)'], ['candidate', 'var(--pc-kind-candidate, #b49af2)'],
        ]) {
            const dot = host.querySelector(`.pc-example-pin-cue[data-kind="${kind}"]`);
            assert.equal(getComputedStyle(dot).getPropertyValue('--pc-pin-color').replace(/\s+/g, ''), expected.replace(/\s+/g, ''), `${kind} inherits its preset pin color`);
        }
    });
});
