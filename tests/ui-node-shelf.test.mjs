import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLMediaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const client = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync, tick } = await import(client);
const click = async element => { element.click(); flushSync(); await tick(); flushSync(); };
const keys = async (element, key) => { element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); flushSync(); await tick(); flushSync(); };
const pointer = async (element, type, x, y) => {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    element.dispatchEvent(event); flushSync(); await tick(); flushSync();
};
const initial = { native: true, families: [
    { name: 'Shaping', operations: [{ id: 'smart-compactor', title: 'Smart Compactor', phase: 'pre', compatible: true }, { id: 'response-plan', title: 'Response Plan', phase: 'pre', compatible: true }] },
    { name: 'Output', operations: [{ id: 'guidance', title: 'Guidance', phase: 'pre', compatible: true }, { id: 'apply-reply', title: 'Apply Reply', phase: 'post', compatible: false }] },
] };

test('a populated Transpose family opens and dispatches its checked creation choice', async () => {
    const calls = [], choices = [{ id: 'operation:style-transfer', label: 'Style Transfer', family: 'Transpose', phase: 'post', purpose: 'Reference voice', shortcode: 'st', ports: [] }];
    await fixture({ view: initial, choices, choose: id => calls.push(id) }, async host => {
        const family = host.querySelector('[data-family="Transpose"]');
        assert.equal(family.disabled, false);
        await click(family);
        assert.deepEqual([...host.querySelectorAll('[data-shelf-choice]')].map(row => row.dataset.shelfChoice), ['operation:style-transfer']);
        assert.equal(host.querySelector('[data-subfamily]'), null);
        await click(host.querySelector('[data-shelf-choice="operation:style-transfer"]'));
        assert.deepEqual(calls, ['operation:style-transfer']);
    });
});
async function fixture(props, check) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-node-shelf-')), host = document.createElement('div');
    host.className = 'pc-canvas-area'; host.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1024, bottom: 600, width: 1024, height: 600 });
    Object.defineProperty(host, 'clientWidth', { value: 1024 }); Object.defineProperty(host, 'clientHeight', { value: 600 }); document.body.append(host);
    let instance;
    try {
        const source = await readFile(new URL('../ui/NodeShelf.svelte', import.meta.url), 'utf8'), output = compile(source, { filename: 'NodeShelf.svelte', generate: 'client', css: 'injected' });
        assert.deepEqual(output.warnings.filter(warning => warning.code.startsWith('a11y')), []);
        const code = output.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? client : import.meta.resolve(specifier))).replace(/(['"])(\.\.\/src\/[^'"]+)\1/g, (_, quote, specifier) => JSON.stringify(new URL(specifier, new URL('../ui/NodeShelf.svelte', import.meta.url)).href));
        const file = join(directory, 'shelf.mjs'); await writeFile(file, code);
        const wrapper = compile(`<script>import Shelf from ${JSON.stringify(pathToFileURL(file).href)}; let { initial } = $props(); let props = $state.raw(initial); let shelf; export function update(next) { props = {...props, ...next}; } export function openSearch() { return shelf.openSearch(); }</script><Shelf {...props} bind:this={shelf} />`, { filename: 'ShelfHarness.svelte', generate: 'client' });
        const wrapperCode = wrapper.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? client : import.meta.resolve(specifier)));
        const wrapperFile = join(directory, 'ShelfHarness.mjs'); await writeFile(wrapperFile, wrapperCode);
        instance = mount((await import(pathToFileURL(wrapperFile).href)).default, { target: host, props: { initial: props } }); flushSync(); await tick(); await check(host, instance);
    } finally {
        if (instance) await unmount(instance); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && scope.startsWith('lattice-node-shelf-') && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true });
    }
}
test('families directly expose canonical nodes with individual icons and shortcodes', async () => {
    const calls = [];
    await fixture({ view: initial, add: (...args) => calls.push(args) }, async host => {
        await click(host.querySelector('[data-family="Shaping"]'));
        assert.equal(host.querySelectorAll('[data-family]').length, 8);
        assert.deepEqual([...host.querySelectorAll('[data-shelf-choice]')].map(row => row.dataset.shelfChoice), ['smart-compactor', 'response-plan']);
        assert.equal(host.querySelectorAll('.pc-shelf-menu').length, 1);
        assert.equal(host.querySelector('.pc-family-menu').getAttribute('aria-label'), 'Shaping nodes');
        assert.equal(host.querySelector('[data-subfamily], .pc-sub-chevron'), null);
        const node = host.querySelector('[data-shelf-choice="smart-compactor"]'); assert.ok(node.querySelector('svg')); assert.equal(node.querySelector('small').textContent, 'cp');
        await click(node); assert.deepEqual(calls, [['smart-compactor']]); assert.equal(host.querySelector('.pc-family-menu'), null);
    });
});

