import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { OPERATIONS } from '../src/workflow/catalog.js?v=0.27.1';
import { PALETTE_GROUPS, paletteForOperation } from '../src/ui/node-palette.js';
import { prepareWorkspaceViews, projectEditorDraw } from '../src/ui/workspace-preparation.js?v=0.27.1';
import { createGraphViewSession } from '../src/ui/graph-view-session.js?v=0.27.1';
import { siblingWorkflow } from './fixtures/workflow-prepared-fixture.mjs';
import { compiled } from './helpers/svelte-compile.mjs';

const operations = Object.keys(OPERATIONS);
const fallback = paletteForOperation('unknown-operation-for-icon-contract').icon;

test('all 75 active operations have explicit purpose icons instead of the common cube fallback', () => {
    assert.equal(operations.length, 75, 'The complete active catalog is covered');
    assert.deepEqual(operations.filter(id => !paletteForOperation(id).icon || paletteForOperation(id).icon === fallback), [], 'Operations missing a purpose icon');
});

test('active operation icons are distinct across the complete catalog', () => {
    const byIcon = new Map();
    for (const id of operations) {
        const icon = paletteForOperation(id).icon;
        byIcon.set(icon, [...(byIcon.get(icon) ?? []), id]);
    }
    assert.deepEqual([...byIcon.values()].filter(ids => ids.length > 1), [], 'Operations sharing the same glyph');
});

test('rendered shelf boundary choices use distinct input and output icons', async () => {
    const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
    for (const key of ['window', 'document', 'Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLMediaElement', 'MutationObserver']) {
        Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? dom.window : key === 'document' ? dom.window.document : dom.window[key] });
    }
    const { mount, unmount, flushSync, tick } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
    const directory = await mkdtemp(join(tmpdir(), 'lattice-shelf-icon-contract-'));
    const host = document.createElement('div'); host.className = 'pc-canvas-area'; document.body.append(host);
    let instance;
    try {
        const { component } = await compiled('NodeShelf', directory);
        instance = mount(component, { target: host, props: { choices: [
            { id: 'boundary:input', label: 'Input', family: 'Subgraphs', phase: 'pre' },
            { id: 'boundary:output', label: 'Output', family: 'Subgraphs', phase: 'pre' },
        ], choose() {} } });
        flushSync();
        host.querySelector('[data-family="Subgraphs"]').click(); flushSync(); await tick(); flushSync();
        const icon = direction => host.querySelector(`[data-shelf-choice="boundary:${direction}"] svg path`)?.getAttribute('d');
        const input = icon('input'), output = icon('output');
        assert.ok(input && output, 'Both boundary choices are rendered');
        assert.notEqual(input, output, 'Input and Output must be distinguishable on the shelf');
        assert.equal(input, paletteForOperation('subgraph-input').icon);
        assert.equal(output, paletteForOperation('subgraph-output').icon);
        assert.notEqual(input, PALETTE_GROUPS.Library.icon);
        assert.notEqual(output, PALETTE_GROUPS.Library.icon);
    } finally {
        if (instance) await unmount(instance);
        host.remove(); dom.window.close();
        assert.ok(isAbsolute(directory) && directory.startsWith(join(tmpdir(), 'lattice-shelf-icon-contract-')));
        await rm(directory, { recursive: true, force: true });
    }
});

test('prepared native boundary cards retain their distinct directional icons', () => {
    const root = siblingWorkflow(), prepared = prepareWorkspaceViews(root);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    const created = createGraphViewSession({ root, activationId: 'boundary-icon-contract', ...prepared.data });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.data.openInstance(['second']).ok, true);
    const cards = projectEditorDraw(created.data.readEditor()).nativeCards;
    assert.notEqual(cards.entry.iconPath, cards.exit.iconPath, 'Input and Output cards must be distinguishable');
    assert.equal(cards.entry.iconPath, paletteForOperation('subgraph-input').icon);
    assert.equal(cards.exit.iconPath, paletteForOperation('subgraph-output').icon);
    assert.notEqual(cards.entry.iconPath, PALETTE_GROUPS.Library.icon);
    assert.notEqual(cards.exit.iconPath, PALETTE_GROUPS.Library.icon);
});
