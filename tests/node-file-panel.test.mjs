import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { compiled } from './helpers/svelte-compile.mjs';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const key of ['Node', 'Element', 'Text', 'Comment', 'Document', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const { mount, unmount, flushSync, tick } = await import(new URL('../node_modules/svelte/src/index-client.js', import.meta.url).href);
const selection = { documentNamespace: 'document-a', selectionKey: 'notes-details', revision: 'revision1', address: { workflowId: 'root', instancePath: [], nodeId: 'notes' } };
const settings = { bindingId: 'binding-a', name: 'notes.txt', format: 'text', missing: 'create', content: 'Starting notes', visibility: { kind: 'public' } };
const model = extra => ({ operation: 'read-file', mode: 'source', destinationMode: 'own', settings: structuredClone(settings), available: true, supported: true, legacy: false, ...extra });
async function fixture(initial = model(), actions = {}, options = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'lattice-node-file-panel-')), host = document.createElement('div'); document.body.append(host); let mounted;
    const close = async () => { if (mounted) await unmount(mounted); host.remove(); const scope = relative(resolve(tmpdir()), resolve(directory)); assert.ok(scope && !scope.startsWith('..') && !isAbsolute(scope)); await rm(directory, { recursive: true, force: true }); };
    try {
        const leaf = await compiled('NodeFile', directory);
        const harness = await compiled('NodeFileHarness', directory, `<script>import Leaf from ${JSON.stringify(pathToFileURL(leaf.path).href)}; let { initial, actions, options } = $props(); let model = $state.raw(initial), selection = $state.raw(options.selection), disabled = $state(options.disabled ?? false); export function update(next, nextSelection = selection, nextDisabled = disabled) { model = next; selection = nextSelection; disabled = nextDisabled; }</script><Leaf {model} {selection} {actions} {disabled} />`);
        mounted = mount(harness.component, { target: host, props: { initial, actions, options: { selection, ...options } } }); flushSync();
        return { host, update(next, nextSelection, nextDisabled) { mounted.update(next, nextSelection, nextDisabled); flushSync(); }, close };
    } catch (error) { await close(); throw error; }
}
const field = (host, label) => { const value = host.querySelector(`[aria-label="${label}"]`); assert.ok(value, `Missing ${label}`); return value; };
const edit = (host, label, value, event = 'input') => { const element = field(host, label); element.value = value; element.dispatchEvent(new dom.window.Event(event, { bubbles: true })); flushSync(); };
const settle = async () => { await tick(); flushSync(); };

test('file settings save the authored values without selecting or writing a disk file', async () => {
    const saves = [], choices = [], f = await fixture(model(), { saveNodeFile(captured, next) { saves.push([captured, next]); return { ok: true }; }, chooseNodeFile(...args) { choices.push(args); return Promise.resolve({ ok: true }); } });
    try {
        assert.ok(f.host.querySelector('[data-node-file]'));
        assert.equal(f.host.querySelector('[data-node-file] details'), null, 'file settings are visible immediately');
        assert.equal(field(f.host, 'Filename').value, 'notes.txt');
        edit(f.host, 'Filename', 'travel.jsonl'); edit(f.host, 'File format', 'jsonl', 'change'); edit(f.host, 'Missing file', 'error', 'change'); edit(f.host, 'Initial file content', '{"day":1}'); edit(f.host, 'File visibility', 'actor-private', 'change');
        assert.equal(f.host.querySelector('[data-save-node-file]').disabled, true, 'private data requires an actor');
        edit(f.host, 'File actor ID', ' mara ');
        assert.doesNotMatch(f.host.querySelector('[data-file-status]').textContent, /File selected|Ready/);
        f.host.querySelector('[data-save-node-file]').click(); await settle();
        assert.deepEqual(saves, [[selection, { bindingId: 'binding-a', name: 'travel.jsonl', format: 'jsonl', missing: 'error', content: '{"day":1}', visibility: { kind: 'actor-private', actorId: 'mara' } }]]);
        assert.deepEqual(choices, []);
        assert.match(f.host.textContent, /choose.*location/i, 'renaming cannot claim the existing binding is ready');
    } finally { await f.close(); }
});

test('file pickers receive the current draft and start directly from the click', async () => {
    const requests = [], f = await fixture(model({ settings: { ...settings, bindingId: '' } }), { chooseNodeFile(captured, request) { requests.push([captured, request]); return Promise.resolve({ ok: true }); } });
    try {
        edit(f.host, 'Filename', 'campaign.md'); edit(f.host, 'File format', 'markdown', 'change');
        const choose = f.host.querySelector('[data-choose-node-file="save"]');
        assert.match(choose.id, /^pc-node-details-fileTarget-/);
        choose.click();
        assert.equal(requests.length, 1, 'the native picker must begin in the click gesture'); flushSync();
        assert.equal(f.host.querySelector('[data-save-node-file]').textContent, 'Save file settings', 'choosing a file is distinct from saving settings');
        assert.deepEqual(requests[0], [selection, { mode: 'save', settings: { ...settings, bindingId: '', name: 'campaign.md', format: 'markdown' } }]);
        await settle();
        f.host.querySelector('[data-choose-node-file="open"]').click(); await settle();
        assert.equal(requests[1][1].mode, 'open');
        assert.equal(requests[1][1].settings.name, 'campaign.md');
        assert.doesNotMatch(f.host.querySelector('[data-file-status]').textContent, /File selected|Ready/, 'the canonical model must confirm a chosen binding');
    } finally { await f.close(); }
});