test('shelf menus survive equal-scope status updates and close when insertion context changes', async () => {
    const choices = [{ id: 'operation:compose', label: 'Compose', family: 'Shaping', phase: 'pre' }], view = { ...initial, graphId: 'current' };
    await fixture({ view, choices, choose() {}, add() {}, readOnly: false }, async (host, instance) => {
        await click(host.querySelector('[data-family="Shaping"]'));
        const menu = host.querySelector('.pc-family-menu'), focus = document.activeElement;
        instance.update({ view: { ...view, status: 'Saved recovery draft' }, choices: choices.map(choice => ({ ...choice })), readOnly: false }); flushSync(); await tick(); flushSync();
        assert.equal(host.querySelector('.pc-family-menu'), menu, 'camera/document status refresh keeps the browsing menu');
        assert.equal(menu.isConnected, true); assert.equal(document.activeElement, focus);
        for (const changed of [{ view: { ...view, graphId: 'other-document' } }, { choices: choices.map(choice => ({ ...choice, label: 'Compose renamed' })) }, { choices: [...choices, { id: 'operation:text', label: 'Text', family: 'Shaping', phase: 'pre' }] }, { readOnly: true }]) {
            instance.update({ view, choices, readOnly: false }); flushSync(); await tick(); flushSync();
            await click(host.querySelector('[data-family="Shaping"]')); assert.ok(host.querySelector('.pc-family-menu'));
            instance.update(changed); flushSync(); await tick(); flushSync(); assert.equal(host.querySelector('.pc-family-menu'), null, 'an actual insertion context change cancels its menu');
        }
    });
});
test('dragging a shelf choice dispatches its canvas drop point once and clears the dragging cursor', async () => {
    const calls = [], choices = [{ id: 'operation:compose', label: 'Compose', family: 'Shaping', phase: 'pre' }];
    await fixture({ view: initial, choices, choose: (...args) => calls.push(args), add() {} }, async host => {
        const canvas = document.createElement('div'); canvas.className = 'pc-canvas-host'; host.prepend(canvas);
        const hitTest = document.elementFromPoint; document.elementFromPoint = () => canvas;
        try {
            await click(host.querySelector('[data-family="Shaping"]'));
            const button = host.querySelector('[data-shelf-choice="operation:compose"]');
            await pointer(button, 'pointerdown', 150, 90);
            await pointer(window, 'pointermove', 600, 300);
            assert.equal(document.body.classList.contains('pc-shelf-dragging'), true);
            assert.deepEqual(calls, [], 'No node is created before release');
            await pointer(window, 'pointerup', 600, 300);
            assert.deepEqual(calls, [['operation:compose', { x: 600, y: 300 }]]);
            assert.equal(document.body.classList.contains('pc-shelf-dragging'), false);
            assert.equal(host.querySelector('.pc-family-menu'), null);
        } finally { document.elementFromPoint = hitTest; }
    });
});
test('pointer cancellation cleans up a shelf drag and a now-disabled choice cannot be dropped', async () => {
    for (const cancel of [true, false]) {
        const calls = [], choice = { id: 'operation:compose', label: 'Compose', family: 'Shaping', phase: 'pre' };
        await fixture({ view: initial, choices: [choice], choose: (...args) => calls.push(args), add() {} }, async host => {
            const canvas = document.createElement('div'); canvas.className = 'pc-canvas-host'; host.prepend(canvas);
            const hitTest = document.elementFromPoint; document.elementFromPoint = () => canvas;
            try {
                await click(host.querySelector('[data-family="Shaping"]'));
                const button = host.querySelector('[data-shelf-choice="operation:compose"]');
                await pointer(button, 'pointerdown', 150, 90); await pointer(window, 'pointermove', 600, 300);
                if (cancel) await pointer(window, 'pointercancel', 600, 300);
                else choice.disabledReason = 'Insertion is no longer available.';
                await pointer(window, 'pointerup', 600, 300);
                button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, detail: 1 })); flushSync();
                assert.deepEqual(calls, []);
                assert.equal(document.body.classList.contains('pc-shelf-dragging'), false);
                assert.equal(host.querySelector('.pc-shelf-drag-preview'), null);
            } finally { document.elementFromPoint = hitTest; }
        });
    }
});
test('shelf keyboard traversal owns focus and an incompatible phase cannot dispatch through a raw click', async () => {
    const calls = [];
    await fixture({ view: initial, add: (...args) => calls.push(args) }, async host => {
        const family = host.querySelector('[data-family="Output"]'); await keys(family, 'ArrowRight');
        assert.equal(document.activeElement.dataset.shelfChoice, 'guidance');
        await keys(document.activeElement, 'End'); assert.equal(document.activeElement.dataset.shelfChoice, 'guidance');
        await keys(document.activeElement, 'ArrowLeft'); assert.equal(document.activeElement, family);
        assert.equal(host.querySelector('.pc-family-menu'), null); await keys(family, 'ArrowRight');
        const incompatible = host.querySelector('[data-shelf-choice="apply-reply"]'); assert.equal(incompatible.disabled, true);
        incompatible.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); flushSync(); assert.deepEqual(calls, []);
        await keys(host.querySelector('.pc-family-menu'), 'Escape'); assert.equal(document.activeElement, family);
    });
});
test('saved subgraphs and interface nodes use separate shelf groups without a manager item', async () => {
    const calls = [], choices = [
        { id: 'operation:compose:input', label: 'Compose · Input', family: 'Shaping', phase: 'pre', purpose: 'Named text', shortcode: 'coi', ports: [] },
        { id: 'boundary:input', label: 'Input', family: 'Subgraphs', phase: 'pre', disabledReason: 'Open a subgraph to add an input.', ports: [] },
        { id: 'boundary:output', label: 'Output', family: 'Subgraphs', phase: 'pre', disabledReason: 'Open a subgraph to add an output.', ports: [] },
        { id: 'definition:exact-pin', label: 'Saved cleanup', family: 'Subgraphs', phase: 'pre', shortcode: 'sg', definitionRef: { id: 'cleanup', version: 2, semanticHash: 'abc' }, ports: [] },
        { id: 'definition:other-pin', label: 'Another cleanup', family: 'Subgraphs', phase: 'pre', shortcode: 'sg', definitionRef: { id: 'other', version: 1, semanticHash: 'def' }, ports: [] },
    ];
    await fixture({ view: initial, choices, choose: id => calls.push(id), add: () => assert.fail('Catalog choices use the checked producer') }, async host => {
        await click(host.querySelector('[data-family="Subgraphs"]'));
        assert.deepEqual([...host.querySelectorAll('[data-shelf-choice]')].map(row => row.dataset.shelfChoice), ['boundary:input', 'boundary:output', 'definition:exact-pin', 'definition:other-pin']);
        assert.deepEqual([...host.querySelectorAll('[data-shelf-group]')].map(row => row.textContent.trim()), ['Interface', 'Library']);
        for (const id of ['boundary:input', 'boundary:output']) { const button = host.querySelector('[data-shelf-choice="' + id + '"]'); assert.equal(button.disabled, true); assert.match(button.title, /Open a subgraph/); button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }
        assert.deepEqual(calls, []);
        await click(host.querySelector('[data-shelf-choice="definition:exact-pin"]')); assert.deepEqual(calls, ['definition:exact-pin']);
        await click(host.querySelector('[data-family="Subgraphs"]')); assert.equal(host.querySelector('[data-shelf-manage]'), null);
    });
    await fixture({ view: initial, choices, readOnly: true, choose: id => calls.push(id), add: () => assert.fail('Read-only creation') }, async host => {
        await click(host.querySelector('[data-family="Shaping"]'));
        const button = host.querySelector('[data-shelf-choice="operation:compose:input"]'); assert.equal(button.disabled, true);
        button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); flushSync(); assert.deepEqual(calls, ['definition:exact-pin']);
    });
});

