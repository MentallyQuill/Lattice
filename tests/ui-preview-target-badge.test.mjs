import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
const { mount, unmount, flushSync, tick } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
const actions = { hostResult() {}, hoverPin() {}, group() {} };
const card = (id, compact = false) => ({
    id, x: 30, y: 40, w: compact ? 64 : 180, type: 'native',
    className: `pc-node pc-node-native${compact ? ' pc-node-compact' : ''}`,
    title: id, titleHint: id, label: 'Compose', iconPath: 'M4 4h16v16H4z',
    body: null, ports: [], compact, hostResult: false, enabled: true,
    modifierSummary: { count: 1, labels: ['Transform'], text: 'Transform' },
});
async function fixture(name, props) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-preview-target-'));
    const host = document.createElement('div');
    document.body.append(host);
    let mounted;
    const close = async () => {
        if (mounted) await unmount(mounted);
        host.remove();
        const path = resolve(directory), rel = relative(resolve(tmpdir()), path);
        assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
        await rm(path, { recursive: true, force: true });
    };
    try {
        const leaf = await compiled(name, directory);
        mounted = mount(leaf.component, { target: host, props });
        flushSync();
        await tick();
        return { host, mounted, close };
    } catch (error) { await close(); throw error; }
}

for (const compact of [false, true]) test(`target indicator is accessible on ${compact ? 'compact' : 'ordinary'} cards`, async () => {
    const f = await fixture('NodeCard', { card: card('compose', compact), actions, targeted: true });
    try {
        const node = f.host.querySelector('[data-id="compose"]');
        const badge = node.querySelector('[aria-label="Targeted node"]');
        assert.ok(badge, 'targeted cards identify the preview target');
        assert.equal(badge.getAttribute('role'), 'img');
        assert.equal(badge.getAttribute('title'), 'Preview target');
        assert.ok(badge.querySelector('svg'));
        assert.equal(node.dataset.previewTarget, 'true');
        assert.equal(node.querySelector('.pc-modifier-badge').textContent, '+1');
    } finally { await f.close(); }
});

test('cards without a target do not display a target indicator', async () => {
    const f = await fixture('NodeCard', { card: card('compose'), actions });
    try {
        assert.equal(f.host.querySelector('[aria-label="Targeted node"]'), null);
        assert.equal(f.host.querySelector('[data-preview-target]'), null);
    } finally { await f.close(); }
});

test('moving and clearing the preview target preserves cards and marks only the target', async () => {
    const f = await fixture('CanvasLayer', { actions });
    try {
        f.mounted.setNodes([card('ordinary'), card('compact', true)]);
        flushSync();
        const original = [...f.host.querySelectorAll('.pc-node')];
        assert.equal(typeof f.mounted.setPreviewTarget, 'function', 'canvas layer exposes preview target updates');
        for (const id of ['ordinary', 'compact', null]) {
            f.mounted.setPreviewTarget(id);
            flushSync();
            const current = [...f.host.querySelectorAll('.pc-node')];
            assert.equal(current.length, original.length);
            current.forEach((node, index) => assert.equal(node, original[index], 'target changes preserve retained node elements'));
            assert.deepEqual([...f.host.querySelectorAll('[data-preview-target]')].map(node => node.dataset.id), id ? [id] : []);
            assert.equal(f.host.querySelectorAll('[aria-label="Targeted node"]').length, id ? 1 : 0);
        }
    } finally { await f.close(); }
});