test('a connected write destination stays inherited until its destination mode is explicitly changed', async () => {
    const changes = [], writes = [], f = await fixture(model({ operation: 'write-file', mode: 'inherited', destinationMode: 'connected', summary: 'Connected document: campaign.md' }), { editControls(...args) { changes.push(args); return { ok: true }; }, saveNodeFile(...args) { writes.push(args); return { ok: true }; }, chooseNodeFile(...args) { writes.push(args); return Promise.resolve({ ok: true }); } });
    try {
        assert.match(f.host.textContent, /Connected document: campaign.md/);
        assert.equal(f.host.querySelector('[aria-label="Filename"]'), null);
        assert.equal(f.host.querySelector('[data-choose-node-file]'), null);
        edit(f.host, 'File destination', 'own', 'change'); await settle();
        assert.deepEqual(changes, [[selection, { destinationMode: 'own' }]]);
        assert.deepEqual(writes, []);
        f.update(model({ operation: 'clock-commit', mode: 'inherited', summary: 'Uses the Story Clock file' }));
        assert.match(f.host.textContent, /Uses the Story Clock file/);
        assert.equal(f.host.querySelector('[aria-label="File destination"]'), null);
    } finally { await f.close(); }
});

test('legacy migration and unsupported native access remain explicit and cannot call a picker', async () => {
    const choices = [], f = await fixture(model({ supported: false, legacy: true, issue: 'Native picker unavailable', settings: { ...settings, bindingId: '' } }), { chooseNodeFile(...args) { choices.push(args); return Promise.resolve({ ok: true }); } });
    try {
        assert.match(f.host.textContent, /existing chat/i);
        assert.match(f.host.textContent, /preserved/i);
        assert.match(f.host.textContent, /native file access/i);
        for (const button of f.host.querySelectorAll('[data-choose-node-file]')) { assert.equal(button.disabled, true); button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }
        await settle(); assert.deepEqual(choices, []);
        assert.equal(field(f.host, 'Initial file content').value, 'Starting notes');
    } finally { await f.close(); }
});

test('model or selection changes reset drafts and prevent a stale picker failure from landing', async () => {
    let resolveChoice; const f = await fixture(model(), { chooseNodeFile: () => new Promise(resolve => { resolveChoice = resolve; }), saveNodeFile: () => ({ ok: false, error: { code: 'SAVE', message: 'Try another name' } }) });
    try {
        edit(f.host, 'Initial file content', 'Draft A'); f.host.querySelector('[data-save-node-file]').click(); await settle(); assert.match(f.host.textContent, /Try another name/);
        f.update(model({ settings: { ...settings, name: 'refreshed.txt', content: 'Refreshed' } }));
        assert.equal(field(f.host, 'Initial file content').value, 'Refreshed'); assert.doesNotMatch(f.host.textContent, /Try another name/);
        f.host.querySelector('[data-choose-node-file="open"]').click(); flushSync();
        const nextSelection = { ...selection, selectionKey: 'other-details', revision: 'revision2', address: { ...selection.address, nodeId: 'other' } };
        f.update(model({ settings: { ...settings, bindingId: '', name: 'other.txt', content: 'Other' } }), nextSelection);
        resolveChoice({ ok: false, error: { code: 'OLD_PICKER', message: 'Obsolete picker failure' } }); await settle();
        assert.equal(field(f.host, 'Filename').value, 'other.txt'); assert.equal(field(f.host, 'Initial file content').value, 'Other'); assert.doesNotMatch(f.host.textContent, /Obsolete picker failure|Try another name/);
        assert.equal(f.host.querySelector('[data-choose-node-file="open"]').disabled, false);
    } finally { await f.close(); }
});

test('unavailable and disabled panels reject raw events and retire in-flight feedback', async () => {
    let rejectSave; const changes = [], f = await fixture(model({ operation: 'write-file', mode: 'destination' }), { chooseNodeFile(...args) { changes.push(args); return Promise.resolve({ ok: true }); }, editControls(...args) { changes.push(args); return { ok: true }; }, saveNodeFile: () => new Promise((_resolve, reject) => { rejectSave = reject; }) });
    try {
        edit(f.host, 'Initial file content', 'Pending'); f.host.querySelector('[data-save-node-file]').click(); flushSync();
        f.update(model({ operation: 'write-file', mode: 'destination' }), selection, true);
        rejectSave(new Error('Obsolete save failure')); await settle(); assert.doesNotMatch(f.host.textContent, /Obsolete save failure/);
        edit(f.host, 'Filename', 'forged.txt'); edit(f.host, 'File destination', 'connected', 'change');
        for (const button of f.host.querySelectorAll('[data-choose-node-file]')) button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        await settle(); assert.deepEqual(changes, []);
        f.update(model({ available: false }), selection, false);
        assert.equal(field(f.host, 'Filename').disabled, true); assert.equal(f.host.querySelector('[data-choose-node-file="save"]').disabled, true);
    } finally { await f.close(); }
});


test('schema data files keep JSON metadata when their initial content is edited', async () => {
    for (const operation of ['story-clock', 'commit-outcomes', 'random-pick']) {
        const saves = [], f = await fixture(model({ operation, settings: { ...settings, name: 'state.json', format: 'json', content: '{}' } }), { saveNodeFile(captured, next) { saves.push([captured, next]); return { ok: true }; } });
        try {
            const displayed = field(f.host, 'File format');
            assert.equal(displayed.tagName, 'OUTPUT', operation + ' exposes its required format without a format selector');
            assert.equal(displayed.textContent, 'JSON');
            displayed.value = 'csv'; displayed.dispatchEvent(new dom.window.Event('change', { bubbles: true })); flushSync();
            edit(f.host, 'Initial file content', '{"revision":1}');
            f.host.querySelector('[data-save-node-file]').click(); await settle();
            assert.deepEqual(saves, [[selection, { ...settings, name: 'state.json', format: 'json', content: '{"revision":1}' }]]);
        } finally { await f.close(); }
    }
});