test('saved shelf entries have explicit Delete and Open menus even inside a read-only body', async () => {
    const calls = [], choice = { id: 'definition:cleanup', label: 'Cleanup', family: 'Subgraphs', phase: 'pre', definitionRef: { id: 'cleanup', version: 1, semanticHash: 'abc' } };
    await fixture({ view: initial, choices: [choice], readOnly: true, choose: () => assert.fail('Right-click cannot insert a subgraph'), add() {}, shelfSubgraph: (...args) => calls.push(args) }, async (host, instance) => {
        await click(host.querySelector('[data-family="Subgraphs"]'));
        const row = host.querySelector('[data-shelf-choice="definition:cleanup"]');
        assert.equal(row.disabled, false); assert.equal(row.getAttribute('aria-disabled'), 'false', 'available context actions must remain accessible in a read-only graph');
        assert.equal(row.getAttribute('data-insertion-disabled'), 'true');
        await click(row); assert.deepEqual(calls, [], 'a shelf action row cannot insert into a read-only graph');
        row.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 120 })); flushSync(); await tick(); flushSync();
        const menu = () => host.querySelector('[role="menu"][aria-label="Cleanup actions"]'); assert.ok(menu());
        const openMenu = menu(), focus = document.activeElement;
        instance.update({ view: { ...initial, status: 'Saved recovery draft' }, choices: [{ ...choice, definitionRef: { ...choice.definitionRef } }] }); flushSync(); await tick(); flushSync();
        assert.equal(menu(), openMenu, 'status refresh preserves the saved-subgraph action menu'); assert.equal(document.activeElement, focus);
        const remove = menu().querySelector('[data-shelf-subgraph-action="delete"]'); assert.equal(remove.disabled, false); await click(remove);
        assert.deepEqual(calls, [['definition:cleanup', 'delete']]); assert.equal(menu(), null);
        await click(host.querySelector('[data-family="Subgraphs"]'));
        await keys(host.querySelector('[data-shelf-choice="definition:cleanup"]'), 'ContextMenu');
        assert.ok(menu()); assert.equal(document.activeElement.dataset.shelfSubgraphAction, 'open');
        await keys(document.activeElement, 'Escape'); assert.equal(menu(), null);
        await keys(host.querySelector('[data-shelf-choice="definition:cleanup"]'), 'ContextMenu');
        await click(menu().querySelector('[data-shelf-subgraph-action="open"]')); assert.deepEqual(calls.at(-1), ['definition:cleanup', 'open']);
    });
});

