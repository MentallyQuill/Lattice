import assert from 'node:assert/strict';
import { test } from 'node:test';
const authoring = await import('../src/ui/json-value-authoring.js').catch(() => ({}));

test('own literal keys update without changing ancestors or treating punctuation as paths', () => {
    assert.equal(typeof authoring.updateJsonValueAtPath, 'function');
    const initial = { 'a.b': { 'red, blue': [0, false, null, ''] } };
    const result = authoring.updateJsonValueAtPath(initial, ['a.b', 'red, blue', 0], { action: 'set', value: 3 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.value, { 'a.b': { 'red, blue': [3, false, null, ''] } });
    assert.deepEqual(initial, { 'a.b': { 'red, blue': [0, false, null, ''] } });
});

test('own prototype-like keys are isolated and absent parents never resolve inherited fields', () => {
    const result = authoring.updateJsonValueAtPath({}, ['__proto__'], { action: 'set', value: { polluted: true } });
    assert.equal(result.ok, true);
    assert.equal(Object.hasOwn(result.data.value, '__proto__'), true);
    assert.deepEqual(result.data.value.__proto__, { polluted: true });
    assert.equal({}.polluted, undefined);
    assert.equal(Object.getPrototypeOf(result.data.value), Object.prototype);
    assert.equal(authoring.updateJsonValueAtPath({}, ['constructor', 'prototype'], { action: 'set', value: false }).ok, false);
    const getter = {}; Object.defineProperty(getter, 'x', { enumerable: true, get() { throw Error('invoked'); } });
    assert.equal(authoring.updateJsonValueAtPath(getter, ['x'], { action: 'set', value: 0 }).ok, false);
});

test('array edits keep indices distinct from string keys and never create holes', () => {
    assert.deepEqual(authoring.updateJsonValueAtPath([0, false], [0], { action: 'remove' }), { ok: true, data: { value: [false] } });
    assert.deepEqual(authoring.updateJsonValueAtPath([], [0], { action: 'set', value: null }), { ok: true, data: { value: [null] } });
    assert.equal(authoring.updateJsonValueAtPath([], [1], { action: 'set', value: 0 }).ok, false);
    assert.equal(authoring.updateJsonValueAtPath([0], ['0'], { action: 'set', value: 1 }).ok, false);
    assert.deepEqual(authoring.updateJsonValueAtPath({}, ['0'], { action: 'set', value: '' }), { ok: true, data: { value: { '0': '' } } });
    for (const value of [0, false, null, '', {}, []]) assert.deepEqual(authoring.updateJsonValueAtPath('before', [], { action: 'set', value }), { ok: true, data: { value } });
});

test('typed edits enforce finite values and shared JSON byte, depth and node budgets', () => {
    for (const value of [Infinity, NaN, undefined, new Date(), 'x'.repeat(262145), Array.from({length:10000}, () => null)]) assert.equal(authoring.updateJsonValueAtPath({}, ['x'], { action: 'set', value }).ok, false);
    let tooDeep = null; for (let index = 0; index < 33; index++) tooDeep = [tooDeep];
    assert.equal(authoring.updateJsonValueAtPath({}, ['x'], { action: 'set', value: tooDeep }).ok, false);
    let depth32 = null; for (let index = 0; index < 32; index++) depth32 = [depth32];
    assert.equal(authoring.updateJsonValueAtPath(null, [], { action: 'set', value: depth32 }).ok, true);
    assert.equal(authoring.updateJsonValueAtPath({}, ['x'], { action: 'set', value: depth32 }).ok, false);
    assert.equal(authoring.updateJsonValueAtPath(null, [], { action: 'remove' }).ok, false);
});

test('path admission only enables numeric indices for explicitly mixed consumers', () => {
    assert.equal(typeof authoring.validateJsonPath, 'function');
    assert.deepEqual(authoring.validateJsonPath(['a.b', 'red, blue', '__proto__', '0']), { ok: true, data: { value: ['a.b', 'red, blue', '__proto__', '0'] } });
    assert.equal(authoring.validateJsonPath(['items', 0]).ok, false);
    assert.deepEqual(authoring.validateJsonPath(['items', 0], { allowIndices: true }), { ok: true, data: { value: ['items', 0] } });
    for (const value of [[-1], [0.5], [Infinity], [false], {}]) assert.equal(authoring.validateJsonPath(value, { allowIndices: true }).ok, false);
});

import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const clientURL = new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href;
const { mount, unmount, flushSync } = await import(clientURL);
async function compiled(name, directory, source) {
    const output = compile(source, { filename: name + '.svelte', generate: 'client', css: 'injected' });
    assert.deepEqual(output.warnings.filter(warning => warning.code.startsWith('a11y')), []);
    let code = output.js.code.replace(/(['"])(svelte(?:\/[^'"]*)?)\1/g, (_, quote, specifier) => JSON.stringify(specifier === 'svelte' ? clientURL : import.meta.resolve(specifier)));
    code = code.replace(/from\s+(['"])(\.\.[^'"]+)\1/g, (_, quote, specifier) => 'from ' + JSON.stringify(new URL(specifier, new URL('../ui/', import.meta.url)).href));
    const path = join(directory, name + '.mjs'); await writeFile(path, code, 'utf8');
    return { path, component: (await import(pathToFileURL(path).href)).default };
}
async function fixture(name, initial, check, extra = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-json-authoring-')), host = document.createElement('div'); document.body.append(host);
    let mounted;
    try {
        const source = await readFile(new URL('../ui/' + name + '.svelte', import.meta.url), 'utf8').catch(() => null);
        assert.ok(source, name + ' needs a typed editor');
        const leaf = await compiled(name, directory, source);
        const harness = await compiled('Harness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, options } = $props(); let value = $state(initial); let changes = $state([]); let invalids = $state([]); export function read(){return {value,changes:[...changes],invalids:[...invalids]};} function onchange(next){value=next;changes=[...changes,next];} function oninvalid(text){invalids=[...invalids,text];}</script><Leaf {value} {onchange} {oninvalid} {...options} label="Test" idPrefix="json-test" />`);
        mounted = mount(harness.component, { target: host, props: { initial, options: extra } }); flushSync();
        await check({ host, read: () => mounted.read() });
    } finally {
        if (mounted) await unmount(mounted); host.remove();
        const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && scope.startsWith('lattice-json-authoring-') && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true });
    }
}
function input(host, label, value, type = 'input') {
    const element = host.querySelector(`[aria-label="${label}"]`); assert.ok(element, `Missing ${label}`);
    if (element.type === 'checkbox') element.checked = value; else element.value = value;
    element.dispatchEvent(new dom.window.Event(type, { bubbles: true })); flushSync(); return element;
}
function click(host, label) { const element = host.querySelector(`button[aria-label="${label}"]`); assert.ok(element, `Missing ${label}`); element.click(); flushSync(); return element; }

test('path segments retain exact keys and provide indices only when the consumer permits them', async () => {
    await fixture('JsonPathControl', ['a.b', 'red, blue', '__proto__', '0'], async f => {
        assert.equal(f.host.querySelector('option[value="index"]'), null);
        input(f.host, 'Test segment 1 key', 'red, blue'); click(f.host, 'Move Test segment 4 up');
        assert.deepEqual(f.read().value, ['red, blue', 'red, blue', '0', '__proto__']);
        click(f.host, 'Add Test key'); input(f.host, 'Test segment 5 key', '');
        assert.deepEqual(f.read().value, ['red, blue', 'red, blue', '0', '__proto__', '']);
    });
    await fixture('JsonPathControl', ['items', 0], async f => {
        assert.ok(f.host.querySelector('option[value="index"]'));
        input(f.host, 'Test segment 2 index', '2');
        assert.deepEqual(f.read().value, ['items', 2]);
        input(f.host, 'Test segment 2 index', ''); click(f.host, 'Move Test segment 2 up');
        assert.equal(f.host.querySelector('[aria-label="Test segment 1 index"]').value, '');
        assert.deepEqual(f.read().value, ['items', 2]);
        assert.ok(f.read().invalids.length);
        input(f.host, 'Test segment 1 index', '0'); assert.deepEqual(f.read().value, [0, 'items']);
    }, { allowIndices: true });
});

test('value types remain editable through null, structured values and falsy scalars', async () => {
    await fixture('JsonValueControl', null, async f => {
        assert.equal(f.host.querySelector('[aria-label="Test type"]').value, 'null');
        for (const [type, expected] of [['object', {}], ['array', []], ['number', 0], ['boolean', false], ['string', ''], ['null', null]]) {
            input(f.host, 'Test type', type, 'change'); assert.deepEqual(f.read().value, expected);
            assert.ok(f.host.querySelector('[aria-label="Test type"]'));
        }
        input(f.host, 'Test type', 'number', 'change'); input(f.host, 'Test number', '-');
        assert.equal(f.host.querySelector('[aria-label="Test number"]').value, '-'); assert.equal(f.read().value, 0);
        assert.ok(f.read().invalids.includes('-'));
        click(f.host, 'Edit Test as JSON'); assert.equal(f.host.querySelector('[aria-label="Test JSON"]').value, '-');
        click(f.host, 'Edit Test as typed value'); assert.equal(f.host.querySelector('[aria-label="Test number"]').value, '-');
        input(f.host, 'Test number', '0'); assert.equal(f.read().value, 0);
        input(f.host, 'Test number', '1e400'); assert.equal(f.read().value, 0);
        input(f.host, 'Test number', '2'); assert.equal(f.read().value, 2);
    });
});

test('typed object and array tree edits preserve own keys and emit actual values', async () => {
    await fixture('JsonValueControl', {}, async f => {
        for (const key of ['a.b', 'red, blue', '__proto__', '0']) {
            input(f.host, 'Test new key', key); click(f.host, 'Add Test property');
        }
        assert.deepEqual(f.read().value, { 'a.b': null, 'red, blue': null, ['__proto__']: null, '0': null });
        click(f.host, 'Edit Test key __proto__'); input(f.host, 'Test type', 'object', 'change');
        input(f.host, 'Test new key', 'polluted'); click(f.host, 'Add Test property');
        click(f.host, 'Edit Test key polluted'); input(f.host, 'Test type', 'boolean', 'change'); input(f.host, 'Test boolean', true, 'change');
        assert.equal({}.polluted, undefined); assert.deepEqual(f.read().value.__proto__, { polluted: true });
        click(f.host, 'Back Test'); click(f.host, 'Back Test'); click(f.host, 'Edit Test key a.b');
        input(f.host, 'Test type', 'array', 'change'); click(f.host, 'Add Test item');
        click(f.host, 'Edit Test index 0'); input(f.host, 'Test type', 'number', 'change'); input(f.host, 'Test number', '0');
        click(f.host, 'Back Test'); click(f.host, 'Add Test item'); click(f.host, 'Move Test index 1 up');
        assert.deepEqual(f.read().value['a.b'], [null, 0]);
        click(f.host, 'Remove Test index 0'); assert.deepEqual(f.read().value['a.b'], [0]);
        assert.equal(typeof f.read().value, 'object'); assert.equal(typeof f.read().value['a.b'][0], 'number');
    });
});

test('over-budget scalar text remains an invalid draft rather than silently saving the old value', async () => {
    await fixture('JsonValueControl', '', async f => {
        const tooLarge = 'x'.repeat(262145);
        input(f.host, 'Test string', tooLarge);
        assert.equal(f.read().value, ''); assert.equal(f.read().changes.length, 0);
        assert.equal(f.read().invalids.length, 1);
        assert.equal(f.host.querySelector('[aria-label="Test string"]').value, tooLarge);
        click(f.host, 'Edit Test as JSON'); assert.equal(f.host.querySelector('[aria-label="Test JSON"]').value, JSON.stringify(tooLarge));
        input(f.host, 'Test JSON', '"repaired"'); assert.equal(f.read().value, 'repaired');
    });
});

test('large trees paginate children and typed edits never parse JSON or encode stored values twice', async () => {
    await fixture('JsonValueControl', Array.from({ length: 129 }, (_, index) => index), async f => {
        assert.equal(f.host.querySelectorAll('.child').length, 64);
        click(f.host, 'Next Test children'); assert.equal(f.host.querySelectorAll('.child').length, 64);
        click(f.host, 'Next Test children'); assert.equal(f.host.querySelectorAll('.child').length, 1);
        click(f.host, 'Edit Test index 128');
        const parse = JSON.parse; JSON.parse = () => { throw Error('Typed edits must not parse JSON'); };
        try { input(f.host, 'Test type', 'object', 'change'); input(f.host, 'Test new key', 'a.b'); click(f.host, 'Add Test property'); }
        finally { JSON.parse = parse; }
        assert.deepEqual(f.read().value[128], { 'a.b': null });
        assert.ok(f.read().changes.every(value => Array.isArray(value)));
    });
});

test('disabled typed and advanced controls reject forced events', async () => {
    for (const [name, initial, label, next, type] of [
        ['JsonPathControl', ['before'], 'Test segment 1 key', 'after', 'input'],
        ['JsonValueControl', 0, 'Test number', '2', 'input'],
        ['JsonValueControl', null, 'Test type', 'object', 'change'],
        ['JsonValueControl', {}, 'Test new key', '__proto__', 'input'],
    ]) await fixture(name, initial, async f => {
        for (const editor of f.host.querySelectorAll('input,select,textarea,button')) assert.equal(editor.disabled, true);
        input(f.host, label, next, type);
        for (const button of f.host.querySelectorAll('button')) button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        flushSync(); assert.deepEqual(f.read().value, initial); assert.equal(f.read().changes.length, 0); assert.equal(f.read().invalids.length, 0);
    }, { disabled: true });
});

test('Condition projects one json-value comparison descriptor through null and every JSON type', async () => {
    const { describeControl } = await import('../src/workflow/operations/control-nodes.js');
    const { projectNodeControls } = await import('../src/ui/node-control-projection.js');
    for (const value of [null, {}, [], '', false, 0, { ['__proto__']: [0, false] }]) {
        const described = describeControl({ type: 'workflow', operation: 'condition', value });
        assert.equal(described.ok, true);
        assert.equal(described.data.descriptor.controlDescriptors.value?.type, 'json-value');
        assert.deepEqual(described.data.descriptor.controlDescriptors.value.default, value);
        const projected = projectNodeControls('condition', { value }, { phase: 'pre' }).find(control => control.key === 'value');
        assert.ok(projected); assert.equal(projected.editor, 'json'); assert.deepEqual(projected.value, value);
    }
});

test('unfinished nested source is inserted at its exact own path without changing retained JSON', () => {
    assert.equal(typeof authoring.formatJsonValueDraftAtPath, 'function');
    const value = [{ name: 'x', path: ['a.b', 0], default: { ['__proto__']: { 'red, blue': 0 } } }];
    const draft = authoring.formatJsonValueDraftAtPath(value, [0, 'default', '__proto__', 'red, blue'], '-');
    assert.equal(draft.ok, true);
    assert.equal(draft.data.text, '[{"name":"x","path":["a.b",0],"default":{"__proto__":{"red, blue":-}}}]');
    assert.throws(() => JSON.parse(draft.data.text)); assert.equal(value[0].default.__proto__['red, blue'], 0);
    assert.equal(authoring.formatJsonValueDraftAtPath({}, ['constructor', 'prototype'], '-').ok, false);
});
