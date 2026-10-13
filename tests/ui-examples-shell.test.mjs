import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true, url: 'https://lattice.test' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLMediaElement', 'MutationObserver', 'localStorage']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
const { mount, unmount, flushSync, tick } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
const frameTask = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

async function fixture(check) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-examples-shell-')), host = document.createElement('div'); document.body.append(host);
    let instance, refreshes = 0, context = 0; const opens = [];
    try {
        const leaf = await compiled('Workbench', directory);
        instance = mount(leaf.component, { target: host, props: { actions: {
            setEnabled() {}, command() {}, mode() {}, zoom() {}, fitSelection() {},
            captureExampleContext() { return context; },
            exampleContextCurrent(value) { return value === context; },
            refreshExamples() { refreshes++; },
            openExample(id) { opens.push(id); return true; },
        } } });
        flushSync(); await tick();
        await check({ host, instance, opens, refreshes: () => refreshes, invalidateContext: () => context++ });
    } finally {
        if (instance) await unmount(instance); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory));
        assert.ok(scope && scope.startsWith('lattice-examples-shell-') && !scope.startsWith('..') && !isAbsolute(scope));
        await rm(directory, { recursive: true, force: true });
    }
}

function openExamples(host) {
    [...host.querySelectorAll('button')].find(button => button.textContent === 'File').click();
    flushSync();
    host.querySelector('[role="menuitem"][aria-label="Open examples…"]').click();
    flushSync();
    return host.querySelector('[role="dialog"][aria-label="Examples"]');
}

test('Examples paints a busy shell before refresh and closing it cancels pending catalog work', async () => {
    await fixture(async ({ host, refreshes }) => {
        const dialog = openExamples(host);
        assert.ok(dialog, 'The Examples shell mounts in the opening task');
        assert.equal(refreshes(), 0, 'Catalog work waits until after the shell has a paint opportunity');
        assert.equal(dialog.querySelector('.pc-examples-grid').getAttribute('aria-busy'), 'true');
        assert.match(dialog.textContent, /Loading examples/);
        dialog.querySelector('[aria-label="Close panel"]').click();
        flushSync();
        await frameTask(); await tick(); flushSync();
        assert.equal(refreshes(), 0, 'Closing the overlay invalidates its pending refresh');
        assert.equal(host.querySelector('[role="dialog"][aria-label="Examples"]'), null);
    });
});

test('an open Examples shell clears its busy state after the deferred refresh', async () => {
    await fixture(async ({ host, refreshes }) => {
        const dialog = openExamples(host);
        assert.equal(refreshes(), 0);
        await frameTask(); await frameTask(); await tick(); flushSync();
        assert.equal(refreshes(), 1);
        assert.equal(dialog.querySelector('.pc-examples-grid').getAttribute('aria-busy'), 'false');
    });
});

const tile = {
    id: 'lesson-test', number: 1, title: 'Deferred lesson', goal: 'Paint before opening', searchText: 'deferred lesson paint before opening', issue: '',
    thumbnail: {
        bounds: { x: 0, y: 0, w: 100, h: 60 }, groups: [], comments: [], wires: [],
        nodes: [{ id: 'node', x: 0, y: 0, w: 100, h: 32, title: 'Node', className: 'pc-node-native', iconPath: '', body: null, compact: false, ports: [] }],
    },
};

test('closing or superseding Examples during the choice paint yield prevents stale activation', async () => {
    for (const action of ['close', 'supersede']) await fixture(async ({ host, instance, opens }) => {
        instance.update({ examples: [tile] }); flushSync();
        const dialog = openExamples(host);
        await frameTask(); await frameTask(); await tick(); flushSync();
        dialog.querySelector('.pc-example-tile').click(); flushSync();
        assert.deepEqual(opens, [], `${action}: document activation waits for the busy state to paint`);
        assert.equal(dialog.querySelector('.pc-examples-grid').getAttribute('aria-busy'), 'true');
        if (action === 'close') dialog.querySelector('[aria-label="Close panel"]').click();
        else {
            [...host.querySelectorAll('button')].find(button => button.textContent === 'Help').click(); flushSync();
            host.querySelector('[role="menuitem"][aria-label="Workspace guide"]').click();
        }
        flushSync(); await frameTask(); await frameTask(); await tick(); flushSync();
        assert.deepEqual(opens, [], `${action}: stale example choice cannot replace the document`);
    });
});

test('controller lifecycle invalidation cancels deferred example refresh and activation', async () => {
    await fixture(async ({ host, instance, opens, refreshes, invalidateContext }) => {
        let dialog = openExamples(host);
        invalidateContext();
        await frameTask(); await frameTask(); await tick(); flushSync();
        assert.equal(refreshes(), 0, 'A closed or replaced editor cannot finish cold catalog work');
        assert.equal(host.querySelector('[role="dialog"][aria-label="Examples"]'), null, 'The stale busy overlay is retired without stealing focus');

        instance.update({ examples: [tile] }); flushSync();
        dialog = openExamples(host);
        await frameTask(); await frameTask(); await tick(); flushSync();
        dialog.querySelector('.pc-example-tile').click(); flushSync();
        invalidateContext();
        await frameTask(); await frameTask(); await tick(); flushSync();
        assert.deepEqual(opens, [], 'A closed, reopened, or replaced editor cannot finish a stale example choice');
        assert.equal(host.querySelector('[role="dialog"][aria-label="Examples"]'), null);
    });
});