test('saved shelf menus dismiss on outside click and reject actions for entries removed since opening', async () => {
    const calls = [], choices = [{ id: 'definition:cleanup', label: 'Cleanup', family: 'Subgraphs', phase: 'pre', definitionRef: { id: 'cleanup', version: 1, semanticHash: 'abc' } }];
    await fixture({ view: initial, choices, choose() {}, add() {}, shelfSubgraph: (...args) => calls.push(args) }, async host => {
        await click(host.querySelector('[data-family="Subgraphs"]'));
        await keys(host.querySelector('[data-shelf-choice="definition:cleanup"]'), 'ContextMenu');
        document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); flushSync();
        assert.equal(host.querySelector('[data-shelf-subgraph-action]'), null);
        await click(host.querySelector('[data-family="Subgraphs"]'));
        await keys(host.querySelector('[data-shelf-choice="definition:cleanup"]'), 'ContextMenu');
        const remove = host.querySelector('[data-shelf-subgraph-action="delete"]'); choices.splice(0);
        remove.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); flushSync(); assert.deepEqual(calls, []);
    });
});
test('hover opens aligned drawers without stealing focus and Escape cancels deferred opening', async () => {
    await fixture({ view: initial, add: () => assert.fail('Browsing cannot create nodes') }, async host => {
        const focus = document.createElement('input'); host.append(focus); focus.focus();
        const family = host.querySelector('[data-family="Shaping"]'); family.dispatchEvent(new dom.window.MouseEvent('pointerenter')); flushSync(); await tick();
        assert.equal(document.activeElement, focus);
        assert.ok(host.querySelector('[data-shelf-choice="smart-compactor"]')); assert.equal(document.activeElement, focus);
        await keys(host.querySelector('.pc-family-menu'), 'Escape'); assert.equal(host.querySelector('.pc-family-menu'), null);
        family.dispatchEvent(new dom.window.MouseEvent('pointerenter')); flushSync();
        await keys(family, 'Escape'); assert.equal(host.querySelector('.pc-family-menu'), null); assert.equal(document.activeElement, family);
    });
});
test('a current disabled catalog entry rejects a raw event from its previously enabled shelf button', async () => {
    const calls = [], choice = { id: 'operation:compose', label: 'Compose', family: 'Shaping', phase: 'pre', shortcode: 'co' };
    await fixture({ view: initial, choices: [choice], choose: id => calls.push(id), add() {} }, async host => {
        await click(host.querySelector('[data-family="Shaping"]'));
        const button = host.querySelector('[data-shelf-choice="operation:compose"]'); assert.ok(button); assert.equal(button.disabled, false);
        choice.disabledReason = 'The current scope no longer permits insertion.';
        button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); flushSync(); assert.deepEqual(calls, []);
    });
});

test('dismissal cancels deferred focus and family replacement opens its direct node menu', async () => {
    await fixture({ view: initial, add: () => assert.fail('Navigation cannot create nodes') }, async host => {
        const output = host.querySelector('[data-family="Output"]');
        output.click(); flushSync();
        output.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); flushSync();
        await tick(); flushSync();
        assert.equal(host.querySelector('.pc-family-menu'), null); assert.equal(document.activeElement, output);

        output.click(); flushSync();
        const shaping = host.querySelector('[data-family="Shaping"]'); shaping.click(); flushSync();
        await tick(); flushSync();
        assert.equal(host.querySelector('.pc-family-menu').getAttribute('aria-label'), 'Shaping nodes');
        assert.equal(document.activeElement.dataset.shelfChoice, 'smart-compactor');
        document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); flushSync();
        assert.equal(host.querySelector('.pc-family-menu'), null);
        await click(output); await keys(document.activeElement, 'Tab'); assert.equal(host.querySelector('.pc-family-menu'), null);
    });
});

const presetChoices = [
    { id: 'operation:reflect:recall', label: 'Reflect · Recall', family: 'Introspection', phase: 'pre', shortcode: 'rfr', searchAliases: ['remember'] },
    { id: 'operation:reflect:scene', label: 'Reflect · Scene', family: 'Introspection', phase: 'pre', shortcode: 'rfs' },
    { id: 'operation:reflect', label: 'Reflect', family: 'Introspection', phase: 'pre', shortcode: 'rf' },
    { id: 'operation:json-decode', label: 'JSON Decode', family: 'Derive', phase: 'post', shortcode: 'jd' },
    { id: 'operation:json-decode:check', label: 'JSON Decode · Check', family: 'Derive', phase: 'post', shortcode: 'jdc' },
    ...['Text', 'TextList', 'Bool', 'Number', 'Json', 'PatchList', 'Any'].map(kind => ({ id: 'operation:reroute:' + kind, label: 'Reroute · ' + kind, family: 'Shaping', phase: 'pre', shortcode: 'rt' + kind[0] })),
];
test('historical preset choices collapse to one base operation while creation uses the checked ID', async () => {
    const calls = [];
    const view = { ...initial, families: [...initial.families, { name: 'Introspection', operations: [{ id: 'reflect', title: 'Reflection', phase: 'pre', compatible: true }] }] };
    await fixture({ view, choices: presetChoices, choose: id => calls.push(id), add() {} }, async host => {
        for (const [family, id, label, shortcode] of [
            ['Introspection', 'operation:reflect', 'Reflect', 'rf'],
            ['Derive', 'operation:json-decode', 'JSON Decode', 'jd'],
            ['Shaping', 'operation:reroute:Text', 'Reroute', 'rt'],
        ]) {
            await click(host.querySelector('[data-family="' + family + '"]'));
            const rows = [...host.querySelectorAll('[data-shelf-choice]')]; assert.equal(rows.length, 1);
            assert.equal(rows[0].dataset.shelfChoice, id); assert.equal(rows[0].querySelector('.pc-catalog-name').textContent, label);
            assert.equal(rows[0].querySelector('small').textContent, shortcode);
            await click(rows[0]); assert.equal(calls.at(-1), id);
        }
    });
});
test('shelf search matches historical mode and kind aliases without duplicating operation rows', async () => {
    await fixture({ view: initial, choices: presetChoices, choose() {}, add() {} }, async (host, instance) => {
        await instance.openSearch(); flushSync();
        assert.equal(host.querySelectorAll('[data-shelf-choice]').length, 3);
        const input = host.querySelector('input[aria-label="Search nodes"]'); assert.equal(document.activeElement, input);
        for (const [query, id] of [['scene', 'operation:reflect'], ['remember', 'operation:reflect'], ['check', 'operation:json-decode'], ['number', 'operation:reroute:Text']]) {
            input.value = query; input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); flushSync(); await tick();
            assert.deepEqual([...host.querySelectorAll('[data-shelf-choice]')].map(row => row.dataset.shelfChoice), [id]);
        }
        await keys(input, 'Escape'); assert.equal(host.querySelector('.pc-shelf-menu'), null);
    });
});
